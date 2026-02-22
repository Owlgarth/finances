"""Business logic for the workspaces app."""

from django.db import transaction as db_transaction
from ninja.errors import HttpError

from workspaces.models import ADMIN_ROLES, Currency, Workspace  # noqa: F401

DEFAULT_CURRENCIES = [
    ('USD', 'US Dollar'),
    ('UAH', 'Ukrainian Hryvnia'),
    ('PLN', 'Polish Zloty'),
    ('EUR', 'Euro'),
]


class CurrencyService:
    @staticmethod
    def list_currencies(workspace: Workspace) -> list[Currency]:
        """List all currencies for a workspace."""
        return list(Currency.objects.filter(workspace=workspace))

    @staticmethod
    def get_currency(currency_id: int, workspace: Workspace) -> Currency | None:
        """Get a currency by ID within a workspace."""
        return Currency.objects.filter(id=currency_id, workspace=workspace).first()

    @staticmethod
    @db_transaction.atomic
    def create_currency(workspace: Workspace, data) -> Currency:
        """Create a new currency for a workspace."""
        if Currency.objects.filter(workspace=workspace, symbol=data.symbol).exists():
            raise HttpError(400, f'Currency with symbol {data.symbol} already exists in this workspace')

        return Currency.objects.create(
            workspace=workspace,
            name=data.name,
            symbol=data.symbol,
        )

    @staticmethod
    @db_transaction.atomic
    def delete_currency(currency_id: int, workspace: Workspace) -> None:
        """Delete a currency from a workspace."""
        currency = CurrencyService.get_currency(currency_id, workspace)
        if not currency:
            raise HttpError(404, 'Currency not found')
        currency.delete()

    @staticmethod
    @db_transaction.atomic
    def create_default_currencies(workspace: Workspace) -> list[Currency]:
        """Create the four default currencies for a new workspace."""
        return [
            Currency.objects.create(workspace=workspace, symbol=symbol, name=name)
            for symbol, name in DEFAULT_CURRENCIES
        ]
