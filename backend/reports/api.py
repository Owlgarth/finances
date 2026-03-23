"""Django-Ninja API endpoints for reports app."""

from decimal import Decimal

from ninja import Query, Router

from common.auth import WorkspaceJWTAuth
from common.services.base import get_workspace_currencies
from core.schemas import DetailOut
from reports.schemas import (
    BudgetSummaryOut,
    BudgetSummaryResponse,
    CurrencyBalances,
    CurrencySummary,
    CurrentBalancesResponse,
)
from reports.services import ReportService

router = Router(tags=['Reports'])


# =============================================================================
# Reports Endpoints
# =============================================================================


@router.get('/budget-summary', response={200: BudgetSummaryResponse, 404: DetailOut}, auth=WorkspaceJWTAuth())
def budget_summary(request, budget_period_id: int = Query(...)):
    """Get a budget summary for a specific period."""
    workspace_id = request.auth.current_workspace_id

    period, summary, balances = ReportService.get_budget_summary(workspace_id, budget_period_id)

    # Group by currency
    by_currency: dict[str, CurrencySummary] = {}
    for item in summary:
        currency = item.currency
        if currency not in by_currency:
            by_currency[currency] = CurrencySummary(
                total_budget=Decimal('0'),
                total_actual=Decimal('0'),
                categories=[],
            )
        by_currency[currency].total_budget += item.budget
        by_currency[currency].total_actual += item.actual
        by_currency[currency].categories.append(item)

    # Format balances
    balances_dict: dict[str, CurrencyBalances] = {}
    for balance in balances:
        balances_dict[balance.currency.symbol] = CurrencyBalances(
            opening=balance.opening_balance,
            income=balance.total_income,
            expenses=balance.total_expenses,
            closing=balance.closing_balance,
        )

    return 200, BudgetSummaryResponse(
        period=BudgetSummaryOut(
            id=period.id,
            name=period.name,
            start_date=period.start_date,
            end_date=period.end_date,
        ),
        currencies=by_currency,
        balances=balances_dict,
    )


@router.get('/current-balances', response=CurrentBalancesResponse, auth=WorkspaceJWTAuth())
def current_balances(request):
    """Get the current balances for all currencies in the workspace."""
    workspace_id = request.auth.current_workspace_id

    currencies = get_workspace_currencies(workspace_id)
    result = ReportService.get_current_balances(workspace_id, currencies)
    return CurrentBalancesResponse(**result)
