"""Business logic for the transactions app."""

from __future__ import annotations

from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation

from django.db import transaction as db_transaction
from django.db.models import Count, F, Max, Q, Sum, Value
from django.db.models.functions import Coalesce, Lower
from django.utils import timezone
from django.utils.translation import gettext as _

from accounts.models import Account
from accounts.services import AccountService
from budgeting.services import PeriodService
from categories.models import Category
from common.enums import TotalsLabel
from common.idempotency import IDEMPOTENCY_TTL, create_with_idempotency
from core.schemas.pagination import DEFAULT_PAGE_SIZE, paginate_queryset
from currencies.models import Currency
from currencies.services import CurrencyCatalogService
from transactions.exceptions import (
    TransactionAccountArchivedError,
    TransactionAdjustmentAccountError,
    TransactionAdjustmentCategoryError,
    TransactionAmountInvalidError,
    TransactionAutoManagedError,
    TransactionBulkAccountError,
    TransactionBulkCurrencyError,
    TransactionBulkManagedError,
    TransactionCategoryNotFoundError,
    TransactionCurrencyMismatchError,
    TransactionCurrencyRequiredError,
    TransactionImportError,
    TransactionItemCategoryBudgetError,
    TransactionItemCategoryWithoutTransactionError,
    TransactionItemsOverSumError,
    TransactionNotFoundError,
    TransactionOriginalAccountCurrencyError,
    TransactionOriginalAccountError,
    TransactionOriginalCurrencyError,
)
from transactions.models import Transaction, TransactionIdempotencyKey, TransactionItem
from transactions.schemas import TransactionCreate, TransactionImport

# Effective-value read-side math for TransactionItem aggregates, shared by
# budget actuals (reports) and totals-by-category (totals/totals_combined):
# an item's effective category is its own when set, else its transaction's
# (NULL = inherit); its effective total is line_total, else quantity x
# unit_price, else 0 - mirroring TransactionService._items_total.
EFFECTIVE_CATEGORY_ID = Coalesce(F('category_id'), F('transaction__category_id'))
EFFECTIVE_CATEGORY_NAME = Coalesce(F('category__name'), F('transaction__category__name'))
EFFECTIVE_TOTAL = Coalesce(F('line_total'), F('quantity') * F('unit_price'), Value(Decimal('0')))


class TransactionService:
    @staticmethod
    def _resolve_account(workspace_id: int, account_id: int | None, allow_archived: bool = False) -> Account | None:
        """Resolve the target account; account_id None means an account-less transaction.

        allow_archived permits editing a transaction whose account was archived
        after the fact - retargeting to an archived account is rejected by the
        caller comparing account ids.
        """
        if account_id is None:
            return None
        account = AccountService.get(account_id, workspace_id)
        if account.is_archived and not allow_archived:
            raise TransactionAccountArchivedError()
        return account

    @staticmethod
    def _resolve_currency(workspace_id: int, account: Account | None, code: str | None) -> Currency:
        """Resolve the transaction's own currency (the stored truth).

        With an account: derived from the account when the payload omits the
        code; an explicit code must MATCH the account's currency (a mismatch
        would silently reinterpret the amount). Without an account: the code
        is required and must resolve to an enabled workspace currency -
        unlike the original facet, own-currency rows feed aggregates, so
        un-enabled catalog codes are not allowed here.
        """
        if account is not None:
            if code is None:
                return account.currency
            if code != account.currency.code:
                raise TransactionCurrencyMismatchError()
            return account.currency
        if code is None:
            raise TransactionCurrencyRequiredError()
        return CurrencyCatalogService.get_enabled(workspace_id, code)

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
    def _validate_item_categories(workspace_id: int, tx_category: Category | None, category_ids) -> None:
        """D5/D6: explicit item categories need a transaction category in the same budget.

        category_ids may be any iterable (schema field values or a values_list
        queryset); falsy entries (None ids = inherit) are skipped. Raises
        TransactionItemCategoryWithoutTransactionError when the transaction has
        no category, TransactionCategoryNotFoundError for unknown/archived/
        foreign-workspace ids, and TransactionItemCategoryBudgetError when any
        category lives outside the transaction category's budget.
        """
        category_ids = [cid for cid in category_ids if cid]
        if not category_ids:
            return
        if tx_category is None:
            raise TransactionItemCategoryWithoutTransactionError()
        rows = {row.id: row for row in Category.objects.for_workspace(workspace_id).filter(id__in=category_ids)}
        for cid in category_ids:
            row = rows.get(cid)
            if row is None or row.is_archived:
                raise TransactionCategoryNotFoundError()
            if row.budget_id != tx_category.budget_id:
                raise TransactionItemCategoryBudgetError()

    @staticmethod
    def _validate_type_amount(
        trans_type: str, amount: Decimal, category_id: int | None, account_id: int | None
    ) -> None:
        """Enforce type semantics: positive income/expense, signed non-zero uncategorized adjustment.

        Adjustments require an account - an account-less adjustment affects
        no balance, so it is meaningless. Income/expense may be account-less.
        """
        if trans_type == 'adjustment':
            if amount == 0:
                raise TransactionAmountInvalidError()
            if category_id is not None:
                raise TransactionAdjustmentCategoryError()
            if account_id is None:
                raise TransactionAdjustmentAccountError()
        elif amount <= 0:
            raise TransactionAmountInvalidError()

    @staticmethod
    def _resolve_original_currency(workspace_id: int, currency: Currency, code: str | None) -> Currency | None:
        """Resolve the original-facet currency: catalog global or this workspace's custom rows.

        Must differ from the transaction's OWN currency - the facet only
        records what was paid in another currency at the point of sale; the
        transaction's stored amount and currency drive all math.
        """
        if code is None:
            return None
        facet = (
            Currency.objects.filter(workspace__isnull=True, code=code).first()
            or Currency.objects.filter(workspace_id=workspace_id, code=code).first()
        )
        if not facet:
            raise TransactionOriginalCurrencyError(
                _('Original currency %(code)s not found in the catalog') % {'code': code}
            )
        if facet.code == currency.code:
            raise TransactionOriginalCurrencyError(_('Original currency must differ from the transaction currency'))
        return facet

    @staticmethod
    def _resolve_original_account(
        workspace_id: int, original_currency: Currency | None, account_id: int | None, allow_archived: bool = False
    ) -> Account | None:
        """Resolve the facet's account; account_id None means an informational-only facet.

        The account must be active, in this workspace, and hold exactly the
        facet's currency (compared by CODE: the facet may resolve to the
        global catalog row while the account holds a workspace-custom row of
        the same code - FK ids would falsely mismatch). A direct
        workspace-scoped lookup rather than AccountService.get so the
        not-found and archived cases raise the SAME domain error.
        allow_archived permits editing a transaction whose facet account was
        archived after the fact - retargeting to an archived facet account is
        rejected by the caller comparing account ids (update path).
        """
        if account_id is None:
            return None
        account = Account.objects.for_workspace(workspace_id).select_related('currency').filter(id=account_id).first()
        if not account or (account.is_archived and not allow_archived):
            raise TransactionOriginalAccountError()
        if account.currency.code != original_currency.code:
            raise TransactionOriginalAccountCurrencyError()
        return account

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
        currency_code: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
    ):
        """Build a filtered queryset for transactions.

        currency_code filters by the transaction's stored own currency;
        account-less rows match their own currency, and the original-amount
        facet never matches.
        category_id and budget_id OR-match: a transaction is included when
        its own category matches OR any item's explicit category matches
        (NULL item categories inherit the transaction's category, which the
        transaction arm already covers). The item join can duplicate a
        multi-item transaction, so both filters apply .distinct() - callers
        that paginate or count keep one row per transaction.
        """
        queryset = Transaction.objects.for_workspace(workspace_id)

        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        if account_id:
            queryset = queryset.filter(account_id__in=account_id)
        if category_id:
            # D9: a transaction matches when its own category OR any item's
            # explicit category is in the list. Items with NULL categories
            # COALESCE to the transaction's category at read time, so the
            # first arm already covers inherited matches - only explicit
            # item categories need the second arm. The item join duplicates
            # multi-item transactions; .distinct() restores one row per
            # transaction (list pagination counts on it).
            queryset = queryset.filter(
                Q(category_id__in=category_id) | Q(items__category_id__in=category_id)
            ).distinct()
        if budget_id:
            queryset = queryset.filter(
                Q(category__budget_id__in=budget_id) | Q(items__category__budget_id__in=budget_id)
            ).distinct()
        if transaction_type:
            queryset = queryset.filter(type__in=transaction_type)
        if currency_code:
            queryset = queryset.filter(currency__code__in=currency_code)
        if search:
            queryset = queryset.filter(description__icontains=search)
        if amount_gte is not None:
            queryset = queryset.filter(amount__gte=amount_gte)
        if amount_lte is not None:
            queryset = queryset.filter(amount__lte=amount_lte)

        return queryset

    @staticmethod
    def effective_category_items(transactions_queryset):
        """Annotated item rows for category aggregation over `transactions_queryset`.

        THE shared read-side helper for item-based category attribution (the
        coverage invariant makes a managed transaction's items sum to its
        amount). Effective category = Coalesce(item.category,
        transaction.category) - NULL item categories inherit the
        transaction's; effective total = Coalesce(line_total,
        quantity * unit_price, 0), mirroring `_items_total`. The
        `transaction__in` lookup compiles to a subquery, so item rows are
        neither duplicated nor narrowed by the transaction side's own filter
        joins (no join-reuse hazard).

        Returns a lazy, chainable queryset: callers append their own grouping
        tail (the totals/totals_combined category branches here).
        ReportService.actuals_by_category shares the same EFFECTIVE_* module
        constants but keeps its direct transaction__ filters - chaining it
        onto this subquery would change its query shape for no behavioral
        gain (see its docstring).
        """
        return TransactionItem.objects.filter(transaction__in=transactions_queryset).annotate(
            currency_code=F('transaction__currency__code'),
            effective_category_id=EFFECTIVE_CATEGORY_ID,
            effective_category_name=EFFECTIVE_CATEGORY_NAME,
            effective_total=EFFECTIVE_TOTAL,
        )

    @staticmethod
    def get_transaction(transaction_id: int, workspace_id: int) -> Transaction:
        """Get a transaction and verify it belongs to the workspace."""
        trans = (
            Transaction.objects.select_related('currency', 'account__currency', 'category', 'original_currency')
            .prefetch_related('generated_adjustments')
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
        currency_code: list | None = None,
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
            currency_code=currency_code,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        )

        queryset = queryset.select_related(
            'currency', 'account__currency', 'category', 'original_currency'
        ).prefetch_related('generated_adjustments')

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
        currency_code: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
        group_by: str = 'type',
    ) -> list[dict]:
        """Aggregated totals grouped by (type, currency) or (category, currency).

        Adjustments are excluded — they affect balances, never income/expense reporting.
        The category branch aggregates the transactions' ITEM rows by
        effective category (Coalesce(item.category, transaction.category))
        and effective total (Coalesce(line_total, quantity * unit_price, 0))
        - see `effective_category_items`. The type branch keeps summing
        whole transaction amounts.
        """
        queryset = TransactionService._build_filtered_queryset(
            workspace_id=workspace_id,
            date_from=date_from,
            date_to=date_to,
            account_id=account_id,
            category_id=category_id,
            budget_id=budget_id,
            transaction_type=transaction_type,
            currency_code=currency_code,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        ).exclude(type='adjustment')

        if group_by == 'category':
            rows = (
                TransactionService.effective_category_items(queryset)
                .annotate(
                    grouped_category_name=Coalesce('effective_category_name', Value(str(TotalsLabel.UNCATEGORIZED))),
                )
                .values('grouped_category_name', 'currency_code')
                .annotate(total=Sum('effective_total'))
                .order_by('grouped_category_name', 'currency_code')
            )
            return [
                {'group': r['grouped_category_name'], 'currency': r['currency_code'], 'total': r['total']} for r in rows
            ]

        # Default: group by type
        rows = (
            queryset.annotate(currency_code=F('currency__code'))
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
        currency_code: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
    ) -> dict:
        """Get both type and category totals (two queries).

        Returns {'by_type': [...], 'by_category': [...]}. Adjustments excluded.
        Type totals sum whole transaction amounts; category totals aggregate
        item rows by effective category (see `effective_category_items`).
        """
        queryset = TransactionService._build_filtered_queryset(
            workspace_id=workspace_id,
            date_from=date_from,
            date_to=date_to,
            account_id=account_id,
            category_id=category_id,
            budget_id=budget_id,
            transaction_type=transaction_type,
            currency_code=currency_code,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        ).exclude(type='adjustment')

        type_rows = queryset.annotate(currency_code=F('currency__code')).values_list('type', 'currency_code', 'amount')

        type_map: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
        for trans_type, curr, amount in type_rows:
            type_map[trans_type][curr] += amount

        item_rows = (
            TransactionService.effective_category_items(queryset)
            .annotate(
                grouped_category_name=Coalesce('effective_category_name', Value(str(TotalsLabel.UNCATEGORIZED))),
            )
            # order_by() clears TransactionItem.Meta.ordering ('position',
            # 'id'); left in place it would enter the GROUP BY and split
            # every item into its own row (see actuals_by_category).
            .order_by()
            .values('grouped_category_name', 'currency_code')
            .annotate(total=Sum('effective_total'))
        )
        cat_map: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
        for row in item_rows:
            cat_map[row['grouped_category_name']][row['currency_code']] += row['total']

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
    def actuals_by_category(workspace_id: int, budget_id: int, date_from, date_to) -> list[dict]:
        """Budget actuals aggregated from transaction items, not whole rows.

        Returns rows of {'effective_category_id', 'effective_category_name',
        'currency_code', 'total'}: expense items dated within [date_from,
        date_to] whose effective category (own when set, else the
        transaction's) belongs to `budget_id`. Explicit item categories in
        another budget are attributed to that budget, never this one. Totals
        are unquantized sums of effective totals; callers quantize.
        """
        return list(
            TransactionItem.objects.filter(
                transaction__workspace_id=workspace_id,
                transaction__type='expense',
                transaction__date__gte=date_from,
                transaction__date__lte=date_to,
            )
            .filter(
                Q(category__budget_id=budget_id) | Q(category__isnull=True, transaction__category__budget_id=budget_id)
            )
            .annotate(
                effective_category_id=EFFECTIVE_CATEGORY_ID,
                effective_category_name=EFFECTIVE_CATEGORY_NAME,
                currency_code=F('transaction__currency__code'),
            )
            # order_by() clears Meta.ordering ('position', 'id'); left in
            # place it would enter the GROUP BY and split every row apart.
            .order_by()
            .values('effective_category_id', 'effective_category_name', 'currency_code')
            .annotate(total=Sum(EFFECTIVE_TOTAL))
        )

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
            queryset.annotate(lower_desc=Lower('description'), currency_code=F('currency__code'))
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
    def _build_items_from_schema(trans: Transaction, items_in: list) -> list[TransactionItem]:
        """Convert TransactionItemIn schemas (category_id included) into unsaved items.

        Position is assigned in list order via enumerate, matching replace_items.
        Item category_ids pass through unvalidated here - the callers run
        _validate_item_categories BEFORE any write. Unlike
        _build_items_from_parsed, no defensive parsing is needed -
        Pydantic has already validated every field by the time we get here,
        so input order maps 1:1 to stored positions and no rows are dropped.

        Returns unsaved instances; the caller does bulk_create so the rows are
        written inside its own @db_transaction.atomic block.
        """
        return [
            TransactionItem(
                transaction=trans,
                position=position,
                name=item.name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
                category_id=item.category_id,
            )
            for position, item in enumerate(items_in)
        ]

    @staticmethod
    def _lookup_idempotency_key(user, workspace_id: int, key: str) -> TransactionIdempotencyKey | None:
        """Return the user's unexpired dedup record for `key` in this workspace, or None.

        "Unexpired" = created within the last 24h. A record whose `transaction`
        FK has been SET_NULL'd by a transaction delete is returned as-is — the
        caller decides what to do with it (currently: delete + create fresh).

        Scoped to workspace so a replay under workspace B cannot return a
        transaction created under workspace A (the user's membership in A may
        have been revoked since).
        """
        cutoff = timezone.now() - IDEMPOTENCY_TTL
        return (
            TransactionIdempotencyKey.objects.filter(
                key=key, user=user, workspace_id=workspace_id, created_at__gt=cutoff
            )
            .select_related('transaction')
            .first()
        )

    @staticmethod
    def _auto_adjustment_description(trans: Transaction) -> str:
        """Deterministic stored description for a linked auto-adjustment (request locale).

        The ONE derivation path for the stored description - the create and
        update paths both format through it, so an adjustment's description
        never depends on which lifecycle step wrote it.
        """
        return _('Adjustment for "%(description)s" (paid in %(original)s, recorded in %(recorded)s)') % {
            'description': trans.description,
            'original': trans.original_currency.code,
            'recorded': trans.currency.code,
        }

    @staticmethod
    def _auto_adjustment_amount(trans: Transaction) -> Decimal:
        """Signed adjustment amount: -original_amount for expense, +original_amount for income.

        The ONE sign derivation for the create and update paths. Coerces via
        str() because the GDPR importer hands over a freshly created instance
        whose original_amount still holds the raw JSON string ("200.00") -
        multiplying that string by -1 yields '' instead of a negative amount.
        """
        amount = Decimal(str(trans.original_amount))
        return -amount if trans.type == 'expense' else amount

    @staticmethod
    def _create_auto_adjustment(user, trans: Transaction, account: Account | None) -> Transaction | None:
        """Book the facet's original-currency leg as an adjustment on `account`.

        No-op (None) when `account` is None - the informational-only facet is
        a first-class state; the server never infers an account. Builds the
        row directly instead of recursing into `create`: the adjustment
        invariants (account set, no category, signed non-zero amount) hold
        by construction from the already-validated source transaction.
        The stored description is generated via gettext in the request
        locale - a deliberate exception to the persisted-data firewall
        (the user explicitly asked for an explanatory stored description).

        Runs inside the caller's atomic block, like `_do_create` - no
        @db_transaction.atomic here. Returns the created adjustment.
        """
        if account is None:
            return None
        return Transaction.objects.create(
            workspace_id=trans.workspace_id,
            account=account,
            currency=account.currency,
            date=trans.date,
            description=TransactionService._auto_adjustment_description(trans),
            category=None,
            amount=TransactionService._auto_adjustment_amount(trans),
            type='adjustment',
            created_by=user,
            updated_by=user,
            source_transaction=trans,
        )

    @staticmethod
    def _upsert_auto_adjustment(user, trans: Transaction, account: Account, linked: Transaction | None) -> Transaction:
        """Update-or-create the linked adjustment so it mirrors the edited source.

        The sign follows the NEW type; amount and description are derived
        through the same helpers the create path uses, so one format exists
        everywhere.
        Runs inside `update`'s atomic block, like `_create_auto_adjustment`
        - no @db_transaction.atomic here.
        """
        if linked is None:
            return TransactionService._create_auto_adjustment(user, trans, account)
        linked.account = account
        linked.currency = account.currency
        linked.amount = TransactionService._auto_adjustment_amount(trans)
        linked.date = trans.date
        linked.description = TransactionService._auto_adjustment_description(trans)
        linked.updated_by = user
        linked.save()
        return linked

    @staticmethod
    def _do_create(user, workspace_id: int, data: TransactionCreate) -> Transaction:
        """Build and persist the Transaction (and inline items) — no idempotency logic.

        Runs inside the caller's atomic block (either the savepoint in `create`
        when a key is given, or the outer `create`'s @db_transaction.atomic
        when no key is given). Do NOT add @db_transaction.atomic here — it
        would open a redundant nested savepoint on every call.
        """
        account = TransactionService._resolve_account(workspace_id, data.account_id)
        TransactionService._validate_type_amount(data.type, data.amount, data.category_id, data.account_id)
        currency = TransactionService._resolve_currency(workspace_id, account, data.currency_code)
        category = TransactionService._validate_category(data.category_id, workspace_id)
        TransactionService._validate_item_categories(workspace_id, category, [item.category_id for item in data.items])
        original_currency = TransactionService._resolve_original_currency(
            workspace_id, currency, data.original_currency_code
        )
        original_account = TransactionService._resolve_original_account(
            workspace_id, original_currency, data.original_account_id
        )

        trans = Transaction.objects.create(
            workspace_id=workspace_id,
            account=account,
            currency=currency,
            date=data.date,
            description=data.description,
            note=data.note,
            category=category,
            amount=data.amount,
            type=data.type,
            original_amount=data.original_amount,
            original_currency=original_currency,
            created_by=user,
            updated_by=user,
        )
        if data.items:
            TransactionItem.objects.bulk_create(TransactionService._build_items_from_schema(trans, data.items))
        TransactionService._normalize_coverage(trans)
        TransactionService._create_auto_adjustment(user, trans, original_account)
        TransactionService._touch_period(user, category, data.date)
        return trans

    @staticmethod
    @db_transaction.atomic
    def create(
        user,
        workspace_id: int,
        data: TransactionCreate,
        idempotency_key: str | None = None,
    ) -> Transaction:
        """Create a transaction on an account, lazily materializing the derived period.

        If `idempotency_key` is provided, dedup within a 24h window per user
        per workspace: a replay with the same key returns the
        originally-created Transaction instead of creating a second one
        (Stripe-style idempotency — same key, same result, regardless of
        payload). The dedup record is a transient key→transaction map, NOT
        user data; it never appears in export/import.
        """
        if not idempotency_key:
            # No idempotency key — original code path. _do_create runs inside the
            # @db_transaction.atomic on this method (no extra savepoint overhead).
            return TransactionService._do_create(user, workspace_id, data)
        return create_with_idempotency(
            user=user,
            workspace_id=workspace_id,
            data=data,
            key=idempotency_key,
            lookup=TransactionService._lookup_idempotency_key,
            do_create=TransactionService._do_create,
            record_model=TransactionIdempotencyKey,
            target_model=Transaction,
            target_field='transaction',
        )

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, transaction_id: int, data: TransactionCreate) -> Transaction:
        """Fully replace a transaction; account/category/date changes re-derive the period.

        data.account_id is authoritative: None clears the account (the payload
        must then carry currency_code). Editing a transaction whose account
        was archived since is allowed, but retargeting to a DIFFERENT archived
        account is rejected; keeping the same archived account is fine.

        Auto-managed adjustments (source_transaction set) are rejected - the
        linked adjustment is synced from its SOURCE here: facet + account
        present upserts it; facet cleared or account nulled deletes it.
        """
        from transactions.attachments import AttachmentService

        trans = TransactionService.get_transaction(transaction_id, workspace_id)
        if trans.source_transaction_id is not None:
            raise TransactionAutoManagedError()

        account = TransactionService._resolve_account(workspace_id, data.account_id, allow_archived=True)
        if account is not None and account.id != trans.account_id and account.is_archived:
            raise TransactionAccountArchivedError()
        TransactionService._validate_type_amount(data.type, data.amount, data.category_id, data.account_id)
        currency = TransactionService._resolve_currency(workspace_id, account, data.currency_code)
        category = TransactionService._validate_category(data.category_id, workspace_id)
        # D6: validated against the incoming category BEFORE any write - stored
        # items still hold their pre-update explicit categories at this point.
        # A NULL incoming category forbids stored explicit item categories (D5).
        TransactionService._validate_item_categories(
            workspace_id, category, trans.items.exclude(category=None).values_list('category_id', flat=True)
        )
        original_currency = TransactionService._resolve_original_currency(
            workspace_id, currency, data.original_currency_code
        )

        linked = trans.generated_adjustments.first()
        original_account = None
        if original_currency is not None and data.original_account_id is not None:
            original_account = TransactionService._resolve_original_account(
                workspace_id, original_currency, data.original_account_id, allow_archived=True
            )
            # Same archived-facet-account rule as the transaction's own account
            # above: keeping the linked adjustment's archived account is fine,
            # retargeting to a different archived one is rejected.
            if original_account.is_archived and (linked is None or linked.account_id != original_account.id):
                raise TransactionOriginalAccountError()

        trans.account = account
        trans.currency = currency
        trans.date = data.date
        trans.description = data.description
        trans.note = data.note
        trans.category = category
        trans.amount = data.amount
        trans.type = data.type
        trans.original_amount = data.original_amount
        trans.original_currency = original_currency
        trans.updated_by = user
        # Resizes/deletes the remainder against the NEW amount before any row
        # is saved: the over-sum 400 fires before a single write, and the item
        # writes here plus trans.save() below stay one atomic unit.
        TransactionService._normalize_coverage(trans)
        trans.save()

        if original_currency is not None and original_account is not None:
            TransactionService._upsert_auto_adjustment(user, trans, original_account, linked)
        elif linked is not None:
            AttachmentService.delete_storage_for_transactions(Transaction.objects.filter(id=linked.id))
            linked.delete()
        # The sync block rewrote rows behind the prefetch cache get_transaction
        # served `linked` from; drop it so the serialized original_account_id
        # reflects the post-sync state, not the pre-sync one.
        getattr(trans, '_prefetched_objects_cache', {}).pop('generated_adjustments', None)

        TransactionService._touch_period(user, category, data.date)
        return trans

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, transaction_id: int) -> None:
        """Delete a transaction. Balances are computed, so nothing else to revert.

        Auto-managed adjustments are rejected here; deleting a SOURCE removes
        its linked adjustment via the DB CASCADE on source_transaction (pinned
        by test). The storage sweep covers that adjustment too - attachments
        cascade with it, their stored objects do not.
        """
        from transactions.attachments import AttachmentService

        trans = TransactionService.get_transaction(transaction_id, workspace_id)
        if trans.source_transaction_id is not None:
            raise TransactionAutoManagedError()
        AttachmentService.delete_storage_for_transactions(
            Transaction.objects.filter(Q(id=trans.id) | Q(source_transaction_id=trans.id))
        )
        trans.delete()

    @staticmethod
    def list_items(workspace_id: int, transaction_id: int) -> dict:
        """Return a transaction's ordered items and their sum.

        The list includes the server-owned remainder row; after normalization
        the sum equals the transaction amount for every covered transaction.
        The pre-save mismatch hint stays a client-side computation over the
        rows being edited.
        """
        trans = TransactionService.get_transaction(transaction_id, workspace_id)
        items = list(trans.items.all())
        return {
            'items': items,
            'items_total': TransactionService._items_total(items),
        }

    @staticmethod
    @db_transaction.atomic
    def replace_items(
        workspace_id: int,
        transaction_id: int,
        items_in: list,
        remainder_category_id: int | None = None,
        remainder_name: str | None = None,
    ) -> dict:
        """Replace the full ordered item list (add/edit/reorder/delete atomically).

        The remainder row is server-owned: clients send only user rows, plus
        the optional remainder_category_id / remainder_name to recategorize
        and rename the remainder. Item-category validation runs BEFORE the
        delete (a bad payload must not wipe items); the remainder category is
        validated after _normalize_coverage, only when a remainder row
        actually results - at exact cover both remainder fields are silently
        ignored (the system owns the row's existence) and the atomic block
        still rolls a rejected payload back untouched. Over-sum raises (D4).
        remainder_name None leaves the stored name; a provided value (may be
        empty string) is stripped and written - the UI renders the translated
        label for empty names.
        """
        trans = TransactionService.get_transaction(transaction_id, workspace_id)
        TransactionService._validate_item_categories(
            workspace_id, trans.category, [item.category_id for item in items_in]
        )
        if remainder_name is not None:
            remainder_name = remainder_name.strip()
        trans.items.all().delete()
        TransactionItem.objects.bulk_create(TransactionService._build_items_from_schema(trans, items_in))
        TransactionService._normalize_coverage(trans)
        remainder = trans.items.filter(is_remainder=True).first()
        if remainder is not None and (remainder_category_id is not None or remainder_name is not None):
            update_fields = []
            if remainder_category_id is not None:
                if trans.category is None:
                    raise TransactionItemCategoryWithoutTransactionError()
                remainder_category = TransactionService._validate_category(remainder_category_id, workspace_id)
                if remainder_category.budget_id != trans.category.budget_id:
                    raise TransactionItemCategoryBudgetError()
                remainder.category_id = remainder_category_id
                update_fields.append('category')
            if remainder_name is not None:
                remainder.name = remainder_name
                update_fields.append('name')
            remainder.save(update_fields=update_fields)
        # Re-query deliberately: the response must include the freshly created
        # remainder row, which the bulk_create return value does not contain.
        items = list(trans.items.all())
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
    def _normalize_coverage(trans: Transaction, strict: bool = True) -> None:
        """Enforce the coverage invariant: items sum to the transaction amount.

        remainder = amount - sum(non-remainder rows' effective totals, where
        effective total = line_total, falling back to quantity x unit_price -
        mirroring _items_total). Positive: upsert the server-owned remainder
        row (name '', quantity 1, unit_price None, category NULL = inherit,
        positioned after all existing rows). <= 0: delete the remainder row.

        strict=True (user write paths) raises TransactionItemsOverSumError when
        user rows alone exceed the amount. strict=False (auto-fill) keeps
        parsed rows and drops the remainder instead.

        Adjustments never carry coverage (no category allowed, nothing to
        attribute): remainder rows are deleted and none is created.

        Runs inside the caller's atomic block - no @db_transaction.atomic here.
        """
        if trans.type == 'adjustment':
            trans.items.filter(is_remainder=True).delete()
            return
        user_rows = list(trans.items.filter(is_remainder=False))
        user_total = TransactionService._items_total(user_rows)
        remainder = trans.amount - user_total
        if remainder < 0 and strict:
            raise TransactionItemsOverSumError(user_total, trans.amount)
        row = trans.items.filter(is_remainder=True).first()
        if remainder <= 0:
            if row is not None:
                row.delete()
            return
        if row is None:
            max_pos = trans.items.aggregate(max_pos=Max('position'))['max_pos']
            row = TransactionItem.objects.create(
                transaction=trans,
                position=(max_pos + 1) if max_pos is not None else 0,
                name='',
                quantity=Decimal('1'),
                unit_price=None,
                line_total=remainder,
                is_remainder=True,
            )
        else:
            row.line_total = remainder
            row.save(update_fields=['line_total'])

    @staticmethod
    def _build_items_from_parsed(trans: Transaction, items: list) -> list[TransactionItem]:
        """Convert parser-contract item dicts into unsaved TransactionItem instances.

        Defensive against malformed rows: a row with no name or a non-parseable
        decimal is skipped, never raised on. Position is assigned in printed
        order across the rows that survive. See docs/parser-contract.md
        for the input shape (decimal strings; unit_price/line_total may be null).
        """
        built: list[TransactionItem] = []
        position = 0
        for raw in items:
            name = (raw.get('name') or '').strip()
            if not name:
                continue
            try:
                quantity = Decimal(str(raw.get('quantity') or '1'))
                unit_price_raw = raw.get('unit_price')
                unit_price = Decimal(str(unit_price_raw)) if unit_price_raw is not None else None
                line_total_raw = raw.get('line_total')
                line_total = Decimal(str(line_total_raw)) if line_total_raw is not None else None
            except (InvalidOperation, ValueError, TypeError):
                continue
            built.append(
                TransactionItem(
                    transaction=trans,
                    position=position,
                    name=name[:300],
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                )
            )
            position += 1
        return built

    @staticmethod
    @db_transaction.atomic
    def auto_fill_from_extraction(trans: Transaction, result: dict) -> bool:
        """Auto-fill a transaction's line items and description from a parsed receipt.

        Called from `extract_attachment` after `AttachmentService.mark_extraction_done`
        so the parser result is already durable on the attachment row — a failure
        here can never lose the parsed data.

        This is the server-side twin of the "if blank or 'Receipt', fill from
        parsed merchant" rule that already lives in two client-side spots:
        `ExtractionReviewModal.merchantFillsDescription`
        (frontend/src/components/transactions/ExtractionReviewModal.tsx, L53-56)
        and `TransactionFormModal`'s receipt prefill, where the inline parse
        (`parse.onSuccess`) fills only an empty description and the
        receipt-first entry (`prefillReceipt`) seeds it at open time. All
        three agree an intentional description is never overwritten.

        Rules (idempotent — a second call is a no-op):
        - Items are created only when the transaction currently has zero USER
          (non-remainder) items. Never clobbers user-entered rows.
        - Decimal strings from the parser are converted defensively; malformed rows are skipped, never raised on.
        - The description is set from `result['merchant']` only when the current
          description (stripped) is `''` or `'Receipt'`, and the merchant is truthy.

        Re-fetches the transaction by id defensively (this method runs in a task
        long after it was queued; the transaction may have been deleted).

        Returns True when at least one item row was created.
        """
        trans = Transaction.objects.filter(id=trans.id).first()
        if trans is None:
            return False

        created_items = False
        if not trans.items.filter(is_remainder=False).exists():
            built = TransactionService._build_items_from_parsed(trans, result.get('items') or [])
            if built:
                # Drop the server-owned remainder first: it occupies position 0
                # on a fresh service-created transaction, and parsed rows must
                # start at position 0. The guard already established no user
                # rows exist, so nothing of the user's is deleted; coverage
                # normalization below re-materializes the remainder at the end.
                trans.items.filter(is_remainder=True).delete()
                TransactionItem.objects.bulk_create(built)
                # Lenient: parsed rows are always kept; at over-sum the
                # remainder shrinks to <= 0 and is deleted - the client's
                # mismatch hint communicates the over-sum instead of a 400.
                TransactionService._normalize_coverage(trans, strict=False)
                created_items = True

        merchant = result.get('merchant')
        current = trans.description.strip()
        if merchant and (current == '' or current == 'Receipt'):
            trans.description = merchant
            trans.save(update_fields=['description'])

        return created_items

    @staticmethod
    @db_transaction.atomic
    def bulk_set_account(user, workspace_id: int, transaction_ids: list[int], account_id: int) -> int:
        """Move transactions to another account in one UPDATE (all-or-nothing).

        The target must share the stored currency of every moved transaction -
        a cross-currency move would silently reinterpret amounts (and could
        equal an original facet's currency, which must always differ).
        Account-less rows with a matching currency CAN be assigned here: this
        is the pocket-cash-to-real-account path - their stored currency simply
        starts matching the target account's.
        """
        account = AccountService.get(account_id, workspace_id)
        if account.is_archived:
            raise TransactionAccountArchivedError()

        owned = Transaction.objects.for_workspace(workspace_id).filter(id__in=transaction_ids)
        if owned.count() != len(set(transaction_ids)):
            raise TransactionBulkAccountError()
        if owned.filter(source_transaction__isnull=False).exists():
            raise TransactionBulkManagedError()
        if owned.exclude(currency=account.currency).exists():
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
        ).select_related('currency', 'account__currency', 'category', 'original_currency')

        return [
            {
                'date': t.date.isoformat(),
                'description': t.description,
                'note': t.note,
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
                raise TransactionImportError(_('Invalid data format: %(error)s') % {'error': e})

            category_id = None
            if import_item.type != 'income' and import_item.category_name:
                category_id = category_map.get(import_item.category_name.lower())

            new_transactions.append(
                Transaction(
                    workspace_id=workspace_id,
                    account=account,
                    currency=account.currency,
                    date=import_item.date,
                    description=import_item.description,
                    note=import_item.note,
                    category_id=category_id,
                    amount=import_item.amount,
                    type=import_item.type,
                    created_by=user,
                    updated_by=user,
                )
            )

        Transaction.objects.bulk_create(new_transactions)
        # Imported rows carry no items; give each an amount-sized remainder so
        # the coverage invariant holds from the moment they exist.
        for trans in new_transactions:
            TransactionService._normalize_coverage(trans)
        return len(new_transactions)
