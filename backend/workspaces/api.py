"""Django-Ninja API endpoints for workspaces app."""

from django.contrib.auth import get_user_model
from django.http import HttpRequest
from ninja import Router

from common.auth import JWTAuth, WorkspaceJWTAuth
from common.permissions import require_role
from core.schemas import DetailOut, MessageOut
from users.two_factor import TwoFactorService
from workspaces.exceptions import WorkspaceNotFoundError
from workspaces.models import ADMIN_ROLES, Role, Workspace, WorkspaceMember
from workspaces.schemas import (
    CurrencyCreate,
    CurrencyOut,
    MemberPasswordReset,
    WorkspaceCreate,
    WorkspaceMemberAdd,
    WorkspaceMemberOut,
    WorkspaceMemberRoleUpdate,
    WorkspaceOut,
    WorkspaceUpdate,
)
from workspaces.services import CurrencyService, WorkspaceMemberService, WorkspaceService

router = Router(tags=['Workspaces'])
User = get_user_model()


# =============================================================================
# Currency Endpoints
# =============================================================================


@router.get('/currencies', response=list[CurrencyOut], auth=WorkspaceJWTAuth())
def list_currencies(request: HttpRequest):
    """List all currencies for the current workspace."""
    return CurrencyService.list_currencies(request.auth.current_workspace_id)


@router.post('/currencies', response={201: CurrencyOut}, auth=WorkspaceJWTAuth())
def create_currency(request: HttpRequest, data: CurrencyCreate):
    """Create a new currency for the current workspace."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, ADMIN_ROLES)
    currency = CurrencyService.create_currency(workspace_id, data)
    return 201, currency


@router.delete('/currencies/{currency_id}', response={204: None}, auth=WorkspaceJWTAuth())
def delete_currency(request: HttpRequest, currency_id: int):
    """Delete a currency from the current workspace."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, ADMIN_ROLES)
    CurrencyService.delete_currency(currency_id, workspace_id)
    return 204, None


# =============================================================================


def _workspace_response(workspace: Workspace, role: str) -> WorkspaceOut:
    """Build a WorkspaceOut-compatible response with user_role included."""
    ws = WorkspaceOut.model_validate(workspace)
    return ws.model_copy(update={'user_role': role})


# =============================================================================
# Workspace Endpoints
# =============================================================================


@router.get('', response=list[WorkspaceOut], auth=JWTAuth())
def list_workspaces(request: HttpRequest):
    """List all workspaces the current user has access to."""
    user = request.auth
    memberships = WorkspaceMember.objects.filter(user_id=user.id).select_related('workspace')
    return [_workspace_response(m.workspace, m.role) for m in memberships]


@router.post('/', response={201: WorkspaceOut}, auth=JWTAuth())
def create_workspace_endpoint(request: HttpRequest, data: WorkspaceCreate):
    """Create a new workspace. User becomes owner and is auto-switched to it."""
    workspace = WorkspaceService.create_workspace(user=request.auth, name=data.name, create_demo=False)
    return 201, _workspace_response(workspace, Role.OWNER)


# IMPORTANT: /current routes must come BEFORE /{workspace_id} routes
@router.get('/current', response=WorkspaceOut, auth=WorkspaceJWTAuth())
def get_current_workspace_info(request: HttpRequest):
    """Get current workspace details."""
    user = request.auth
    workspace_id = user.current_workspace_id
    try:
        member = WorkspaceMember.objects.select_related('workspace').get(workspace_id=workspace_id, user=user)
    except WorkspaceMember.DoesNotExist:
        raise WorkspaceNotFoundError()
    return _workspace_response(member.workspace, member.role)


@router.put('/current', response=WorkspaceOut, auth=WorkspaceJWTAuth())
def update_current_workspace(request: HttpRequest, data: WorkspaceUpdate):
    """Update current workspace (requires owner or admin role)."""
    workspace_id = request.auth.current_workspace_id
    user_role = require_role(request.auth, workspace_id, ADMIN_ROLES)
    workspace = Workspace.objects.get(id=workspace_id)

    if data.name is not None:
        workspace.name = data.name
        workspace.save()

    return _workspace_response(workspace, user_role)


@router.delete('/{workspace_id}', response={204: None}, auth=JWTAuth())
def delete_workspace_endpoint(request: HttpRequest, workspace_id: int):
    """Delete a workspace. Only the owner can delete it."""
    WorkspaceMemberService.validate_access(workspace_id, request.auth)
    require_role(request.auth, workspace_id, [Role.OWNER])
    WorkspaceService.delete_workspace(user=request.auth, workspace_id=workspace_id)
    return 204, None


@router.post('/{workspace_id}/switch', response=MessageOut, auth=JWTAuth())
def switch_workspace(request: HttpRequest, workspace_id: int):
    """Switch to a different workspace."""
    user = request.auth

    # Verify user has access to this workspace
    member = WorkspaceMember.objects.filter(
        workspace_id=workspace_id,
        user_id=user.id,
    ).first()

    if not member:
        raise WorkspaceNotFoundError()

    # Setting _id directly avoids loading the Workspace object; Django's
    # update_fields=['current_workspace'] maps to the same DB column.
    user.current_workspace_id = workspace_id
    user.save(update_fields=['current_workspace'])

    return {'message': 'Workspace switched successfully', 'workspace_id': workspace_id}


# =============================================================================
# Workspace Members Endpoints
# =============================================================================

# IMPORTANT: Specific routes must come BEFORE parameterized routes to avoid
# path matching issues (e.g., "leave" or "add" being matched as {member_user_id})


@router.get('/{workspace_id}/members', response=list[WorkspaceMemberOut], auth=JWTAuth())
def list_workspace_members(request: HttpRequest, workspace_id: int):
    """
    List all members in the workspace.
    Any workspace member can view the member list.
    """
    user = request.auth

    # Validate user has access to this workspace
    WorkspaceMemberService.validate_access(workspace_id, user)

    members_with_users = (
        WorkspaceMember.objects.filter(workspace_id=workspace_id)
        .select_related('user')
        .order_by('-role', 'user__email')
    )

    return [
        {
            'id': member.id,
            'workspace_id': member.workspace_id,
            'user_id': member.user_id,
            'email': member.user.email,
            'full_name': member.user.full_name,
            'role': member.role,
            'is_active': member.user.is_active,
            'created_at': member.created_at,
        }
        for member in members_with_users
    ]


@router.post('/{workspace_id}/members/add', response={201: dict}, auth=JWTAuth())
def add_member_to_workspace(request: HttpRequest, workspace_id: int, data: WorkspaceMemberAdd):
    """
    Add a new member to the workspace.

    Behavior:
    - If user exists: Add them to workspace (password ignored)
    - If user doesn't exist: Create user with provided password, add to workspace
    """
    user = request.auth
    WorkspaceMemberService.validate_access(workspace_id, user)
    require_role(user, workspace_id, ADMIN_ROLES)
    return 201, WorkspaceMemberService.add_member(user, workspace_id, data)


@router.post('/{workspace_id}/members/leave', response=MessageOut, auth=JWTAuth())
def leave_workspace(request: HttpRequest, workspace_id: int):
    """
    Leave the workspace (remove yourself).

    Business rules:
    - Owner cannot leave (must transfer ownership first)
    """
    WorkspaceMemberService.validate_access(workspace_id, request.auth)
    return WorkspaceMemberService.leave(request.auth, workspace_id)


@router.put('/{workspace_id}/members/{member_user_id}/role', response=dict, auth=JWTAuth())
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


@router.delete('/{workspace_id}/members/{member_user_id}', response={204: None}, auth=JWTAuth())
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


@router.put('/{workspace_id}/members/{user_id}/reset-password', response=MessageOut, auth=JWTAuth())
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
