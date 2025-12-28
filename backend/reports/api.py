"""Django-Ninja API endpoints for reports app."""

from decimal import Decimal

from django.db.models import Sum
from ninja import Query, Router
from ninja.errors import HttpError

from budget_periods.models import BudgetPeriod
from budgets.models import Budget
from common.auth import JWTAuth
from core.schemas import DetailOut
from period_balances.models import PeriodBalance
from reports.schemas import (
    BudgetSummaryCategoryItem,
    BudgetSummaryOut,
    BudgetSummaryResponse,
    CurrencyBalances,
    CurrencySummary,
    CurrentBalancesResponse,
)
from transactions.models import Transaction

router = Router(tags=['Reports'])


# =============================================================================
# Helper Functions
# =============================================================================


def get_workspace_period(period_id: int, workspace_id: int) -> BudgetPeriod | None:
    """Helper to get a period and verify it belongs to the current workspace."""
    period = (
        BudgetPeriod.objects.select_related('budget_account')
        .filter(id=period_id, budget_account__workspace_id=workspace_id)
        .first()
    )
    return period


def get_budget_summary(budget_period_id: int) -> list[BudgetSummaryCategoryItem]:
    """Get budget summary with actual spending for a period."""
    # Get all budgets for the period
    budgets = Budget.objects.filter(budget_period_id=budget_period_id).select_related('category')

    summary = []
    for budget in budgets:
        # Calculate actual spending for this category and currency
        actual_result = Transaction.objects.filter(
            budget_period_id=budget_period_id,
            category_id=budget.category_id,
            currency=budget.currency,
            type='expense',
        ).aggregate(total=Sum('amount'))
        actual = actual_result['total'] or Decimal('0')

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

    return summary


# =============================================================================
# Reports Endpoints
# =============================================================================


@router.get('/budget-summary', response={200: BudgetSummaryResponse, 404: DetailOut}, auth=JWTAuth())
def budget_summary(request, budget_period_id: int = Query(...)):
    """Get a budget summary for a specific period."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Budget period not found'}

    # Get budget summary
    summary = get_budget_summary(budget_period_id)

    # Get balances
    balances = PeriodBalance.objects.filter(budget_period_id=budget_period_id)

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
        balances_dict[balance.currency] = CurrencyBalances(
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


@router.get('/current-balances', response=CurrentBalancesResponse, auth=JWTAuth())
def current_balances(request):
    """Get the current balances for all currencies in the workspace."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    currencies = ['PLN', 'USD', 'EUR', 'UAH']
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

    return CurrentBalancesResponse(**result)
