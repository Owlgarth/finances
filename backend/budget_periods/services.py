"""Business logic for the budget_periods app."""

from dateutil.relativedelta import relativedelta
from django.db import transaction as db_transaction
from ninja.errors import HttpError

from budget_periods.models import BudgetPeriod
from budget_periods.schemas import BudgetPeriodCopy
from budgets.models import Budget
from categories.models import Category
from common.permissions import require_role
from common.services.base import get_workspace_currencies, get_workspace_period
from period_balances.models import PeriodBalance
from planned_transactions.models import PlannedTransaction
from workspaces.models import WRITE_ROLES


class BudgetPeriodService:
    @staticmethod
    def get_period(period_id: int, workspace_id: int) -> BudgetPeriod | None:
        """Get a period and verify it belongs to the workspace."""
        return get_workspace_period(period_id, workspace_id)

    @staticmethod
    @db_transaction.atomic
    def copy(user, workspace, source_period_id: int, data: BudgetPeriodCopy) -> BudgetPeriod:
        """Copy a period with all categories, budgets, and planned transactions."""
        require_role(user, workspace.id, WRITE_ROLES)

        source_period = get_workspace_period(source_period_id, workspace.id)
        if not source_period:
            raise HttpError(404, 'Period not found')

        # Create new period in the same budget account as the source
        new_period = BudgetPeriod.objects.create(
            budget_account_id=source_period.budget_account_id,
            name=data.name,
            start_date=data.start_date,
            end_date=data.end_date,
            weeks=data.weeks,
            created_by=user,
            updated_by=user,
        )

        # Create period balances for all currencies
        currencies = get_workspace_currencies(workspace)
        PeriodBalance.objects.bulk_create(
            [
                PeriodBalance(
                    budget_period=new_period,
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

        # Calculate date offset between periods
        date_offset = relativedelta(new_period.start_date, source_period.start_date)

        # Copy categories and keep old-to-new mapping
        category_mapping = {}  # old_id -> new_category
        for source_category in source_period.categories.all():
            new_category = Category.objects.create(
                budget_period=new_period,
                name=source_category.name,
                created_by=user,
            )
            category_mapping[source_category.id] = new_category

        # Copy budgets using the category mapping
        Budget.objects.bulk_create(
            [
                Budget(
                    budget_period=new_period,
                    category_id=category_mapping[source_budget.category_id].id,
                    currency=source_budget.currency,
                    amount=source_budget.amount,
                )
                for source_budget in source_period.budgets.all()
                if source_budget.category_id in category_mapping
            ]
        )

        # Copy planned transactions with adjusted dates and reset status
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
