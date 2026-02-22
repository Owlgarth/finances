"""Business logic for the reports app."""

from decimal import Decimal

from django.db.models import Sum
from ninja.errors import HttpError

from budgets.models import Budget
from common.services.base import get_workspace_period
from period_balances.models import PeriodBalance
from reports.schemas import BudgetSummaryCategoryItem
from transactions.models import Transaction


class ReportService:
    @staticmethod
    def get_budget_summary(workspace, period_id: int) -> tuple:
        """Return (period, summary_items, balances) for a period budget summary.

        Raises HttpError 404 if the period does not belong to the workspace.
        """
        period = get_workspace_period(period_id, workspace.id)
        if not period:
            raise HttpError(404, 'Budget period not found')

        budgets = Budget.objects.filter(budget_period_id=period_id).select_related('category')

        summary = []
        for budget in budgets:
            actual = Transaction.objects.filter(
                budget_period_id=period_id,
                category_id=budget.category_id,
                currency=budget.currency,
                type='expense',
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
            summary.append(
                BudgetSummaryCategoryItem(
                    id=budget.id,
                    category_id=budget.category_id,
                    category=budget.category.name,
                    currency=budget.currency,
                    budget=budget.amount,
                    actual=actual,
                    difference=budget.amount - actual,
                )
            )

        balances = list(PeriodBalance.objects.filter(budget_period_id=period_id))
        return period, summary, balances

    @staticmethod
    def get_current_balances(workspace, currencies: list[str]) -> dict[str, Decimal]:
        """Return the latest closing balance per currency for the workspace."""
        result = {}
        for currency in currencies:
            latest_balance = (
                PeriodBalance.objects.filter(currency=currency)
                .select_related('budget_period__budget_account')
                .filter(budget_period__budget_account__workspace_id=workspace.id)
                .order_by('-budget_period__end_date')
                .first()
            )
            result[currency] = latest_balance.closing_balance if latest_balance else Decimal('0')
        return result
