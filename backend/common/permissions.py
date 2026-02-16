"""Shared permission utilities for API endpoints."""

from ninja.errors import HttpError

from workspaces.models import Role, WorkspaceMember


def require_role(user, workspace_id: int, allowed_roles: list[str]) -> None:
    """Raise 403 if user's role is not in allowed_roles."""
    try:
        member = WorkspaceMember.objects.get(workspace_id=workspace_id, user=user)
        role = member.role
    except WorkspaceMember.DoesNotExist:
        role = Role.VIEWER
    if role not in allowed_roles:
        raise HttpError(403, f'Insufficient permissions. Required: {", ".join(allowed_roles)}. Your role: {role}')
