"""Django-Ninja API endpoints for budget periods."""

from datetime import date
from typing import Optional

from ninja import Query, Router

from budget_periods.schemas import (
    BudgetPeriodCopy,
    BudgetPeriodCreate,
    BudgetPeriodOut,
    BudgetPeriodUpdate,
)
from budget_periods.services import BudgetPeriodService
from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from core.schemas import DetailOut
from workspaces.models import WRITE_ROLES

router = Router(tags=['Budget Periods'])


@router.get('', response=list[BudgetPeriodOut], auth=WorkspaceJWTAuth())
def list_periods(request, budget_account_id: Optional[int] = Query(None)):
    """List budget periods for the current workspace, optionally filtered by budget account."""
    workspace_id = request.auth.current_workspace_id
    return BudgetPeriodService.list(workspace_id, budget_account_id)


@router.get('/current', response={200: BudgetPeriodOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_current_period(request, current_date: date):
    """Get the budget period containing the given date for the current workspace."""
    workspace_id = request.auth.current_workspace_id
    period = BudgetPeriodService.get_current(workspace_id, current_date)
    if not period:
        return 404, {'detail': 'No budget period found for the given date'}
    return 200, period


@router.get('{period_id}', response=BudgetPeriodOut, auth=WorkspaceJWTAuth())
def get_period(request, period_id: int):
    """Get a specific budget period by ID."""
    workspace_id = request.auth.current_workspace_id
    return BudgetPeriodService.get(period_id, workspace_id)


@router.post('', response={201: BudgetPeriodOut}, auth=WorkspaceJWTAuth())
def create_period(request, data: BudgetPeriodCreate):
    """Create a new budget period. The budget_account_id must belong to the current workspace."""
    user = request.auth
    workspace_id = user.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return 201, BudgetPeriodService.create(user, workspace_id, data)


@router.put('{period_id}', response=BudgetPeriodOut, auth=WorkspaceJWTAuth())
def update_period(request, period_id: int, data: BudgetPeriodUpdate):
    """Update a budget period."""
    user = request.auth
    workspace_id = user.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return BudgetPeriodService.update(user, workspace_id, period_id, data)


@router.delete('{period_id}', response={204: None}, auth=WorkspaceJWTAuth())
def delete_period(request, period_id: int):
    """Delete a budget period."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    BudgetPeriodService.delete(workspace_id, period_id)
    return 204, None


@router.post('{period_id}/copy', response={201: BudgetPeriodOut}, auth=WorkspaceJWTAuth())
def copy_period(request, period_id: int, data: BudgetPeriodCopy):
    """Copy a budget period with all categories, budgets, and planned transactions."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return 201, BudgetPeriodService.copy(user, workspace_id, period_id, data)
