"""Django-Ninja API endpoints for workspaces app."""

from django.contrib.auth import get_user_model
from django.http import HttpRequest
from ninja import Router
from ninja.errors import HttpError

from common.auth import JWTAuth
from core.schemas import MessageOut
from workspaces.models import ADMIN_ROLES, Role, Workspace, WorkspaceMember
from workspaces.schemas import (
    MemberPasswordReset,
    WorkspaceMemberAdd,
    WorkspaceMemberOut,
    WorkspaceMemberRoleUpdate,
    WorkspaceOut,
    WorkspaceUpdate,
)

router = Router(tags=['Workspaces'])
User = get_user_model()


# =============================================================================
# Helper Functions
# =============================================================================


def get_user_workspace_role(user_id: int, workspace_id: int) -> str | None:
    """Helper to get user's role in a specific workspace."""
    member = WorkspaceMember.objects.filter(
        workspace_id=workspace_id,
        user_id=user_id,
    ).first()
    return member.role if member else None


def validate_workspace_access(workspace_id: int, user) -> Workspace:
    """Validate that user has access to the workspace."""
    workspace = Workspace.objects.filter(id=workspace_id).first()
    if not workspace:
        raise HttpError(404, 'Workspace not found')

    member = WorkspaceMember.objects.filter(
        workspace_id=workspace_id,
        user=user,
    ).first()
    if not member:
        raise HttpError(403, 'Access denied to this workspace')

    return workspace


def require_role(user, workspace_id: int, allowed_roles: list[str]) -> str:
    """Get user's role and raise error if not in allowed_roles."""
    role = get_user_workspace_role(user.id, workspace_id)
    if not role:
        raise HttpError(403, 'Not a member of this workspace')
    if role not in allowed_roles:
        raise HttpError(403, f'Insufficient permissions. Required: {", ".join(allowed_roles)}. Your role: {role}')
    return role


# =============================================================================
# Workspace Endpoints
# =============================================================================


@router.get('', response=list[WorkspaceOut], auth=JWTAuth())
def list_workspaces(request: HttpRequest):
    """List all workspaces the current user has access to."""
    user = request.auth

    memberships = WorkspaceMember.objects.filter(user_id=user.id).select_related('workspace')

    workspace_ids = [m.workspace_id for m in memberships]
    workspaces = Workspace.objects.filter(id__in=workspace_ids)

    return list(workspaces)


@router.get('/current', response=WorkspaceOut, auth=JWTAuth())
def get_current_workspace_info(request: HttpRequest):
    """Get current workspace details."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No current workspace selected')

    return workspace


@router.put('/current', response=WorkspaceOut, auth=JWTAuth())
def update_current_workspace(request: HttpRequest, data: WorkspaceUpdate):
    """Update current workspace (requires owner or admin role)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No current workspace selected')

    # Check user has admin or owner role
    require_role(user, workspace.id, ADMIN_ROLES)

    if data.name is not None:
        workspace.name = data.name
        workspace.save()

    return workspace


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
        raise HttpError(403, 'Access denied to this workspace')

    # Update user's current workspace
    user.current_workspace_id = workspace_id
    user.save()

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
    validate_workspace_access(workspace_id, user)

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


@router.post('/{workspace_id}/members/add', response={201: dict, 400: dict}, auth=JWTAuth())
def add_member_to_workspace(request: HttpRequest, workspace_id: int, data: WorkspaceMemberAdd):
    """
    Add a new member to the workspace.

    Behavior:
    - If user exists: Add them to workspace (password ignored)
    - If user doesn't exist: Create user with provided password, add to workspace
    """
    user = request.auth

    # Validate workspace access
    workspace = validate_workspace_access(workspace_id, user)

    # Check current user has admin/owner role
    require_role(user, workspace_id, ADMIN_ROLES)

    # Check workspace member limit (15 members maximum)
    current_member_count = WorkspaceMember.objects.filter(workspace_id=workspace_id).count()

    if current_member_count >= 15:
        return 400, {'detail': 'Workspace member limit reached. Maximum 15 members allowed per workspace.'}

    # Check if user already exists
    existing_user = User.objects.filter(email=data.email).first()

    if existing_user:
        # Check if already a member of this workspace
        existing_member = WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            user_id=existing_user.id,
        ).first()

        if existing_member:
            return 400, {'detail': 'User is already a member of this workspace'}

        # Add existing user to workspace
        new_member = WorkspaceMember(
            workspace_id=workspace_id,
            user_id=existing_user.id,
            role=data.role,
        )
        new_member.save()

        return 201, {
            'message': f'Existing user {data.email} added to workspace',
            'user_id': existing_user.id,
            'member_id': new_member.id,
            'is_new_user': False,
        }
    else:
        # Create new user with provided password
        new_user = User.objects.create_user(
            email=data.email,
            password=data.password,
            full_name=data.full_name,
            current_workspace_id=workspace_id,
            is_active=True,
        )

        # Add to workspace
        new_member = WorkspaceMember(
            workspace_id=workspace_id,
            user_id=new_user.id,
            role=data.role,
        )
        new_member.save()

        return 201, {
            'message': f'User {data.email} created and added to workspace',
            'user_id': new_user.id,
            'member_id': new_member.id,
            'is_new_user': True,
        }


@router.post('/{workspace_id}/members/leave', response=MessageOut, auth=JWTAuth())
def leave_workspace(request: HttpRequest, workspace_id: int):
    """
    Leave the workspace (remove yourself).

    Business rules:
    - Owner cannot leave (must transfer ownership first)
    """
    user = request.auth

    # Validate workspace access
    validate_workspace_access(workspace_id, user)

    member = WorkspaceMember.objects.filter(
        workspace_id=workspace_id,
        user_id=user.id,
    ).first()

    if not member:
        raise HttpError(404, 'You are not a member of this workspace')

    # Owner cannot leave
    if member.role == Role.OWNER:
        raise HttpError(400, 'Workspace owner cannot leave. Transfer ownership first or delete the workspace.')

    # Remove membership
    member.delete()

    # If this was user's current workspace, unset it
    if user.current_workspace_id == workspace_id:
        user.current_workspace_id = None
        user.save()

    return {'message': 'Successfully left workspace'}


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

    # Validate workspace access
    validate_workspace_access(workspace_id, user)

    # Check current user has admin/owner role
    current_role = require_role(user, workspace_id, ADMIN_ROLES)

    # Get the member record
    member = WorkspaceMember.objects.filter(
        workspace_id=workspace_id,
        user_id=member_user_id,
    ).first()

    if not member:
        raise HttpError(404, 'Member not found in this workspace')

    # Cannot change your own role
    if member_user_id == user.id:
        raise HttpError(400, 'Cannot change your own role')

    # Cannot change owner role
    if member.role == Role.OWNER:
        raise HttpError(400, "Cannot change the owner's role")

    # Admin cannot change other admin's role
    if current_role == Role.ADMIN and member.role == Role.ADMIN:
        raise HttpError(403, "Admin cannot change another admin's role. Owner required.")

    # Update the role
    old_role = member.role
    member.role = data.role
    member.save()

    return {
        'message': 'Role updated successfully',
        'user_id': member_user_id,
        'old_role': old_role,
        'new_role': data.role,
    }


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

    # Validate workspace access
    validate_workspace_access(workspace_id, user)

    # Check current user has admin/owner role
    current_role = require_role(user, workspace_id, ADMIN_ROLES)

    # Get the member record
    member = WorkspaceMember.objects.filter(
        workspace_id=workspace_id,
        user_id=member_user_id,
    ).first()

    if not member:
        raise HttpError(404, 'Member not found in this workspace')

    # Cannot remove yourself
    if member_user_id == user.id:
        raise HttpError(400, 'Cannot remove yourself. Use the leave endpoint instead.')

    # Cannot remove owner
    if member.role == Role.OWNER:
        raise HttpError(400, 'Cannot remove the workspace owner')

    # Admin cannot remove other admin
    if current_role == Role.ADMIN and member.role == Role.ADMIN:
        raise HttpError(403, 'Admin cannot remove another admin. Owner required.')

    # Remove the member
    member.delete()

    # Note: User record is NOT deleted, only membership

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

    # Validate workspace access
    validate_workspace_access(workspace_id, user)

    # Check current user has admin/owner role
    current_role = require_role(user, workspace_id, ADMIN_ROLES)

    # Get the target member's record
    target_member = WorkspaceMember.objects.filter(
        workspace_id=workspace_id,
        user_id=user_id,
    ).first()

    if not target_member:
        raise HttpError(404, 'Member not found in this workspace')

    # Cannot reset own password
    if user_id == user.id:
        raise HttpError(400, 'Cannot reset your own password. Use the change password feature instead.')

    # Cannot reset owner's password
    if target_member.role == Role.OWNER:
        raise HttpError(400, "Cannot reset the owner's password")

    # Admin cannot reset another admin's password
    if current_role == Role.ADMIN and target_member.role == Role.ADMIN:
        raise HttpError(403, "Admin cannot reset another admin's password. Owner required.")

    # Get the target user and update password
    target_user = User.objects.filter(id=user_id).first()
    if not target_user:
        raise HttpError(404, 'User not found')

    target_user.set_password(data.new_password)
    target_user.save()

    return {
        'message': 'Password reset successfully',
        'user_id': user_id,
        'email': target_user.email,
    }
