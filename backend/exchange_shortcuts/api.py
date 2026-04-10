"""Django-Ninja API endpoints for exchange_shortcuts app."""

from django.http import HttpRequest
from ninja import Router

from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from core.schemas.common import DetailOut
from exchange_shortcuts.schemas import ExchangeShortcutCreate, ExchangeShortcutOut, ExchangeShortcutUpdate
from exchange_shortcuts.services import ExchangeShortcutService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Exchange Shortcuts'])


@router.get('', response=list[ExchangeShortcutOut], auth=WorkspaceJWTAuth())
def list_shortcuts(request: HttpRequest):
    """List exchange shortcuts for the current workspace."""
    workspace_id = request.auth.current_workspace_id
    return ExchangeShortcutService.list(workspace_id)


@router.post('', response={201: ExchangeShortcutOut, 400: DetailOut}, auth=WorkspaceJWTAuth())
def create_shortcut(request: HttpRequest, data: ExchangeShortcutCreate):
    """Create an exchange shortcut (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    shortcut = ExchangeShortcutService.create(user, workspace_id, data)
    return 201, shortcut


@router.put(
    '/{shortcut_id}', response={200: ExchangeShortcutOut, 400: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def update_shortcut(request: HttpRequest, shortcut_id: int, data: ExchangeShortcutUpdate):
    """Update an exchange shortcut (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return ExchangeShortcutService.update(user, workspace_id, shortcut_id, data)


@router.delete('/{shortcut_id}', response={204: None, 404: DetailOut}, auth=WorkspaceJWTAuth())
def delete_shortcut(request: HttpRequest, shortcut_id: int):
    """Delete an exchange shortcut (requires write access)."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, WRITE_ROLES)
    ExchangeShortcutService.delete(workspace_id, shortcut_id)
    return 204, None
