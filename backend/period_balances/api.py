"""Django-Ninja API endpoints for period_balances app."""

from ninja import Query, Router

from common.auth import JWTAuth
from common.permissions import require_role
from common.services.base import get_workspace_currencies, get_workspace_period
from core.schemas import DetailOut
from period_balances.schemas import (
    PeriodBalanceOut,
    PeriodBalanceUpdate,
    RecalculateAllRequest,
    RecalculateRequest,
)
from period_balances.services import PeriodBalanceService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Period Balances'])


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

    from period_balances.models import PeriodBalance

    queryset = PeriodBalance.objects.select_related('budget_period').filter(
        budget_period__budget_account__workspace_id=workspace.id,
    )

    if budget_period_id:
        queryset = queryset.filter(budget_period_id=budget_period_id)

    if currency:
        queryset = queryset.filter(currency__symbol=currency)

    return queryset


@router.post('/recalculate', response={200: PeriodBalanceOut, 404: DetailOut}, auth=JWTAuth())
def recalculate_balance(request, data: RecalculateRequest):
    """Recalculate a specific period balance."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        return 404, {'detail': 'No workspace selected'}

    require_role(user, workspace.id, WRITE_ROLES)

    period = get_workspace_period(data.budget_period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Budget period not found'}

    balance = PeriodBalanceService.recalculate(data.budget_period_id, data.currency)
    return 200, balance


@router.post('/recalculate-all', response={200: list[PeriodBalanceOut], 404: DetailOut}, auth=JWTAuth())
def recalculate_all(request, data: RecalculateAllRequest):
    """Recalculate all currency balances for a period."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        return 404, {'detail': 'No workspace selected'}

    require_role(user, workspace.id, WRITE_ROLES)

    period = get_workspace_period(data.budget_period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Budget period not found'}

    currencies = get_workspace_currencies(workspace)
    results = [PeriodBalanceService.recalculate(data.budget_period_id, currency.symbol) for currency in currencies]
    return 200, results


@router.get('/{balance_id}', response={200: PeriodBalanceOut, 404: DetailOut}, auth=JWTAuth())
def get_balance(request, balance_id: int):
    """Get a specific period balance."""
    workspace = request.auth.current_workspace

    if not workspace:
        return 404, {'detail': 'No workspace selected'}

    balance = PeriodBalanceService.get_balance(balance_id, workspace.id)
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

    balance = PeriodBalanceService.update_opening_balance(user, workspace, balance_id, data)
    return 200, balance
