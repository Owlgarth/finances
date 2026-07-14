"""Legacy (v1/v2) GDPR export importer.

All knowledge of the pre-redesign export format lives here and nowhere else
(the main import path is v3-only). Implements design doc §6.1: symbol→ISO
currency mapping, per-currency ``Main <CODE>`` accounts, budget accounts →
budgets, periods → custom periods, category merge, allocations →
category budgets, exchanges → transfers, linked-transaction dedup, and
opening-balance solving, returning a verification report.
"""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction as db_transaction

from accounts.models import Account, AccountType
from accounts.services import AccountService
from budgeting.models import Budget, Cadence, CategoryBudget, Period
from categories.models import Category
from common.exceptions import ValidationError
from currencies.models import Currency, WorkspaceCurrency
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction
from transfers.models import Transfer
from workspaces.models import Role, Workspace, WorkspaceMember

# Default description the old frontend used for auto-created exchange transactions.
_EXCHANGE_DESC_RE = re.compile(r'^currency exchange:\s*.+\s*→\s*.+$', re.IGNORECASE)
# Manual convention, e.g. "PLN to USD".
_CODE_TO_CODE_RE = re.compile(r'^[a-z]{3,8}\s+to\s+[a-z]{3,8}$', re.IGNORECASE)


def _dec(value, warnings: list[str] | None = None, context: str = '') -> Decimal:
    """Parse an exported amount. Unparseable values become 0 — with a warning
    when a collector is given, so the report never silently masks corruption
    (the opening-balance solve would otherwise absorb the difference)."""
    if value is None:
        return Decimal('0')
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        if warnings is not None:
            warnings.append(f'{context}: unparseable amount {value!r} treated as 0')
        return Decimal('0')


def _date(value, context: str = ''):
    """Parse an exported date, or raise a 400 with context — a missing/garbled
    required date would otherwise surface as an opaque 500."""
    if not value:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        raise ValidationError(f'{context or "record"}: invalid date {value!r} (expected YYYY-MM-DD)')


def _required_date(value, context: str):
    parsed = _date(value, context)
    if parsed is None:
        raise ValidationError(f'{context}: date is missing')
    return parsed


class LegacyImportService:
    @staticmethod
    def _normalize_v1(export_data: dict) -> dict:
        """Normalize a v1.x export to the v2 key shape used below.

        v1 used ORM-lookup key names (``category__name``, ``currency__symbol``).
        """
        key_map = {
            'category__name': 'category_name',
            'currency__symbol': 'currency_symbol',
            'from_currency__symbol': 'from_currency_symbol',
            'to_currency__symbol': 'to_currency_symbol',
        }

        def rename(record: dict) -> dict:
            return {key_map.get(k, k): v for k, v in record.items()}

        for ws_data in export_data.get('workspaces', []):
            for acc_data in ws_data.get('budget_accounts', []):
                for period_data in acc_data.get('periods', []):
                    for section in ('budgets', 'transactions', 'planned_transactions', 'currency_exchanges'):
                        period_data[section] = [rename(r) for r in period_data.get(section, [])]
        return export_data

    @staticmethod
    def _map_currency(workspace, symbol: str, name: str | None, cache: dict) -> Currency:
        """Map an exported currency symbol to a catalog currency, enabling it.

        Global ISO rows win; unmappable symbols become workspace-custom rows.
        """
        if symbol in cache:
            return cache[symbol]
        currency = (
            Currency.objects.filter(workspace__isnull=True, code=symbol).first()
            or Currency.objects.filter(workspace=workspace, code=symbol).first()
        )
        if not currency:
            currency = Currency.objects.create(
                code=symbol, name=name or symbol, symbol=symbol, is_custom=True, workspace=workspace
            )
        WorkspaceCurrency.objects.get_or_create(workspace=workspace, currency=currency)
        cache[symbol] = currency
        return currency

    @staticmethod
    def _merge_category(user, workspace, budget, name: str | None, cache: dict, counts: dict):
        """Get-or-merge a category by case-insensitive name within a budget.

        ``cache`` is keyed by lowercase name and shared across the budget's
        periods so period-scoped categories collapse into one persistent row.
        """
        if not name:
            return None
        key = name.lower()
        if key not in cache:
            category, created = Category.objects.get_or_create(
                workspace=workspace,
                budget=budget,
                name__iexact=name,
                defaults={'name': name, 'created_by': user, 'updated_by': user},
            )
            if created:
                counts['categories'] += 1
            cache[key] = category
        return cache[key]

    @staticmethod
    def _get_or_create_account(user, workspace, currency: Currency, cache: dict) -> Account:
        """Idempotently get-or-create the ``Main <CODE>`` account for a currency."""
        code = currency.code
        if code in cache:
            return cache[code]
        account, _ = Account.objects.get_or_create(
            workspace=workspace,
            name=f'Main {code}',
            defaults={
                'type': AccountType.BANK,
                'currency': currency,
                'created_by': user,
                'updated_by': user,
            },
        )
        cache[code] = account
        return account

    @staticmethod
    def _dedup_skip_indices(transactions: list[dict], exchanges: list[dict]) -> tuple[set[int], list[dict]]:
        """Return (indices to skip, deduped descriptors) for linked exchange transactions.

        Each exchange auto-created an expense (from side) and income (to side).
        For each exchange we consume at most one matching expense and one income;
        matched transactions are skipped so the Transfer is not double-counted.
        """
        consumed: set[int] = set()
        deduped: list[dict] = []

        def matches(tx: dict, ex: dict, side: str) -> bool:
            if side == 'from':
                amount, symbol, tx_type = ex.get('from_amount'), ex.get('from_currency_symbol'), 'expense'
            else:
                amount, symbol, tx_type = ex.get('to_amount'), ex.get('to_currency_symbol'), 'income'
            if tx.get('type') != tx_type:
                return False
            if (tx.get('currency_symbol') or symbol) != symbol:
                return False
            if _dec(tx.get('amount')) != _dec(amount):
                return False
            if tx.get('date') != ex.get('date'):
                return False
            desc = (tx.get('description') or '').strip()
            ex_desc = (ex.get('description') or '').strip()
            if ex_desc and desc == ex_desc:
                return True
            code_pair = f'{ex.get("from_currency_symbol")} to {ex.get("to_currency_symbol")}'
            return bool(
                _EXCHANGE_DESC_RE.match(desc) or _CODE_TO_CODE_RE.match(desc) or desc.lower() == code_pair.lower()
            )

        for ex in exchanges:
            for side in ('from', 'to'):
                for idx, tx in enumerate(transactions):
                    if idx in consumed:
                        continue
                    if matches(tx, ex, side):
                        consumed.add(idx)
                        deduped.append(
                            {
                                'date': tx.get('date'),
                                'description': tx.get('description'),
                                'amount': str(_dec(tx.get('amount'))),
                                'type': tx.get('type'),
                                'currency_code': tx.get('currency_symbol'),
                            }
                        )
                        break
        return consumed, deduped

    @staticmethod
    @db_transaction.atomic
    def import_legacy(user, export_data: dict, conflict_strategy: str = 'rename') -> dict:
        """Import a legacy (v1/v2) export; returns a verification report."""
        version = str(export_data.get('export_version', '1.0'))
        if version.startswith('1.'):
            export_data = LegacyImportService._normalize_v1(export_data)

        workspaces_report = []
        renamed: dict[str, str] = {}
        skipped_workspaces: list[str] = []

        for ws_data in export_data.get('workspaces', []):
            original_name = ws_data.get('workspace_name')

            # Conflicts only against workspaces this user can see — a global check
            # would leak other tenants' workspace names via the rename report.
            if Workspace.objects.filter(name=original_name, members__user=user).exists():
                if conflict_strategy == 'skip':
                    skipped_workspaces.append(original_name)
                    continue
                if conflict_strategy == 'rename':
                    new_name = f'{original_name} (imported {datetime.now().strftime("%Y-%m-%d %H:%M")})'
                    renamed[original_name] = new_name
                    original_name = new_name

            workspace = Workspace.objects.create(name=original_name, owner=user)
            WorkspaceMember.objects.create(workspace=workspace, user=user, role=Role.OWNER)
            workspaces_report.append(LegacyImportService._import_workspace(user, workspace, ws_data))

        if workspaces_report:
            user.current_workspace = Workspace.objects.filter(owner=user).order_by('-id').first()
            user.save(update_fields=['current_workspace'])

        return {
            'workspaces': workspaces_report,
            'renamed': renamed,
            'skipped_workspaces': skipped_workspaces,
        }

    @staticmethod
    def _import_workspace(user, workspace, ws_data: dict) -> dict:
        currency_cache: dict[str, Currency] = {}
        account_cache: dict[str, Account] = {}

        # Pre-map declared currencies (keeps names) and provision their accounts.
        for cur_data in ws_data.get('currencies', []):
            currency = LegacyImportService._map_currency(
                workspace, cur_data.get('symbol'), cur_data.get('name'), currency_cache
            )
            LegacyImportService._get_or_create_account(user, workspace, currency, account_cache)

        counts = {'budgets': 0, 'periods': 0, 'categories': 0, 'transactions': 0, 'transfers': 0, 'planned': 0}
        created_budgets: list[Budget] = []
        deduped: list[dict] = []
        parse_warnings: list[str] = []
        # expected final balance per currency = latest period's closing balance
        latest_close: dict[str, tuple] = {}  # code -> (end_date, closing_balance)

        def resolve_currency(symbol: str) -> Currency:
            return LegacyImportService._map_currency(workspace, symbol, None, currency_cache)

        def resolve_account(symbol: str) -> Account:
            currency = resolve_currency(symbol)
            return LegacyImportService._get_or_create_account(user, workspace, currency, account_cache)

        for acc_data in ws_data.get('budget_accounts', []):
            budget, created = Budget.objects.get_or_create(
                workspace=workspace,
                name=acc_data.get('name'),
                defaults={
                    'description': acc_data.get('description'),
                    'cadence': Cadence.MONTHLY,
                    'created_by': user,
                    'updated_by': user,
                },
            )
            if created:
                counts['budgets'] += 1
                created_budgets.append(budget)

            # (budget, ci-name) -> Category, merged across periods.
            category_map: dict[str, Category] = {}

            for period_data in acc_data.get('periods', []):
                period_ctx = f'{budget.name} / period {period_data.get("name")!r}'
                period = Period.objects.create(
                    workspace=workspace,
                    budget=budget,
                    name=period_data.get('name'),
                    start_date=_required_date(period_data.get('start_date'), period_ctx),
                    end_date=_required_date(period_data.get('end_date'), period_ctx),
                    is_custom=True,
                    created_by=user,
                    updated_by=user,
                )
                counts['periods'] += 1

                def get_category(name):
                    return LegacyImportService._merge_category(user, workspace, budget, name, category_map, counts)

                # Merge declared categories first (so allocations/records resolve).
                for cat_data in period_data.get('categories', []):
                    get_category(cat_data.get('name'))

                for alloc in period_data.get('budgets', []):
                    category = get_category(alloc.get('category_name'))
                    if not category:
                        continue
                    CategoryBudget.objects.update_or_create(
                        period=period,
                        category=category,
                        currency=resolve_currency(alloc.get('currency_symbol')),
                        defaults={
                            'workspace_id': workspace.id,
                            'amount': _dec(
                                alloc.get('amount'),
                                parse_warnings,
                                f'{period_ctx} / allocation {alloc.get("category_name")!r}',
                            ),
                            'created_by': user,
                            'updated_by': user,
                        },
                    )

                transactions = period_data.get('transactions', [])
                exchanges = period_data.get('currency_exchanges', [])
                skip_indices, period_deduped = LegacyImportService._dedup_skip_indices(transactions, exchanges)
                deduped.extend(period_deduped)

                for idx, tx in enumerate(transactions):
                    if idx in skip_indices:
                        continue
                    symbol = tx.get('currency_symbol')
                    if not symbol:
                        continue
                    tx_ctx = f'{period_ctx} / transaction {tx.get("description")!r}'
                    tx_type = tx.get('type')
                    if tx_type not in ('income', 'expense', 'adjustment'):
                        parse_warnings.append(f'{tx_ctx}: unknown type {tx_type!r}, skipped')
                        continue
                    account = resolve_account(symbol)
                    category = get_category(tx.get('category_name'))
                    Transaction.objects.create(
                        workspace=workspace,
                        account=account,
                        date=_required_date(tx.get('date'), tx_ctx),
                        description=tx.get('description') or '',
                        amount=_dec(tx.get('amount'), parse_warnings, tx_ctx),
                        type=tx_type,
                        category=category,
                        created_by=user,
                        updated_by=user,
                    )
                    counts['transactions'] += 1

                for pt in period_data.get('planned_transactions', []):
                    symbol = pt.get('currency_symbol')
                    if not symbol:
                        continue
                    pt_ctx = f'{period_ctx} / planned {pt.get("name")!r}'
                    account = resolve_account(symbol)
                    PlannedTransaction.objects.create(
                        workspace=workspace,
                        account=account,
                        name=pt.get('name'),
                        amount=_dec(pt.get('amount'), parse_warnings, pt_ctx),
                        planned_date=_required_date(pt.get('planned_date'), pt_ctx),
                        payment_date=_date(pt.get('payment_date'), pt_ctx),
                        status=pt.get('status', 'pending'),
                        created_by=user,
                        updated_by=user,
                    )
                    counts['planned'] += 1

                for ex in exchanges:
                    from_account = resolve_account(ex.get('from_currency_symbol'))
                    to_account = resolve_account(ex.get('to_currency_symbol'))
                    if from_account.id == to_account.id:
                        continue
                    ex_ctx = f'{period_ctx} / exchange {ex.get("from_currency_symbol")}→{ex.get("to_currency_symbol")}'
                    Transfer.objects.create(
                        workspace=workspace,
                        from_account=from_account,
                        to_account=to_account,
                        from_amount=_dec(ex.get('from_amount'), parse_warnings, ex_ctx),
                        to_amount=_dec(ex.get('to_amount'), parse_warnings, ex_ctx),
                        date=_required_date(ex.get('date'), ex_ctx),
                        description=ex.get('description') or '',
                        created_by=user,
                        updated_by=user,
                    )
                    counts['transfers'] += 1

                # Track latest closing balance per currency for opening-balance solve.
                end_date = period.end_date
                for pb in period_data.get('period_balances', []):
                    symbol = pb.get('currency_symbol')
                    if not symbol:
                        continue
                    code = resolve_currency(symbol).code
                    if code not in latest_close or end_date >= latest_close[code][0]:
                        latest_close[code] = (
                            end_date,
                            _dec(pb.get('closing_balance'), parse_warnings, f'{period_ctx} / closing balance {code}'),
                        )

        # Solve opening balances so computed balances match the exported closings.
        balance_report = []
        for code, account in account_cache.items():
            net = AccountService._transactions_delta(account) + AccountService._transfers_delta(account)
            expected = latest_close[code][1] if code in latest_close else None
            if expected is not None:
                account.opening_balance = expected - net
                account.save(update_fields=['opening_balance'])
            computed = AccountService.balance(account)
            balance_report.append(
                {
                    'currency_code': code,
                    'account_name': account.name,
                    'expected_closing_balance': str(expected) if expected is not None else None,
                    'computed_balance': str(computed),
                    'matches': expected is None or computed == expected,
                }
            )

        warnings = parse_warnings + [
            f'{row["currency_code"]}: computed {row["computed_balance"]} != expected {row["expected_closing_balance"]}'
            for row in balance_report
            if not row['matches']
        ]

        return {
            'workspace_id': workspace.id,
            'workspace_name': workspace.name,
            'created': counts,
            'budgets': [{'id': b.id, 'name': b.name} for b in created_budgets],
            'deduped_transactions': deduped,
            'balances': balance_report,
            'warnings': warnings,
        }
