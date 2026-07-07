"""Business logic for the reports app."""

from decimal import Decimal

from period_balances.models import PeriodBalance
from workspaces.models import Currency

# The budget-summary report was deleted with the legacy allocation app in B4.
# Rebuilt in B8 on budgeting models (planned vs actual per category).


class ReportService:
    @staticmethod
    def get_current_balances(workspace_id: int, currencies: list[Currency]) -> dict[str, Decimal]:
        """Return the latest closing balance per currency for the workspace."""
        result = {}
        for currency in currencies:
            latest_balance = (
                PeriodBalance.objects.for_workspace(workspace_id)
                .filter(currency__symbol=currency.symbol)
                .select_related('budget_period__budget_account', 'currency')
                .order_by('-budget_period__end_date')
                .first()
            )
            result[currency.symbol] = latest_balance.closing_balance if latest_balance else Decimal('0')
        return result
