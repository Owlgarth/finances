"""Business logic for the workspaces app."""

from django.db import transaction as db_transaction
from ninja.errors import HttpError

from common.permissions import require_role
from workspaces.models import ADMIN_ROLES, Currency, Workspace, WorkspaceCurrency


class CurrencyService:
    @staticmethod
    def list_currencies():
        """List all available currencies."""
        return Currency.objects.all()

    @staticmethod
    def get_currency(currency_id: int) -> Currency | None:
        """Get a currency by ID."""
        return Currency.objects.filter(id=currency_id).first()

    @staticmethod
    @db_transaction.atomic
    def create_currency(data) -> Currency:
        """Create a new currency."""
        if Currency.objects.filter(symbol=data.symbol).exists():
            raise HttpError(400, f'Currency with symbol {data.symbol} already exists')
        if Currency.objects.filter(name=data.name).exists():
            raise HttpError(400, f'Currency with name {data.name} already exists')

        currency = Currency.objects.create(
            name=data.name,
            symbol=data.symbol,
        )
        return currency

    @staticmethod
    @db_transaction.atomic
    def delete_currency(currency_id: int) -> None:
        """Delete a currency."""
        currency = CurrencyService.get_currency(currency_id)
        if not currency:
            raise HttpError(404, 'Currency not found')
        currency.delete()


class WorkspaceCurrencyService:
    @staticmethod
    def list_workspace_currencies(workspace: Workspace) -> list[Currency]:
        """List all currencies for a workspace."""
        return list(workspace.currencies.all())

    @staticmethod
    def get_workspace_currency_symbols(workspace: Workspace) -> list[str]:
        """Get list of currency symbols for a workspace."""
        return list(workspace.currencies.values_list('symbol', flat=True))

    @staticmethod
    @db_transaction.atomic
    def add_currency_to_workspace(user, workspace: Workspace, currency_id: int) -> WorkspaceCurrency:
        """Add a currency to a workspace."""
        require_role(user, workspace.id, ADMIN_ROLES)

        currency = CurrencyService.get_currency(currency_id)
        if not currency:
            raise HttpError(404, 'Currency not found')

        if workspace.currencies.filter(id=currency_id).exists():
            raise HttpError(400, f'Currency {currency.symbol} is already added to this workspace')

        workspace_currency = WorkspaceCurrency.objects.create(
            workspace=workspace,
            currency=currency,
        )
        return workspace_currency

    @staticmethod
    @db_transaction.atomic
    def remove_currency_from_workspace(user, workspace: Workspace, currency_id: int) -> None:
        """Remove a currency from a workspace."""
        require_role(user, workspace.id, ADMIN_ROLES)

        workspace_currency = WorkspaceCurrency.objects.filter(
            workspace=workspace,
            currency_id=currency_id,
        ).first()

        if not workspace_currency:
            raise HttpError(404, 'Currency not found in workspace')

        workspace_currency.delete()
