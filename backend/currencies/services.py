"""Business logic for the currencies app."""

from django.db import transaction as db_transaction
from django.db.models import Max, Q, QuerySet

from currencies.exceptions import (
    CurrencyInUseError,
    CurrencyNotEnabledError,
    CurrencyOrderMismatchError,
    DuplicateCurrencyError,
    LastCurrencyError,
    UnknownCurrencyError,
)
from currencies.models import Currency, WorkspaceCurrency


class CurrencyCatalogService:
    @staticmethod
    def _next_position(workspace_id: int) -> int:
        """Position for a new enablement: append at the end (0 for a fresh workspace)."""
        current_max = WorkspaceCurrency.objects.filter(workspace_id=workspace_id).aggregate(Max('position'))[
            'position__max'
        ]
        return 0 if current_max is None else current_max + 1

    @staticmethod
    def _reference_count(workspace_id: int, currency: Currency) -> dict[str, int]:
        """Count records in the workspace that reference this catalog currency, by type.

        Covers the PROTECT FKs whose references must block disable: accounts,
        category budgets, budget currency sets, planned transactions, and
        transactions (own stored currency). The transaction original-amount
        facet is deliberately NOT counted: it resolves against the whole
        catalog and never requires enablement (see the facet guard at the
        custom-row deletion site in disable()).
        """
        from accounts.models import Account
        from budgeting.models import BudgetCurrency, CategoryBudget
        from planned_transactions.models import PlannedTransaction
        from transactions.models import Transaction

        return {
            'accounts': Account.objects.filter(workspace_id=workspace_id, currency=currency).count(),
            'category_budgets': CategoryBudget.objects.filter(workspace_id=workspace_id, currency=currency).count(),
            'budget_currencies': BudgetCurrency.objects.filter(
                budget__workspace_id=workspace_id, currency=currency
            ).count(),
            'planned_transactions': PlannedTransaction.objects.filter(
                workspace_id=workspace_id, currency=currency
            ).count(),
            'transactions': Transaction.objects.filter(workspace_id=workspace_id, currency=currency).count(),
        }

    @staticmethod
    def list_catalog(workspace_id: int) -> QuerySet[Currency]:
        """Global catalog plus this workspace's custom currencies, ordered by code."""
        return Currency.objects.filter(Q(workspace__isnull=True) | Q(workspace_id=workspace_id)).order_by('code')

    @staticmethod
    def list_enabled(workspace_id: int) -> list[Currency]:
        """List the currencies enabled for a workspace, in the workspace's order.

        Ordered by WorkspaceCurrency.position, id tiebreak (rows created
        before the column existed all share the default 0 - id keeps their
        insertion order). Position 0 is the workspace's primary currency:
        create_workspace enables it first, users reorder via
        set_enabled_order, and enable() appends at the end. The frontend
        consumes this order for every currency dropdown and derives its
        primary fallback from the first entry.
        """
        return [
            wc.currency
            for wc in WorkspaceCurrency.objects.filter(workspace_id=workspace_id)
            .select_related('currency')
            .order_by('position', 'id')
        ]

    @staticmethod
    def get_enabled(workspace_id: int, code: str) -> Currency:
        """Get an enabled currency by code, or raise CurrencyNotEnabledError."""
        enablement = (
            WorkspaceCurrency.objects.filter(workspace_id=workspace_id, currency__code=code)
            .select_related('currency')
            .first()
        )
        if not enablement:
            raise CurrencyNotEnabledError(code)
        return enablement.currency

    @staticmethod
    @db_transaction.atomic
    def enable(user, workspace_id: int, code: str) -> Currency:
        """Enable a catalog currency for a workspace (idempotent).

        New enablements append at the end of the workspace's currency
        order (position = max existing + 1; a fresh workspace starts at
        0, so create_workspace's sequential enables yield 0, 1, 2...).
        Enabling an already-enabled currency keeps its current position -
        get_or_create never overwrites the stored one.
        """
        global_row = Currency.objects.filter(workspace__isnull=True, code=code).first()
        currency = global_row or Currency.objects.filter(workspace_id=workspace_id, code=code).first()
        if not currency:
            raise UnknownCurrencyError(code)
        WorkspaceCurrency.objects.get_or_create(
            workspace_id=workspace_id,
            currency=currency,
            defaults={'position': CurrencyCatalogService._next_position(workspace_id)},
        )
        return currency

    @staticmethod
    @db_transaction.atomic
    def create_custom(user, workspace_id: int, code: str, name: str, symbol: str) -> Currency:
        """Create a workspace-owned custom currency and enable it.

        Storage and display are 2-decimal everywhere (every amount column is
        DecimalField(decimal_places=2); design/data-formatting.md pins
        "always exactly 2"), so custom currencies are created with
        decimals=2 - there is no decimals parameter. The global catalog's
        ISO decimals values (JPY=0 etc.) are seed data and stay untouched.
        """
        if Currency.objects.filter(workspace__isnull=True, code=code).exists():
            raise DuplicateCurrencyError(code)
        if Currency.objects.filter(workspace_id=workspace_id, code=code).exists():
            raise DuplicateCurrencyError(code)

        currency = Currency.objects.create(
            code=code,
            name=name,
            symbol=symbol,
            decimals=2,
            is_custom=True,
            workspace_id=workspace_id,
        )
        # Append at the end like any other new enablement - the model
        # default (0) would jump a fresh custom currency ahead of the
        # primary.
        WorkspaceCurrency.objects.create(
            workspace_id=workspace_id,
            currency=currency,
            position=CurrencyCatalogService._next_position(workspace_id),
        )
        return currency

    @staticmethod
    @db_transaction.atomic
    def disable(workspace_id: int, code: str) -> None:
        """Disable a currency for a workspace.

        Blocked when it is the last enabled currency or still referenced.
        Orphaned custom rows (no enablements left) are deleted with it.
        """
        enablement = (
            WorkspaceCurrency.objects.filter(workspace_id=workspace_id, currency__code=code)
            .select_related('currency')
            .first()
        )
        if not enablement:
            raise CurrencyNotEnabledError(code)

        if WorkspaceCurrency.objects.filter(workspace_id=workspace_id).count() <= 1:
            raise LastCurrencyError()

        currency = enablement.currency
        references = CurrencyCatalogService._reference_count(workspace_id, currency)
        if any(references.values()):
            raise CurrencyInUseError(code, references)

        # No renumbering after a disable: positions stay sparse. Ordering
        # compares positions and never assumes contiguity, gaps cost
        # nothing, and enable() appends at max+1 regardless of gaps -
        # renumbering would add writes to every disable and race
        # concurrent reorders for no observable benefit.
        enablement.delete()
        if currency.is_custom and not currency.enablements.exists():
            # Facet references do not BLOCK disable, but they pin the custom
            # row: Transaction.original_currency is PROTECT, so deleting a
            # facet-referenced row would raise ProtectedError (a 500). A
            # facet-referenced custom row is not orphaned - it stays in the
            # workspace catalog, re-enablable from the settings picker.
            from transactions.models import Transaction

            if not Transaction.objects.filter(original_currency=currency).exists():
                currency.delete()

    @staticmethod
    @db_transaction.atomic
    def set_enabled_order(user, workspace_id: int, codes: list[str]) -> list[Currency]:
        """Rewrite the workspace's enabled-currency order from an explicit list.

        The payload must be exactly the currently-enabled set: same
        members, no duplicates, any order. Validation raises before any
        write, so a bad payload can never disturb the existing order.
        Positions are rewritten 0..n-1 in one atomic block; after the
        rewrite, position 0 is the workspace's primary currency in every
        dropdown. No row locks: reorder is admin-rare and worst case
        last-write-wins; a stale concurrent append can duplicate a
        position, which the id tiebreak resolves deterministically.
        """
        rows = list(WorkspaceCurrency.objects.filter(workspace_id=workspace_id).select_related('currency'))
        row_by_code = {wc.currency.code: wc for wc in rows}
        if len(codes) != len(rows) or set(codes) != set(row_by_code):
            raise CurrencyOrderMismatchError()
        for position, code in enumerate(codes):
            row_by_code[code].position = position
        WorkspaceCurrency.objects.bulk_update(rows, ['position'])
        return CurrencyCatalogService.list_enabled(workspace_id)
