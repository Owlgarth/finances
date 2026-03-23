"""Django-Ninja API endpoints for budgets app."""

from django.http import HttpRequest
from ninja import Query, Router

from budgets.schemas import BudgetCreate, BudgetOut, BudgetUpdate
from budgets.services import BudgetService
from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from workspaces.models import WRITE_ROLES

router = Router(tags=['Budgets'])


@router.get('', response=list[BudgetOut], auth=WorkspaceJWTAuth())
def list_budgets(
    request: HttpRequest,
    budget_period_id: int | None = Query(None),
):
    """List budgets for the current workspace, optionally filtered by period."""
    workspace_id = request.auth.current_workspace_id
    return BudgetService.list(workspace_id, budget_period_id)


@router.post('', response={201: BudgetOut}, auth=WorkspaceJWTAuth())
def create_budget(request: HttpRequest, data: BudgetCreate):
    """Create a new budget entry."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    budget = BudgetService.create(user, workspace_id, data)
    return 201, budget


@router.put('/{budget_id}', response=BudgetOut, auth=WorkspaceJWTAuth())
def update_budget(request: HttpRequest, budget_id: int, data: BudgetUpdate):
    """Update a budget entry."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return BudgetService.update(user, workspace_id, budget_id, data)


@router.delete('/{budget_id}', response={204: None}, auth=WorkspaceJWTAuth())
def delete_budget(request: HttpRequest, budget_id: int):
    """Delete a budget entry."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, WRITE_ROLES)
    BudgetService.delete(workspace_id, budget_id)
    return 204, None
