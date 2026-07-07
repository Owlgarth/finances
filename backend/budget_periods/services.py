"""Business logic for the budget_periods app."""

from datetime import date

from django.db import transaction as db_transaction

from budget_accounts.models import BudgetAccount
from budget_periods.exceptions import BudgetPeriodAccountNotFoundError, BudgetPeriodNotFoundError
from budget_periods.models import BudgetPeriod
from budget_periods.schemas import BudgetPeriodCreate, BudgetPeriodUpdate
from common.services.base import get_workspace_currencies
from currency_exchanges.models import CurrencyExchange
from period_balances.models import PeriodBalance


class BudgetPeriodService:
    @staticmethod
    def list(workspace_id: int, budget_account_id: int | None = None) -> list[BudgetPeriod]:
        """List budget periods for a workspace, optionally filtered by budget account."""
        queryset = BudgetPeriod.objects.select_related('budget_account').for_workspace(workspace_id)
        if budget_account_id:
            queryset = queryset.filter(budget_account_id=budget_account_id)
        return list(queryset.order_by('-start_date'))

    @staticmethod
    def get(period_id: int, workspace_id: int) -> BudgetPeriod:
        """Get a period by ID, raising BudgetPeriodNotFoundError if not found."""
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .for_workspace(workspace_id)
            .filter(id=period_id)
            .first()
        )
        if not period:
            raise BudgetPeriodNotFoundError()
        return period

    @staticmethod
    def get_current(workspace_id: int, current_date: date) -> BudgetPeriod | None:
        """Get the budget period containing the given date. Returns None if not found."""
        return (
            BudgetPeriod.objects.select_related('budget_account')
            .for_workspace(workspace_id)
            .containing(current_date)
            .first()
        )

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: BudgetPeriodCreate) -> BudgetPeriod:
        """Create a new budget period with period balances for all currencies."""
        budget_account = BudgetAccount.objects.filter(id=data.budget_account_id, workspace_id=workspace_id).first()
        if not budget_account:
            raise BudgetPeriodAccountNotFoundError()

        period = BudgetPeriod.objects.create(
            budget_account_id=data.budget_account_id,
            workspace_id=workspace_id,
            name=data.name,
            start_date=data.start_date,
            end_date=data.end_date,
            weeks=data.weeks,
            created_by=user,
            updated_by=user,
        )

        currencies = get_workspace_currencies(workspace_id)
        PeriodBalance.objects.bulk_create(
            [
                PeriodBalance(
                    budget_period=period,
                    workspace_id=workspace_id,
                    currency=currency,
                    opening_balance=0,
                    total_income=0,
                    total_expenses=0,
                    exchanges_in=0,
                    exchanges_out=0,
                    closing_balance=0,
                )
                for currency in currencies
            ]
        )

        return period

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, period_id: int, data: BudgetPeriodUpdate) -> BudgetPeriod:
        """Update a budget period."""
        period = BudgetPeriodService.get(period_id, workspace_id)

        if data.budget_account_id is not None and data.budget_account_id != period.budget_account_id:
            new_account = BudgetAccount.objects.filter(id=data.budget_account_id, workspace_id=workspace_id).first()
            if not new_account:
                raise BudgetPeriodAccountNotFoundError()
            period.budget_account_id = data.budget_account_id

        if data.name is not None:
            period.name = data.name
        if data.start_date is not None:
            period.start_date = data.start_date
        if data.end_date is not None:
            period.end_date = data.end_date
        if data.weeks is not None:
            period.weeks = data.weeks

        period.updated_by = user
        period.save()
        return period

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, period_id: int) -> None:
        """Delete a budget period and its period-scoped legacy records.

        CurrencyExchange has on_delete=SET_NULL on budget_period; delete
        explicitly to avoid orphans. Transactions/planned transactions live
        on accounts since B5/B7 and are untouched.
        """
        period = BudgetPeriodService.get(period_id, workspace_id)
        CurrencyExchange.objects.filter(budget_period=period).delete()
        period.delete()
