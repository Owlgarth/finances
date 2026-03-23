"""Django-Ninja API endpoints for budget_accounts app."""

from django.http import HttpRequest
from ninja import Query, Router

from budget_accounts.schemas import BudgetAccountArchive, BudgetAccountCreate, BudgetAccountOut, BudgetAccountUpdate
from budget_accounts.services import BudgetAccountService
from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from workspaces.models import ADMIN_ROLES

router = Router(tags=['Budget Accounts'])


@router.get('', response=list[BudgetAccountOut], auth=WorkspaceJWTAuth())
def list_budget_accounts(
    request: HttpRequest,
    include_inactive: bool = Query(False),
):
    """List all budget accounts in current workspace."""
    workspace_id = request.auth.current_workspace_id
    return BudgetAccountService.list(workspace_id, include_inactive)


@router.get('/{account_id}', response=BudgetAccountOut, auth=WorkspaceJWTAuth())
def get_budget_account(request: HttpRequest, account_id: int):
    """Get a specific budget account."""
    workspace_id = request.auth.current_workspace_id
    return BudgetAccountService.get(account_id, workspace_id)


@router.post('', response={201: BudgetAccountOut}, auth=WorkspaceJWTAuth())
def create_budget_account(request: HttpRequest, data: BudgetAccountCreate):
    """Create a new budget account (requires owner or admin role)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return 201, BudgetAccountService.create(user, workspace_id, data)


@router.put('/{account_id}', response=BudgetAccountOut, auth=WorkspaceJWTAuth())
def update_budget_account(request: HttpRequest, account_id: int, data: BudgetAccountUpdate):
    """Update a budget account (requires owner or admin role)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return BudgetAccountService.update(user, workspace_id, account_id, data)


@router.delete('/{account_id}', response={204: None}, auth=WorkspaceJWTAuth())
def delete_budget_account(request: HttpRequest, account_id: int):
    """Delete a budget account (requires owner or admin role)."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, ADMIN_ROLES)
    BudgetAccountService.delete(workspace_id, account_id)
    return 204, None


@router.patch('/{account_id}/archive', response=BudgetAccountOut, auth=WorkspaceJWTAuth())
def set_archive_status_budget_account(request: HttpRequest, account_id: int, data: BudgetAccountArchive):
    """Archive or unarchive a budget account (set is_active)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return BudgetAccountService.set_archive_status(user, workspace_id, account_id, data)
