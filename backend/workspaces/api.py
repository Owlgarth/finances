"""Django-Ninja API endpoints for workspaces app."""

from django.http import HttpRequest
from ninja import Router

from common.auth import JWTAuth, WorkspaceJWTAuth
from common.permissions import require_role
from core.schemas import DetailOut, MessageOut
from currencies.schemas import CurrencyCatalogOut, EnableCurrencyIn
from currencies.services import CurrencyCatalogService
from users.two_factor import TwoFactorService
from workspaces.models import ADMIN_ROLES, OWNER_ROLES, Role
from workspaces.schemas import (
    MemberPasswordReset,
    WorkspaceCreate,
    WorkspaceDefaultBudgetIn,
    WorkspaceMemberAdd,
    WorkspaceMemberOut,
    WorkspaceMemberRoleUpdate,
    WorkspaceOut,
    WorkspaceUpdate,
)
from workspaces.services import WorkspaceMemberService, WorkspaceService

router = Router(tags=['Workspaces'])


# =============================================================================
# Enabled Currencies Endpoints (global catalog enablement)
# =============================================================================


@router.get('/enabled-currencies', response=list[CurrencyCatalogOut], auth=WorkspaceJWTAuth())
def list_enabled_currencies(request: HttpRequest):
    """List the catalog currencies enabled for the current workspace."""
    return CurrencyCatalogService.list_enabled(request.auth.current_workspace_id)


@router.post(
    '/enabled-currencies',
    response={201: CurrencyCatalogOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def enable_currency(request: HttpRequest, data: EnableCurrencyIn):
    """Enable a catalog currency, or create and enable a custom currency (custom=true)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    if data.custom:
        currency = CurrencyCatalogService.create_custom(user, workspace_id, data.code, data.name, data.symbol)
    else:
        currency = CurrencyCatalogService.enable(user, workspace_id, data.code)
    return 201, currency


@router.delete(
    '/enabled-currencies/{code}',
    response={204: None, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def disable_currency(request: HttpRequest, code: str):
    """Disable a currency for the current workspace."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, ADMIN_ROLES)
    CurrencyCatalogService.disable(workspace_id, code)
    return 204, None


# =============================================================================
# Workspace Endpoints
# =============================================================================


@router.get('', response=list[WorkspaceOut], auth=JWTAuth())
def list_workspaces(request: HttpRequest):
    """List all workspaces the current user has access to."""
    return WorkspaceService.list_for_user(request.auth)


@router.post('', response={201: WorkspaceOut, 404: DetailOut}, auth=JWTAuth())
def create_workspace_endpoint(request: HttpRequest, data: WorkspaceCreate):
    """Create a new workspace. User becomes owner and is auto-switched to it.

    ``currency_codes`` (optional, first = primary) is enabled verbatim when
    sent; otherwise ``currency_code`` plus silent defaults. Unknown codes in
    an explicit list return 404 (unknown_currency).
    """
    workspace = WorkspaceService.create_workspace(
        user=request.auth,
        name=data.name,
        currency_code=data.currency_code,
        create_demo=False,
        currency_codes=data.currency_codes,
    )
    return 201, WorkspaceService._to_response(workspace, Role.OWNER)


# IMPORTANT: /current routes must come BEFORE /{workspace_id} routes
@router.get('/current', response={200: WorkspaceOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_current_workspace_info(request: HttpRequest):
    """Get current workspace details."""
    return WorkspaceService.get_current(request.auth)


@router.put('/current', response={200: WorkspaceOut, 403: DetailOut}, auth=WorkspaceJWTAuth())
def update_current_workspace(request: HttpRequest, data: WorkspaceUpdate):
    """Update current workspace (requires owner or admin role)."""
    workspace_id = request.auth.current_workspace_id
    user_role = require_role(request.auth, workspace_id, ADMIN_ROLES)
    return WorkspaceService.update(workspace_id, data, user_role)


@router.delete('/{workspace_id}', response={204: None, 403: DetailOut, 404: DetailOut}, auth=JWTAuth())
def delete_workspace_endpoint(request: HttpRequest, workspace_id: int):
    """Delete a workspace. Only the owner can delete it."""
    WorkspaceMemberService.validate_access(workspace_id, request.auth)
    require_role(request.auth, workspace_id, OWNER_ROLES)
    WorkspaceService.delete_workspace(user=request.auth, workspace_id=workspace_id)
    return 204, None


@router.post('/{workspace_id}/switch', response={200: MessageOut, 404: DetailOut}, auth=JWTAuth())
def switch_workspace(request: HttpRequest, workspace_id: int):
    """Switch to a different workspace."""
    return WorkspaceService.switch_workspace(request.auth, workspace_id)


@router.put(
    '/{workspace_id}/default-budget',
    response={200: WorkspaceOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=JWTAuth(),
)
def set_default_budget(request: HttpRequest, workspace_id: int, data: WorkspaceDefaultBudgetIn):
    """Set (or clear) the workspace's default budget (requires owner or admin role).

    Takes an explicit workspace id so it works right after a legacy import,
    which can create several workspaces beyond the current one.
    """
    WorkspaceMemberService.validate_access(workspace_id, request.auth)
    user_role = require_role(request.auth, workspace_id, ADMIN_ROLES)
    return WorkspaceService.set_default_budget(workspace_id, data.budget_id, user_role)


# =============================================================================
# Workspace Members Endpoints
# =============================================================================

# IMPORTANT: Specific routes must come BEFORE parameterized routes to avoid
# path matching issues (e.g., "leave" or "add" being matched as {member_user_id})


@router.get('/{workspace_id}/members', response={200: list[WorkspaceMemberOut], 404: DetailOut}, auth=JWTAuth())
def list_workspace_members(request: HttpRequest, workspace_id: int):
    """
    List all members in the workspace.
    Any workspace member can view the member list.
    """
    WorkspaceMemberService.validate_access(workspace_id, request.auth)
    return WorkspaceMemberService.list_members(workspace_id)


@router.post(
    '/{workspace_id}/members/add', response={201: dict, 400: DetailOut, 403: DetailOut, 404: DetailOut}, auth=JWTAuth()
)
def add_member_to_workspace(request: HttpRequest, workspace_id: int, data: WorkspaceMemberAdd):
    """
    Add a new member to the workspace.

    Behavior:
    - If user exists: Add them to workspace (password ignored)
    - If user doesn't exist: Create user, add to workspace. With a password it
      becomes their initial password; without one the new user gets a
      set-password link by email.
    """
    user = request.auth
    WorkspaceMemberService.validate_access(workspace_id, user)
    require_role(user, workspace_id, ADMIN_ROLES)
    return 201, WorkspaceMemberService.add_member(user, workspace_id, data)


@router.post(
    '/{workspace_id}/members/leave', response={200: MessageOut, 400: DetailOut, 404: DetailOut}, auth=JWTAuth()
)
def leave_workspace(request: HttpRequest, workspace_id: int):
    """
    Leave the workspace (remove yourself).

    Business rules:
    - Owner cannot leave (must transfer ownership first)
    """
    WorkspaceMemberService.validate_access(workspace_id, request.auth)
    return WorkspaceMemberService.leave(request.auth, workspace_id)


@router.put(
    '/{workspace_id}/members/{member_user_id}/role',
    response={200: dict, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=JWTAuth(),
)
def update_member_role(
    request: HttpRequest,
    workspace_id: int,
    member_user_id: int,
    data: WorkspaceMemberRoleUpdate,
):
    """
    Update a member's role in the workspace.

    Business rules:
    - Cannot change owner role (only one owner per workspace)
    - Admin cannot change other admins or owner
    - Cannot change your own role
    """
    user = request.auth
    WorkspaceMemberService.validate_access(workspace_id, user)
    current_role = require_role(user, workspace_id, ADMIN_ROLES)
    return WorkspaceMemberService.update_role(user, workspace_id, member_user_id, data.role, current_role)


@router.delete(
    '/{workspace_id}/members/{member_user_id}',
    response={204: None, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=JWTAuth(),
)
def remove_member_from_workspace(request: HttpRequest, workspace_id: int, member_user_id: int):
    """
    Remove a member from the workspace.

    Business rules:
    - Cannot remove owner
    - Admin cannot remove other admins
    - Cannot remove yourself (use leave endpoint instead)
    """
    user = request.auth
    WorkspaceMemberService.validate_access(workspace_id, user)
    current_role = require_role(user, workspace_id, ADMIN_ROLES)
    WorkspaceMemberService.remove_member(user, workspace_id, member_user_id, current_role)
    return 204, None


@router.put(
    '/{workspace_id}/members/{user_id}/reset-password',
    response={200: MessageOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=JWTAuth(),
)
def reset_member_password(
    request: HttpRequest,
    workspace_id: int,
    user_id: int,
    data: MemberPasswordReset,
):
    """
    Reset a workspace member's password (admin action).

    Security rules:
    - Owner can reset password for: admin, member, viewer
    - Admin can reset password for: member, viewer only (NOT other admins)
    - Cannot reset own password (use change password feature instead)
    - Cannot reset owner's password
    """
    user = request.auth
    WorkspaceMemberService.validate_access(workspace_id, user)
    current_role = require_role(user, workspace_id, ADMIN_ROLES)
    return WorkspaceMemberService.reset_password(user, workspace_id, user_id, data.new_password, current_role)


@router.post(
    '/{workspace_id}/members/{user_id}/reset-2fa',
    response={200: MessageOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=JWTAuth(),
)
def reset_member_2fa(request: HttpRequest, workspace_id: int, user_id: int):
    """Reset a workspace member's two-factor authentication (admin action)."""
    user = request.auth
    WorkspaceMemberService.validate_access(workspace_id, user)
    current_role = require_role(user, workspace_id, ADMIN_ROLES)
    return 200, TwoFactorService.admin_reset(user, workspace_id, user_id, current_role)
