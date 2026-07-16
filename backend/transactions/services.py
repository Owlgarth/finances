"""Business logic for the transactions app."""

from __future__ import annotations

from collections import Counter, defaultdict
from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Count, F, Sum, Value
from django.db.models.functions import Coalesce, Lower

from accounts.models import Account
from accounts.services import AccountService
from budgeting.services import PeriodService
from categories.models import Category
from common.enums import TotalsLabel
from core.schemas.pagination import DEFAULT_PAGE_SIZE, paginate_queryset
from currencies.models import Currency
from transactions.exceptions import (
    AccountRequiredError,
    TransactionAccountArchivedError,
    TransactionAdjustmentCategoryError,
    TransactionAmountInvalidError,
    TransactionBulkAccountError,
    TransactionBulkCurrencyError,
    TransactionCategoryNotFoundError,
    TransactionImportError,
    TransactionNotFoundError,
    TransactionOriginalCurrencyError,
)
from transactions.models import Transaction, TransactionItem
from transactions.schemas import TransactionCreate, TransactionImport


class TransactionService:
    @staticmethod
    def _resolve_account(workspace_id: int, account_id: int | None, allow_archived: bool = False) -> Account:
        """Resolve the target account, defaulting when exactly one active account exists.

        allow_archived permits editing a transaction whose account was archived
        after the fact — retargeting to an archived account is rejected by the
        caller comparing account ids.
        """
        if account_id is not None:
            account = AccountService.get(account_id, workspace_id)
        else:
            account = AccountService.single_active_account(workspace_id)
            if not account:
                raise AccountRequiredError()
        if account.is_archived and not allow_archived:
            raise TransactionAccountArchivedError()
        return account

    @staticmethod
    def _validate_category(category_id: int | None, workspace_id: int) -> Category | None:
        """Return the category, or raise if missing, in another workspace, or archived."""
        if not category_id:
            return None
        category = Category.objects.for_workspace(workspace_id).select_related('budget').filter(id=category_id).first()
        if not category or category.is_archived:
            raise TransactionCategoryNotFoundError()
        return category

    @staticmethod
    def _validate_type_amount(trans_type: str, amount: Decimal, category_id: int | None) -> None:
        """Enforce type semantics: positive income/expense, signed non-zero uncategorized adjustment."""
        if trans_type == 'adjustment':
            if amount == 0:
                raise TransactionAmountInvalidError()
            if category_id is not None:
                raise TransactionAdjustmentCategoryError()
        elif amount <= 0:
            raise TransactionAmountInvalidError()

    @staticmethod
    def _resolve_original_currency(workspace_id: int, account: Account, code: str | None) -> Currency | None:
        """Resolve the original-facet currency: catalog global or this workspace's custom rows.

        Must differ from the account currency — the facet only records what was
        paid in another currency; the settled amount drives all math.
        """
        if code is None:
            return None
        currency = (
            Currency.objects.filter(workspace__isnull=True, code=code).first()
            or Currency.objects.filter(workspace_id=workspace_id, code=code).first()
        )
        if not currency:
            raise TransactionOriginalCurrencyError(f'Original currency {code} not found in the catalog')
        if currency.code == account.currency.code:
            raise TransactionOriginalCurrencyError('Original currency must differ from the account currency')
        return currency

    @staticmethod
    def _touch_period(user, category: Category | None, target_date) -> None:
        """Lazily materialize the period the transaction lands in (category set only)."""
        if category:
            PeriodService.get_or_create_for_date(user, category.budget, target_date)

    @staticmethod
    def _resolve_display_descriptions(queryset) -> dict[str, str]:
        """Map lowercase descriptions to the most common original casing.

        Returns a dict mapping lowercase description → display (most common casing).
        """
        rows = queryset.values_list('description', flat=True)
        lower_groups: dict[str, list[str]] = {}
        for desc in rows:
            key = desc.lower()
            lower_groups.setdefault(key, []).append(desc)

        return {key: Counter(variants).most_common(1)[0][0] for key, variants in lower_groups.items()}

    @staticmethod
    def _build_filtered_queryset(
        workspace_id: int,
        date_from=None,
        date_to=None,
        account_id: list | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        transaction_type: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
    ):
        """Build a filtered queryset for transactions."""
        queryset = Transaction.objects.for_workspace(workspace_id)

        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        if account_id:
            queryset = queryset.filter(account_id__in=account_id)
        if category_id:
            queryset = queryset.filter(category_id__in=category_id)
        if budget_id:
            queryset = queryset.filter(category__budget_id__in=budget_id)
        if transaction_type:
            queryset = queryset.filter(type__in=transaction_type)
        if search:
            queryset = queryset.filter(description__icontains=search)
        if amount_gte is not None:
            queryset = queryset.filter(amount__gte=amount_gte)
        if amount_lte is not None:
            queryset = queryset.filter(amount__lte=amount_lte)

        return queryset

    @staticmethod
    def get_transaction(transaction_id: int, workspace_id: int) -> Transaction:
        """Get a transaction and verify it belongs to the workspace."""
        trans = (
            Transaction.objects.select_related('account__currency', 'category', 'original_currency')
            .for_workspace(workspace_id)
            .filter(id=transaction_id)
            .first()
        )
        if not trans:
            raise TransactionNotFoundError()
        return trans

    @staticmethod
    def list(
        workspace_id: int,
        date_from=None,
        date_to=None,
        account_id: list | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        transaction_type: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
        ordering: str | None = None,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> dict:
        """List transactions for a workspace with optional filters and pagination."""
        queryset = TransactionService._build_filtered_queryset(
            workspace_id=workspace_id,
            date_from=date_from,
            date_to=date_to,
            account_id=account_id,
            category_id=category_id,
            budget_id=budget_id,
            transaction_type=transaction_type,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        )

        queryset = queryset.select_related('account__currency', 'category', 'original_currency')

        sort_order = ordering or '-date'
        queryset = queryset.order_by(sort_order, '-created_at')

        items, total, page, page_size, total_pages = paginate_queryset(queryset, page, page_size)
        return {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        }

    @staticmethod
    def totals(
        workspace_id: int,
        date_from=None,
        date_to=None,
        account_id: list | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        transaction_type: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
        group_by: str = 'type',
    ) -> list[dict]:
        """Aggregated totals grouped by (type, currency) or (category, currency).

        Adjustments are excluded — they affect balances, never income/expense reporting.
        """
        queryset = TransactionService._build_filtered_queryset(
            workspace_id=workspace_id,
            date_from=date_from,
            date_to=date_to,
            account_id=account_id,
            category_id=category_id,
            budget_id=budget_id,
            transaction_type=transaction_type,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        ).exclude(type='adjustment')

        if group_by == 'category':
            rows = (
                queryset.annotate(
                    currency_code=F('account__currency__code'),
                    grouped_category_name=Coalesce('category__name', Value(str(TotalsLabel.UNCATEGORIZED))),
                )
                .values('grouped_category_name', 'currency_code')
                .annotate(total=Sum('amount'))
                .order_by('grouped_category_name', 'currency_code')
            )
            return [
                {'group': r['grouped_category_name'], 'currency': r['currency_code'], 'total': r['total']} for r in rows
            ]

        # Default: group by type
        rows = (
            queryset.annotate(currency_code=F('account__currency__code'))
            .values('type', 'currency_code')
            .annotate(total=Sum('amount'))
            .order_by('type', 'currency_code')
        )
        return [{'group': r['type'], 'currency': r['currency_code'], 'total': r['total']} for r in rows]

    @staticmethod
    def totals_combined(
        workspace_id: int,
        date_from=None,
        date_to=None,
        account_id: list | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        transaction_type: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
    ) -> dict:
        """Get both type and category totals in a single DB query.

        Returns {'by_type': [...], 'by_category': [...]}. Adjustments excluded.
        """
        queryset = TransactionService._build_filtered_queryset(
            workspace_id=workspace_id,
            date_from=date_from,
            date_to=date_to,
            account_id=account_id,
            category_id=category_id,
            budget_id=budget_id,
            transaction_type=transaction_type,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        ).exclude(type='adjustment')

        rows = queryset.annotate(
            currency_code=F('account__currency__code'),
            grouped_category_name=Coalesce('category__name', Value(str(TotalsLabel.UNCATEGORIZED))),
        ).values_list('type', 'grouped_category_name', 'currency_code', 'amount')

        type_map: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
        cat_map: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))

        for trans_type, category, curr, amount in rows:
            type_map[trans_type][curr] += amount
            cat_map[category][curr] += amount

        by_type = [
            {'group': t, 'currency': c, 'total': total}
            for t in sorted(type_map)
            for c, total in sorted(type_map[t].items())
        ]
        by_category = [
            {'group': cat, 'currency': c, 'total': total}
            for cat in sorted(cat_map)
            for c, total in sorted(cat_map[cat].items())
        ]
        return {'by_type': by_type, 'by_category': by_category}

    @staticmethod
    def frequent_descriptions(
        workspace_id: int,
        transaction_type: list | None = None,
        limit: int = 10,
    ) -> dict:
        """Return the most frequent transaction descriptions grouped by lowercase + currency.

        The `description` field uses the most common original casing for each group.
        """
        queryset = TransactionService._build_filtered_queryset(
            workspace_id=workspace_id,
            transaction_type=transaction_type,
        ).exclude(type='adjustment')

        display_map = TransactionService._resolve_display_descriptions(queryset)

        rows = (
            queryset.annotate(lower_desc=Lower('description'), currency_code=F('account__currency__code'))
            .values('lower_desc', 'currency_code')
            .annotate(count=Count('id'), total=Sum('amount'))
            .order_by('-count')[:limit]
        )

        items = [
            {
                'description': display_map.get(r['lower_desc'], r['lower_desc']),
                'count': r['count'],
                'total': r['total'],
                'currency': r['currency_code'],
            }
            for r in rows
        ]
        return {'items': items}

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: TransactionCreate) -> Transaction:
        """Create a transaction on an account, lazily materializing the derived period."""
        account = TransactionService._resolve_account(workspace_id, data.account_id)
        TransactionService._validate_type_amount(data.type, data.amount, data.category_id)
        category = TransactionService._validate_category(data.category_id, workspace_id)
        original_currency = TransactionService._resolve_original_currency(
            workspace_id, account, data.original_currency_code
        )

        trans = Transaction.objects.create(
            workspace_id=workspace_id,
            account=account,
            date=data.date,
            description=data.description,
            category=category,
            amount=data.amount,
            type=data.type,
            original_amount=data.original_amount,
            original_currency=original_currency,
            created_by=user,
            updated_by=user,
        )
        TransactionService._touch_period(user, category, data.date)
        return trans

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, transaction_id: int, data: TransactionCreate) -> Transaction:
        """Fully replace a transaction; account/category/date changes re-derive the period.

        Editing a transaction whose account was archived since is allowed, but
        retargeting to an archived account is rejected.
        """
        trans = TransactionService.get_transaction(transaction_id, workspace_id)

        account = TransactionService._resolve_account(
            workspace_id, data.account_id or trans.account_id, allow_archived=True
        )
        if account.id != trans.account_id and account.is_archived:
            raise TransactionAccountArchivedError()
        TransactionService._validate_type_amount(data.type, data.amount, data.category_id)
        category = TransactionService._validate_category(data.category_id, workspace_id)
        original_currency = TransactionService._resolve_original_currency(
            workspace_id, account, data.original_currency_code
        )

        trans.account = account
        trans.date = data.date
        trans.description = data.description
        trans.category = category
        trans.amount = data.amount
        trans.type = data.type
        trans.original_amount = data.original_amount
        trans.original_currency = original_currency
        trans.updated_by = user
        trans.save()

        TransactionService._touch_period(user, category, data.date)
        return trans

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, transaction_id: int) -> None:
        """Delete a transaction. Balances are computed, so nothing else to revert."""
        from transactions.attachments import AttachmentService

        trans = TransactionService.get_transaction(transaction_id, workspace_id)
        AttachmentService.delete_storage_for_transactions(Transaction.objects.filter(id=trans.id))
        trans.delete()

    @staticmethod
    def list_items(workspace_id: int, transaction_id: int) -> dict:
        """Return a transaction's ordered items and their sum (for the UI mismatch hint)."""
        trans = TransactionService.get_transaction(transaction_id, workspace_id)
        items = list(trans.items.all())
        return {
            'items': items,
            'items_total': TransactionService._items_total(items),
        }

    @staticmethod
    @db_transaction.atomic
    def replace_items(workspace_id: int, transaction_id: int, items_in: list) -> dict:
        """Replace the full ordered item list (add/edit/reorder/delete atomically)."""
        trans = TransactionService.get_transaction(transaction_id, workspace_id)
        trans.items.all().delete()
        items = TransactionItem.objects.bulk_create(
            TransactionItem(
                transaction=trans,
                position=position,
                name=item.name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for position, item in enumerate(items_in)
        )
        return {
            'items': items,
            'items_total': TransactionService._items_total(items),
        }

    @staticmethod
    def _items_total(items) -> Decimal:
        """Sum of line totals, falling back to quantity × unit price per row."""
        total = Decimal('0')
        for item in items:
            if item.line_total is not None:
                total += item.line_total
            elif item.unit_price is not None:
                total += item.quantity * item.unit_price
        return total.quantize(Decimal('0.01'))

    @staticmethod
    @db_transaction.atomic
    def bulk_set_account(user, workspace_id: int, transaction_ids: list[int], account_id: int) -> int:
        """Move transactions to another account in one UPDATE (all-or-nothing).

        The target must share the currency of every moved transaction — a
        transaction's currency IS its account's currency, so a cross-currency
        move would silently reinterpret amounts (and could equal an original
        facet's currency, which must always differ).
        """
        account = AccountService.get(account_id, workspace_id)
        if account.is_archived:
            raise TransactionAccountArchivedError()

        owned = Transaction.objects.for_workspace(workspace_id).filter(id__in=transaction_ids)
        if owned.count() != len(set(transaction_ids)):
            raise TransactionBulkAccountError()
        if owned.exclude(account__currency=account.currency).exists():
            raise TransactionBulkCurrencyError()

        return owned.update(account=account, updated_by=user)

    @staticmethod
    def export(
        workspace_id: int,
        date_from=None,
        date_to=None,
        transaction_type: str | None = None,
    ) -> list[dict]:
        """Return serialisable transaction data filtered by date range."""
        queryset = TransactionService._build_filtered_queryset(
            workspace_id=workspace_id,
            date_from=date_from,
            date_to=date_to,
            transaction_type=[transaction_type] if transaction_type else None,
        ).select_related('account__currency', 'category', 'original_currency')

        return [
            {
                'date': t.date.isoformat(),
                'description': t.description,
                'category_name': t.category_name,
                'amount': str(t.amount),
                'account_name': t.account_name,
                'currency_code': t.currency_code,
                'type': t.type,
                'original_amount': str(t.original_amount) if t.original_amount is not None else None,
                'original_currency_code': t.original_currency_code,
            }
            for t in queryset.order_by('-date')
        ]

    @staticmethod
    @db_transaction.atomic
    def import_data(user, workspace_id: int, account_id: int, data: list, budget_id: int | None = None) -> int:
        """Bulk-create transactions into one explicit account. Returns count of created records.

        Categories are matched by name within budget_id when given, else left null.
        """
        account = TransactionService._resolve_account(workspace_id, account_id)

        category_map: dict[str, int] = {}
        if budget_id is not None:
            category_map = {
                name.lower(): pk
                for pk, name in Category.objects.for_workspace(workspace_id)
                .filter(budget_id=budget_id, is_archived=False)
                .values_list('id', 'name')
            }

        new_transactions = []
        for item in data:
            try:
                import_item = TransactionImport(**item)
            except Exception as e:
                raise TransactionImportError(f'Invalid data format: {e}')

            category_id = None
            if import_item.type != 'income' and import_item.category_name:
                category_id = category_map.get(import_item.category_name.lower())

            new_transactions.append(
                Transaction(
                    workspace_id=workspace_id,
                    account=account,
                    date=import_item.date,
                    description=import_item.description,
                    category_id=category_id,
                    amount=import_item.amount,
                    type=import_item.type,
                    created_by=user,
                    updated_by=user,
                )
            )

        Transaction.objects.bulk_create(new_transactions)
        return len(new_transactions)
