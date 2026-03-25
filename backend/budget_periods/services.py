"""Business logic for the budget_periods app."""

from datetime import date

from dateutil.relativedelta import relativedelta
from django.db import transaction as db_transaction

from budget_accounts.models import BudgetAccount
from budget_periods.exceptions import BudgetPeriodAccountNotFoundError, BudgetPeriodNotFoundError
from budget_periods.models import BudgetPeriod
from budget_periods.schemas import BudgetPeriodCopy, BudgetPeriodCreate, BudgetPeriodUpdate
from budgets.models import Budget
from categories.models import Category
from common.services.base import get_workspace_currencies
from period_balances.models import PeriodBalance
from planned_transactions.models import PlannedTransaction


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
        """Delete a budget period and all its financial records.

        Transaction, PlannedTransaction, and CurrencyExchange have
        on_delete=SET_NULL on budget_period. Django would orphan them
        (set budget_period=NULL) rather than cascade-delete them.
        We delete them explicitly to avoid orphaned records.
        """
        from currency_exchanges.models import CurrencyExchange
        from planned_transactions.models import PlannedTransaction
        from transactions.models import Transaction

        period = BudgetPeriodService.get(period_id, workspace_id)
        Transaction.objects.filter(budget_period=period).delete()
        PlannedTransaction.objects.filter(budget_period=period).delete()
        CurrencyExchange.objects.filter(budget_period=period).delete()
        period.delete()

    @staticmethod
    @db_transaction.atomic
    def copy(user, workspace_id: int, source_period_id: int, data: BudgetPeriodCopy) -> BudgetPeriod:
        """Copy a period with all categories, budgets, and planned transactions."""
        source_period = BudgetPeriodService.get(source_period_id, workspace_id)

        new_period = BudgetPeriod.objects.create(
            budget_account_id=source_period.budget_account_id,
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
                    budget_period=new_period,
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

        date_offset = relativedelta(new_period.start_date, source_period.start_date)

        category_mapping = {}
        for source_category in source_period.categories.all():
            new_category = Category.objects.create(
                budget_period=new_period,
                workspace_id=workspace_id,
                name=source_category.name,
                created_by=user,
            )
            category_mapping[source_category.id] = new_category

        Budget.objects.bulk_create(
            [
                Budget(
                    budget_period=new_period,
                    workspace_id=workspace_id,
                    category_id=category_mapping[source_budget.category_id].id,
                    currency=source_budget.currency,
                    amount=source_budget.amount,
                )
                for source_budget in source_period.budgets.all()
                if source_budget.category_id in category_mapping
            ]
        )

        planned_to_create = []
        for source_planned in source_period.planned_transactions.all():
            new_category_id = None
            if source_planned.category_id:
                new_category = category_mapping.get(source_planned.category_id)
                if new_category:
                    new_category_id = new_category.id

            planned_to_create.append(
                PlannedTransaction(
                    budget_period=new_period,
                    workspace_id=workspace_id,
                    name=source_planned.name,
                    amount=source_planned.amount,
                    currency=source_planned.currency,
                    category_id=new_category_id,
                    planned_date=source_planned.planned_date + date_offset,
                    payment_date=None,
                    status='pending',
                    transaction_id=None,
                    created_by=user,
                )
            )

        PlannedTransaction.objects.bulk_create(planned_to_create)

        return new_period
