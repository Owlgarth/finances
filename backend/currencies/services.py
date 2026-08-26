"""Business logic for the currencies app."""

from django.db import transaction as db_transaction
from django.db.models import Q, QuerySet

from currencies.exceptions import (
    CurrencyInUseError,
    CurrencyNotEnabledError,
    DuplicateCurrencyError,
    LastCurrencyError,
    UnknownCurrencyError,
)
from currencies.models import Currency, WorkspaceCurrency


class CurrencyCatalogService:
    @staticmethod
    def _reference_count(workspace_id: int, currency: Currency) -> dict[str, int]:
        """Count records in the workspace that reference this catalog currency, by type.

        Covers the PROTECT FKs whose references must block disable: accounts,
        category budgets, and budget currency sets. The transaction
        original-amount facet is deliberately NOT counted: it resolves against
        the whole catalog and never requires enablement (see the facet guard
        at the custom-row deletion site in disable()).
        """
        from accounts.models import Account
        from budgeting.models import BudgetCurrency, CategoryBudget

        return {
            'accounts': Account.objects.filter(workspace_id=workspace_id, currency=currency).count(),
            'category_budgets': CategoryBudget.objects.filter(workspace_id=workspace_id, currency=currency).count(),
            'budget_currencies': BudgetCurrency.objects.filter(
                budget__workspace_id=workspace_id, currency=currency
            ).count(),
        }

    @staticmethod
    def list_catalog(workspace_id: int) -> QuerySet[Currency]:
        """Global catalog plus this workspace's custom currencies, ordered by code."""
        return Currency.objects.filter(Q(workspace__isnull=True) | Q(workspace_id=workspace_id)).order_by('code')

    @staticmethod
    def list_enabled(workspace_id: int) -> list[Currency]:
        """List the currencies enabled for a workspace, in creation order.

        Ordered by WorkspaceCurrency.created_at, tiebroken by id: bulk
        enablement (workspace creation runs in one atomic block, where
        Postgres now() is transaction-stable) shares a timestamp, so id
        preserves insertion order - the primary currency, enabled first,
        sorts first. This order is the workspace's canonical currency order
        (primary first); the frontend consumes it as the enabled-currencies
        list and derives its primary fallback from the first entry.
        """
        return [
            wc.currency
            for wc in WorkspaceCurrency.objects.filter(workspace_id=workspace_id)
            .select_related('currency')
            .order_by('created_at', 'id')
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
        """Enable a catalog currency for a workspace (idempotent)."""
        global_row = Currency.objects.filter(workspace__isnull=True, code=code).first()
        currency = global_row or Currency.objects.filter(workspace_id=workspace_id, code=code).first()
        if not currency:
            raise UnknownCurrencyError(code)
        WorkspaceCurrency.objects.get_or_create(workspace_id=workspace_id, currency=currency)
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
        WorkspaceCurrency.objects.create(workspace_id=workspace_id, currency=currency)
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
