"""Business logic for the reports app."""

from decimal import Decimal

from django.db.models import Sum

from budget_periods.services import BudgetPeriodService
from budgets.models import Budget
from period_balances.models import PeriodBalance
from reports.schemas import BudgetSummaryCategoryItem
from transactions.models import Transaction
from workspaces.models import Currency


class ReportService:
    @staticmethod
    def get_budget_summary(workspace_id: int, period_id: int) -> tuple:
        """Return (period, summary_items, balances) for a period budget summary."""
        period = BudgetPeriodService.get(period_id, workspace_id)

        budgets = Budget.objects.filter(budget_period_id=period_id).select_related('category', 'currency')

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
                    currency=budget.currency.symbol,
                    budget=budget.amount,
                    actual=actual,
                    difference=budget.amount - actual,
                )
            )

        balances = list(PeriodBalance.objects.filter(budget_period_id=period_id).select_related('currency'))
        return period, summary, balances

    @staticmethod
    def get_current_balances(workspace_id: int, currencies: list[Currency]) -> dict[str, Decimal]:
        """Return the latest closing balance per currency for the workspace."""
        result = {}
        for currency in currencies:
            latest_balance = (
                PeriodBalance.objects.filter(currency__symbol=currency.symbol)
                .select_related('budget_period__budget_account', 'currency')
                .filter(budget_period__budget_account__workspace_id=workspace_id)
                .order_by('-budget_period__end_date')
                .first()
            )
            result[currency.symbol] = latest_balance.closing_balance if latest_balance else Decimal('0')
        return result
