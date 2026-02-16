"""Django-Ninja API endpoints for period_balances app."""

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from ninja import Query, Router

from budget_periods.models import BudgetPeriod
from common.auth import JWTAuth
from common.permissions import require_role
from core.schemas import DetailOut
from currency_exchanges.models import CurrencyExchange
from period_balances.models import PeriodBalance
from period_balances.schemas import (
    PeriodBalanceOut,
    PeriodBalanceUpdate,
    RecalculateAllRequest,
    RecalculateRequest,
)
from transactions.models import Transaction
from workspaces.models import WRITE_ROLES

router = Router(tags=['Period Balances'])


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


def get_workspace_balance(balance_id: int, workspace_id: int) -> PeriodBalance | None:
    """Helper to get a balance and verify it belongs to the current workspace."""
    balance = (
        PeriodBalance.objects.select_related('budget_period__budget_account')
        .filter(
            id=balance_id,
            budget_period__budget_account__workspace_id=workspace_id,
        )
        .first()
    )
    return balance


def get_or_create_period_balance(period_id: int, currency: str) -> PeriodBalance:
    """Get existing or create new period balance record."""
    balance = PeriodBalance.objects.filter(
        budget_period_id=period_id,
        currency=currency,
    ).first()

    if not balance:
        balance = PeriodBalance.objects.create(
            budget_period_id=period_id,
            currency=currency,
            opening_balance=Decimal('0'),
            total_income=Decimal('0'),
            total_expenses=Decimal('0'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('0'),
        )

    return balance


def recalculate_period_balance(period_id: int, currency: str) -> PeriodBalance:
    """Recalculate balance from scratch using Django ORM."""
    # Get opening balance from previous period
    current_period = BudgetPeriod.objects.filter(id=period_id).first()
    if not current_period:
        raise ValueError('Budget period not found')

    prev_period = (
        BudgetPeriod.objects.filter(
            budget_account_id=current_period.budget_account_id,
            end_date__lt=current_period.start_date,
        )
        .order_by('-end_date')
        .first()
    )

    opening = Decimal('0')
    if prev_period:
        prev_balance = PeriodBalance.objects.filter(
            budget_period_id=prev_period.id,
            currency=currency,
        ).first()
        if prev_balance:
            opening = prev_balance.closing_balance

    # Sum transactions
    income_result = Transaction.objects.filter(
        budget_period_id=period_id,
        currency=currency,
        type='income',
    ).aggregate(total=Sum('amount'))
    income = income_result['total'] or Decimal('0')

    expenses_result = Transaction.objects.filter(
        budget_period_id=period_id,
        currency=currency,
        type='expense',
    ).aggregate(total=Sum('amount'))
    expenses = expenses_result['total'] or Decimal('0')

    # Sum exchanges
    exchanges_in_result = CurrencyExchange.objects.filter(
        budget_period_id=period_id,
        to_currency=currency,
    ).aggregate(total=Sum('to_amount'))
    exchanges_in = exchanges_in_result['total'] or Decimal('0')

    exchanges_out_result = CurrencyExchange.objects.filter(
        budget_period_id=period_id,
        from_currency=currency,
    ).aggregate(total=Sum('from_amount'))
    exchanges_out = exchanges_out_result['total'] or Decimal('0')

    # Update balance
    balance = get_or_create_period_balance(period_id, currency)
    # Preserve manually set opening balances
    if balance.opening_balance == 0:
        balance.opening_balance = opening
    balance.total_income = income
    balance.total_expenses = expenses
    balance.exchanges_in = exchanges_in
    balance.exchanges_out = exchanges_out
    balance.closing_balance = balance.opening_balance + income - expenses + exchanges_in - exchanges_out
    balance.last_calculated_at = timezone.now()
    balance.save()

    return balance


# =============================================================================
# Period Balance Endpoints
# =============================================================================


@router.get('', response=list[PeriodBalanceOut], auth=JWTAuth())
def list_balances(
    request,
    budget_period_id: int | None = Query(None),
    currency: str | None = Query(None),
):
    """List period balances for the current workspace."""
    workspace = request.auth.current_workspace

    if not workspace:
        return 404, {'detail': 'No workspace selected'}

    queryset = PeriodBalance.objects.select_related('budget_period').filter(
        budget_period__budget_account__workspace_id=workspace.id,
    )

    if budget_period_id:
        queryset = queryset.filter(budget_period_id=budget_period_id)

    if currency:
        queryset = queryset.filter(currency=currency)

    return queryset


@router.post('/recalculate', response={200: PeriodBalanceOut, 404: DetailOut}, auth=JWTAuth())
def recalculate_balance(request, data: RecalculateRequest):
    """Recalculate a specific period balance."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        return 404, {'detail': 'No workspace selected'}

    require_role(user, workspace.id, WRITE_ROLES)

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(data.budget_period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Budget period not found'}

    balance = recalculate_period_balance(data.budget_period_id, data.currency)
    return 200, balance


@router.post('/recalculate-all', response={200: list[PeriodBalanceOut], 404: DetailOut}, auth=JWTAuth())
def recalculate_all(request, data: RecalculateAllRequest):
    """Recalculate all currency balances for a period."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        return 404, {'detail': 'No workspace selected'}

    require_role(user, workspace.id, WRITE_ROLES)

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(data.budget_period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Budget period not found'}

    currencies = ['PLN', 'USD', 'EUR', 'UAH']
    results = []
    for currency in currencies:
        balance = recalculate_period_balance(data.budget_period_id, currency)
        results.append(balance)

    return 200, results


@router.get('/{balance_id}', response={200: PeriodBalanceOut, 404: DetailOut}, auth=JWTAuth())
def get_balance(request, balance_id: int):
    """Get a specific period balance."""
    workspace = request.auth.current_workspace

    if not workspace:
        return 404, {'detail': 'No workspace selected'}

    balance = get_workspace_balance(balance_id, workspace.id)
    if not balance:
        return 404, {'detail': 'Period balance not found'}

    return 200, balance


@router.put('/{balance_id}', response={200: PeriodBalanceOut, 404: DetailOut}, auth=JWTAuth())
def update_balance(request, balance_id: int, data: PeriodBalanceUpdate):
    """Update a period balance (opening balance)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        return 404, {'detail': 'No workspace selected'}

    require_role(user, workspace.id, WRITE_ROLES)

    balance = get_workspace_balance(balance_id, workspace.id)
    if not balance:
        return 404, {'detail': 'Period balance not found'}

    # Update opening balance
    balance.opening_balance = data.opening_balance

    # Recalculate closing balance
    balance.closing_balance = (
        balance.opening_balance
        + balance.total_income
        + balance.exchanges_in
        - balance.total_expenses
        - balance.exchanges_out
    )

    balance.updated_by = user
    balance.save()

    return 200, balance
