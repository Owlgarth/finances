"""Django-Ninja API endpoints for budget_accounts app."""

from django.contrib.auth import get_user_model
from django.http import HttpRequest
from ninja import Query, Router
from ninja.errors import HttpError

from budget_accounts.models import BudgetAccount
from budget_accounts.schemas import BudgetAccountCreate, BudgetAccountOut, BudgetAccountUpdate
from common.auth import JWTAuth
from core.api import api as core_api
from workspaces.models import WorkspaceMember

router = Router(tags=['Budget Accounts'])
core_api.add_router('/budget-accounts', router)

User = get_user_model()


# =============================================================================
# Auth Helpers
# =============================================================================


def get_workspace_role(user: User, workspace_id: int) -> str:
    """Get user's role in workspace."""
    try:
        member = WorkspaceMember.objects.get(workspace_id=workspace_id, user=user)
        return member.role
    except WorkspaceMember.DoesNotExist:
        return 'viewer'


def require_role(user: User, workspace_id: int, allowed_roles: list[str]) -> None:
    """Raise error if user's role is not in allowed_roles."""
    role = get_workspace_role(user, workspace_id)
    if role not in allowed_roles:
        raise HttpError(403, f'Insufficient permissions. Required: {", ".join(allowed_roles)}. Your role: {role}')


# =============================================================================
# Endpoints
# =============================================================================


@router.get('', response=list[BudgetAccountOut], auth=JWTAuth())
def list_budget_accounts(
    request: HttpRequest,
    include_inactive: bool = Query(False),
):
    """List all budget accounts in current workspace."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    queryset = BudgetAccount.objects.filter(workspace=workspace)

    if not include_inactive:
        queryset = queryset.filter(is_active=True)

    return list(queryset.order_by('display_order', 'name'))


@router.get('/{account_id}', response=BudgetAccountOut, auth=JWTAuth())
def get_budget_account(request: HttpRequest, account_id: int):
    """Get a specific budget account."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    try:
        return BudgetAccount.objects.get(id=account_id, workspace=workspace)
    except BudgetAccount.DoesNotExist:
        raise HttpError(404, 'Budget account not found')


@router.post('', response={201: BudgetAccountOut, 400: dict}, auth=JWTAuth())
def create_budget_account(request: HttpRequest, data: BudgetAccountCreate):
    """Create a new budget account (requires owner or admin role)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, ['owner', 'admin'])

    # Check for duplicate name
    if BudgetAccount.objects.filter(workspace=workspace, name=data.name).exists():
        return 400, {'error': 'Budget account with this name already exists'}

    account = BudgetAccount.objects.create(
        workspace=workspace,
        name=data.name,
        description=data.description,
        default_currency=data.default_currency,
        color=data.color,
        icon=data.icon,
        is_active=data.is_active,
        display_order=data.display_order,
        created_by=user,
        updated_by=user,
    )

    return 201, account


@router.put('/{account_id}', response=BudgetAccountOut, auth=JWTAuth())
def update_budget_account(request: HttpRequest, account_id: int, data: BudgetAccountUpdate):
    """Update a budget account (requires owner or admin role)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, ['owner', 'admin'])

    try:
        account = BudgetAccount.objects.get(id=account_id, workspace=workspace)
    except BudgetAccount.DoesNotExist:
        raise HttpError(404, 'Budget account not found')

    # Check for name conflict if name is being updated
    if data.name is not None and data.name != account.name:
        if BudgetAccount.objects.filter(workspace=workspace, name=data.name).exclude(id=account_id).exists():
            raise HttpError(400, 'Budget account with this name already exists')

    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(account, field, value)

    account.updated_by = user
    account.save()

    return account


@router.delete('/{account_id}', response={204: None}, auth=JWTAuth())
def delete_budget_account(request: HttpRequest, account_id: int):
    """Delete a budget account (requires owner or admin role)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, ['owner', 'admin'])

    try:
        account = BudgetAccount.objects.get(id=account_id, workspace=workspace)
    except BudgetAccount.DoesNotExist:
        raise HttpError(404, 'Budget account not found')

    account.delete()

    return 204, None


@router.patch('/{account_id}/archive', response=BudgetAccountOut, auth=JWTAuth())
def toggle_archive_budget_account(request: HttpRequest, account_id: int):
    """Archive/unarchive a budget account (toggle is_active)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, ['owner', 'admin'])

    try:
        account = BudgetAccount.objects.get(id=account_id, workspace=workspace)
    except BudgetAccount.DoesNotExist:
        raise HttpError(404, 'Budget account not found')

    account.is_active = not account.is_active
    account.updated_by = user
    account.save()

    return account
