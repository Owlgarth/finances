"""Shared permission utilities for API endpoints."""

from common.exceptions import PermissionDeniedError
from workspaces.models import WorkspaceMember


def require_role(user, workspace_id: int, allowed_roles: list[str]) -> str:
    """Raise 403 if user is not a member or their role is not in allowed_roles. Returns the role."""
    # WorkspaceJWTAuth caches the role on the user object for the current request.
    # Only use the cache when checking the user's current workspace; for cross-workspace
    # operations (e.g., managing members of another workspace), fall through to the DB.
    cached_role = getattr(user, '_workspace_member_role', None)
    if cached_role is not None and user.current_workspace_id == workspace_id:
        role = cached_role
    else:
        try:
            member = WorkspaceMember.objects.get(workspace_id=workspace_id, user=user)
            role = member.role
        except WorkspaceMember.DoesNotExist:
            raise PermissionDeniedError('Not a member of this workspace')
    if role not in allowed_roles:
        raise PermissionDeniedError('Insufficient permissions')
    return role
