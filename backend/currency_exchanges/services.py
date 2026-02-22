"""Business logic for the currency_exchanges app."""

from django.db import transaction as db_transaction
from ninja.errors import HttpError

from budget_periods.models import BudgetPeriod
from common.permissions import require_role
from common.services.base import get_or_create_period_balance, get_workspace_period
from currency_exchanges.models import CurrencyExchange
from currency_exchanges.schemas import CurrencyExchangeCreate, CurrencyExchangeImport, CurrencyExchangeUpdate
from period_balances.models import PeriodBalance
from workspaces.models import WRITE_ROLES


class CurrencyExchangeService:
    @staticmethod
    def get_exchange(exchange_id: int, workspace_id: int) -> CurrencyExchange | None:
        """Get an exchange and verify it belongs to the workspace."""
        return (
            CurrencyExchange.objects.select_related('budget_period__budget_account')
            .filter(
                id=exchange_id,
                budget_period__budget_account__workspace_id=workspace_id,
            )
            .first()
        )

    @staticmethod
    def _update_balance(balance: PeriodBalance) -> None:
        """Recalculate and save closing balance after exchange changes."""
        balance.closing_balance = (
            balance.opening_balance
            + balance.total_income
            - balance.total_expenses
            + balance.exchanges_in
            - balance.exchanges_out
        )
        balance.save(update_fields=['exchanges_in', 'exchanges_out', 'closing_balance'])

    @staticmethod
    def _find_period_for_date(workspace_id: int, date) -> int | None:
        """Return the period ID covering the given date, or None."""
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace_id,
                start_date__lte=date,
                end_date__gte=date,
            )
            .first()
        )
        return period.id if period else None

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace, data: CurrencyExchangeCreate) -> CurrencyExchange:
        """Create an exchange record and update period balances."""
        require_role(user, workspace.id, WRITE_ROLES)

        period_id = CurrencyExchangeService._find_period_for_date(workspace.id, data.date)
        exchange_rate = data.to_amount / data.from_amount

        exchange = CurrencyExchange.objects.create(
            date=data.date,
            description=data.description,
            from_currency=data.from_currency,
            from_amount=data.from_amount,
            to_currency=data.to_currency,
            to_amount=data.to_amount,
            exchange_rate=exchange_rate,
            budget_period_id=period_id,
            created_by=user,
            updated_by=user,
        )

        if period_id:
            balance_from = get_or_create_period_balance(period_id, data.from_currency)
            balance_from.exchanges_out += data.from_amount
            CurrencyExchangeService._update_balance(balance_from)

            balance_to = get_or_create_period_balance(period_id, data.to_currency)
            balance_to.exchanges_in += data.to_amount
            CurrencyExchangeService._update_balance(balance_to)

        return exchange

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace, exchange_id: int, data: CurrencyExchangeUpdate) -> CurrencyExchange:
        """Update an exchange, reversing old balances and applying new ones."""
        require_role(user, workspace.id, WRITE_ROLES)

        exchange = CurrencyExchangeService.get_exchange(exchange_id, workspace.id)
        if not exchange:
            raise HttpError(404, 'Exchange not found')

        # Revert old balances
        if exchange.budget_period_id:
            balance_from = get_or_create_period_balance(exchange.budget_period_id, exchange.from_currency)
            balance_from.exchanges_out -= exchange.from_amount
            CurrencyExchangeService._update_balance(balance_from)

            balance_to = get_or_create_period_balance(exchange.budget_period_id, exchange.to_currency)
            balance_to.exchanges_in -= exchange.to_amount
            CurrencyExchangeService._update_balance(balance_to)

        new_period_id = CurrencyExchangeService._find_period_for_date(workspace.id, data.date)
        exchange_rate = data.to_amount / data.from_amount

        exchange.date = data.date
        exchange.description = data.description
        exchange.from_currency = data.from_currency
        exchange.from_amount = data.from_amount
        exchange.to_currency = data.to_currency
        exchange.to_amount = data.to_amount
        exchange.budget_period_id = new_period_id
        exchange.exchange_rate = exchange_rate
        exchange.updated_by = user
        exchange.save()

        if new_period_id:
            balance_from = get_or_create_period_balance(new_period_id, data.from_currency)
            balance_from.exchanges_out += data.from_amount
            CurrencyExchangeService._update_balance(balance_from)

            balance_to = get_or_create_period_balance(new_period_id, data.to_currency)
            balance_to.exchanges_in += data.to_amount
            CurrencyExchangeService._update_balance(balance_to)

        return exchange

    @staticmethod
    @db_transaction.atomic
    def delete(user, workspace, exchange_id: int) -> None:
        """Delete an exchange and revert period balances."""
        require_role(user, workspace.id, WRITE_ROLES)

        exchange = CurrencyExchangeService.get_exchange(exchange_id, workspace.id)
        if not exchange:
            raise HttpError(404, 'Exchange not found')

        if exchange.budget_period_id:
            balance_from = get_or_create_period_balance(exchange.budget_period_id, exchange.from_currency)
            balance_from.exchanges_out -= exchange.from_amount
            CurrencyExchangeService._update_balance(balance_from)

            balance_to = get_or_create_period_balance(exchange.budget_period_id, exchange.to_currency)
            balance_to.exchanges_in -= exchange.to_amount
            CurrencyExchangeService._update_balance(balance_to)

        exchange.delete()

    @staticmethod
    def export(workspace, period_id: int) -> list[dict]:
        """Return serialisable exchange data for a period."""
        period = get_workspace_period(period_id, workspace.id)
        if not period:
            raise HttpError(404, 'Budget period not found')

        exchanges = CurrencyExchange.objects.filter(budget_period_id=period_id).order_by('-date')
        return [
            {
                'date': e.date.isoformat(),
                'description': e.description,
                'from_currency': e.from_currency,
                'from_amount': str(e.from_amount),
                'to_currency': e.to_currency,
                'to_amount': str(e.to_amount),
                'exchange_rate': str(e.exchange_rate) if e.exchange_rate else None,
            }
            for e in exchanges
        ]

    @staticmethod
    @db_transaction.atomic
    def import_data(user, workspace, period_id: int, data: list) -> int:
        """Bulk-create exchanges from parsed JSON data. Returns count of created records."""
        require_role(user, workspace.id, WRITE_ROLES)

        period = get_workspace_period(period_id, workspace.id)
        if not period:
            raise HttpError(404, 'Budget period not found')

        new_exchanges = []
        for item in data:
            try:
                import_item = CurrencyExchangeImport(**item)
            except Exception as e:
                raise HttpError(400, f'Invalid data format: {e}')

            exchange_rate = import_item.to_amount / import_item.from_amount
            new_exchanges.append(
                CurrencyExchange(
                    date=import_item.date,
                    description=import_item.description,
                    from_currency=import_item.from_currency,
                    from_amount=import_item.from_amount,
                    to_currency=import_item.to_currency,
                    to_amount=import_item.to_amount,
                    exchange_rate=exchange_rate,
                    budget_period_id=period_id,
                    created_by=user,
                    updated_by=user,
                )
            )

        if not new_exchanges:
            return 0

        CurrencyExchange.objects.bulk_create(new_exchanges)

        for exchange in new_exchanges:
            balance_from = get_or_create_period_balance(period_id, exchange.from_currency)
            balance_from.exchanges_out += exchange.from_amount
            CurrencyExchangeService._update_balance(balance_from)

            balance_to = get_or_create_period_balance(period_id, exchange.to_currency)
            balance_to.exchanges_in += exchange.to_amount
            CurrencyExchangeService._update_balance(balance_to)

        return len(new_exchanges)
