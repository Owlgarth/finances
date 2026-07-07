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
    def _reference_count(workspace_id: int, currency: Currency) -> int:
        """Count records in the workspace that reference this catalog currency.

        Extended by B4 (category budgets), B5 (transaction original facet).
        """
        from accounts.models import Account

        return Account.objects.filter(workspace_id=workspace_id, currency=currency).count()

    @staticmethod
    def list_catalog(workspace_id: int) -> QuerySet[Currency]:
        """Global catalog plus this workspace's custom currencies, ordered by code."""
        return Currency.objects.filter(Q(workspace__isnull=True) | Q(workspace_id=workspace_id)).order_by('code')

    @staticmethod
    def list_enabled(workspace_id: int) -> list[Currency]:
        """List the currencies enabled for a workspace, ordered by code."""
        return [
            wc.currency
            for wc in WorkspaceCurrency.objects.filter(workspace_id=workspace_id)
            .select_related('currency')
            .order_by('currency__code')
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
    def create_custom(user, workspace_id: int, code: str, name: str, symbol: str, decimals: int = 2) -> Currency:
        """Create a workspace-owned custom currency and enable it."""
        if Currency.objects.filter(workspace__isnull=True, code=code).exists():
            raise DuplicateCurrencyError(code)
        if Currency.objects.filter(workspace_id=workspace_id, code=code).exists():
            raise DuplicateCurrencyError(code)

        currency = Currency.objects.create(
            code=code,
            name=name,
            symbol=symbol,
            decimals=decimals,
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
        if references:
            raise CurrencyInUseError(code, references)

        enablement.delete()
        if currency.is_custom and not currency.enablements.exists():
            currency.delete()
