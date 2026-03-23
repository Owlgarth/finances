"""Django-Ninja API endpoints for period_balances app."""

from ninja import Query, Router

from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from period_balances.schemas import (
    PeriodBalanceOut,
    PeriodBalanceUpdate,
    RecalculateAllRequest,
    RecalculateRequest,
)
from period_balances.services import PeriodBalanceService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Period Balances'])


@router.get('', response=list[PeriodBalanceOut], auth=WorkspaceJWTAuth())
def list_balances(
    request,
    budget_period_id: int | None = Query(None),
    currency: str | None = Query(None),
):
    """List period balances for the current workspace."""
    workspace_id = request.auth.current_workspace_id
    return PeriodBalanceService.list(workspace_id, budget_period_id, currency)


@router.post('/recalculate', response=PeriodBalanceOut, auth=WorkspaceJWTAuth())
def recalculate_balance(request, data: RecalculateRequest):
    """Recalculate a specific period balance."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id

    require_role(user, workspace_id, WRITE_ROLES)
    PeriodBalanceService.get_validated_period(data.budget_period_id, workspace_id)

    balance = PeriodBalanceService.recalculate(data.budget_period_id, data.currency)
    return balance


@router.post('/recalculate-all', response=list[PeriodBalanceOut], auth=WorkspaceJWTAuth())
def recalculate_all(request, data: RecalculateAllRequest):
    """Recalculate all currency balances for a period."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id

    require_role(user, workspace_id, WRITE_ROLES)

    results = PeriodBalanceService.recalculate_all(workspace_id, data.budget_period_id)
    return results


@router.get('/{balance_id}', response=PeriodBalanceOut, auth=WorkspaceJWTAuth())
def get_balance(request, balance_id: int):
    """Get a specific period balance."""
    workspace_id = request.auth.current_workspace_id
    return PeriodBalanceService.get(balance_id, workspace_id)


@router.put('/{balance_id}', response=PeriodBalanceOut, auth=WorkspaceJWTAuth())
def update_balance(request, balance_id: int, data: PeriodBalanceUpdate):
    """Update a period balance (opening balance)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return PeriodBalanceService.update_opening_balance(user, workspace_id, balance_id, data)
