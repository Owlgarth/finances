"""Django-Ninja API endpoints for the bookmarks app."""

from django.http import HttpRequest
from ninja import Router, Status

from bookmarks.schemas import (
    BookmarkCreate,
    BookmarkMove,
    BookmarkOut,
    BookmarkUpdate,
    BookmarkVisibility,
)
from bookmarks.services import BookmarkService
from common.auth import WorkspaceJWTAuth
from core.schemas.common import DetailOut

router = Router(tags=['Bookmarks'])


@router.get('', response=list[BookmarkOut], auth=WorkspaceJWTAuth())
def list_bookmarks(request: HttpRequest):
    """List all of the current user's bookmarks in the current workspace.

    Includes archived rows (the manage page lists them); ordered by
    (position, id). Personal resource: every role, including viewers,
    manages only their own bookmarks - no role gate.
    """
    workspace_id = request.auth.current_workspace_id
    return BookmarkService.list(request.auth, workspace_id)


@router.post('', response={201: BookmarkOut, 400: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def create_bookmark(request: HttpRequest, data: BookmarkCreate):
    """Create a bookmark (any role, including viewers - bookmarks are personal).

    400 covers service validations: duplicate name (case-insensitive per user
    + workspace) and structural invalid-target cases (budget kind without
    budget + currency, filter kind carrying either). 404 covers the
    resource-reference lookups: budget outside this workspace, currency not
    enabled in this workspace. Schema violations (unknown kind, over-length
    name) are Django Ninja 422s.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    return Status(201, BookmarkService.create(user, workspace_id, data))


@router.put('/{bookmark_id}', response={200: BookmarkOut, 400: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def update_bookmark(request: HttpRequest, bookmark_id: int, data: BookmarkUpdate):
    """Full-replace update of name, icon and color.

    The target (kind, budget, currency, params) is immutable after create -
    the schema accepts only the three presentation fields; recreate the
    bookmark to change its target. 400: duplicate name.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    return BookmarkService.update(user, workspace_id, bookmark_id, data)


@router.patch(
    '/{bookmark_id}/visibility',
    response={200: BookmarkOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def set_bookmark_visibility(request: HttpRequest, bookmark_id: int, data: BookmarkVisibility):
    """Partial update of is_active (sidebar / More visibility) and/or is_archived.

    Both flags optional; an omitted flag keeps its stored value
    (exclude_unset semantics - an empty body is a no-op that returns the
    bookmark unchanged).
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    return BookmarkService.set_visibility(user, workspace_id, bookmark_id, data)


@router.post(
    '/{bookmark_id}/move',
    response={200: BookmarkOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def move_bookmark(request: HttpRequest, bookmark_id: int, data: BookmarkMove):
    """Swap the bookmark with its neighbor in the given direction.

    direction is restricted to up/down by the schema - any other value is a
    schema 422. Moving past the end of the list is a no-op returning the
    bookmark unchanged.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    return BookmarkService.move(user, workspace_id, bookmark_id, data.direction)


@router.delete('/{bookmark_id}', response={204: None, 404: DetailOut}, auth=WorkspaceJWTAuth())
def delete_bookmark(request: HttpRequest, bookmark_id: int):
    """Delete a bookmark permanently (archiving is the reversible alternative)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    BookmarkService.delete(user, workspace_id, bookmark_id)
    return Status(204, None)
