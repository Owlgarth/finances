"""Django-Ninja API endpoints for categories app."""

import json
from datetime import date

from django.http import HttpRequest
from ninja import File, Form, Query, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from categories.services import CategoryService
from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from common.throttle import validate_file_size
from workspaces.models import WRITE_ROLES

router = Router(tags=['Categories'])


@router.get('', response=list[CategoryOut], auth=WorkspaceJWTAuth())
def list_categories(
    request: HttpRequest,
    budget_period_id: int | None = Query(None),
    current_date: date | None = Query(None),
):
    """List categories for the current workspace."""
    workspace_id = request.auth.current_workspace_id

    if not budget_period_id and not current_date:
        raise HttpError(400, 'Either budget_period_id or current_date must be provided')

    return CategoryService.list(workspace_id, budget_period_id, current_date)


@router.get('/export/', response={200: list[str]}, auth=WorkspaceJWTAuth())
def export_categories(
    request: HttpRequest,
    budget_period_id: int = Query(...),
):
    """Export categories from a budget period as JSON."""
    workspace_id = request.auth.current_workspace_id
    return CategoryService.export(workspace_id, budget_period_id)


@router.post('/import', response={201: dict, 400: dict}, auth=WorkspaceJWTAuth())
def import_categories(
    request: HttpRequest,
    budget_period_id: int = Form(...),
    file: UploadedFile = File(...),
):
    """Import categories from a JSON file into a budget period."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    validate_file_size(file, max_size_mb=5)

    try:
        contents = file.read()
        data = json.loads(contents)
        if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
            return 400, {'detail': 'Invalid JSON format. Expected a list of strings.'}
    except json.JSONDecodeError:
        return 400, {'detail': 'Invalid JSON file.'}

    count = CategoryService.import_data(user, workspace_id, budget_period_id, data)

    if count == 0:
        return 201, {'message': 'No new categories to import.'}
    return 201, {'message': f'Successfully imported {count} new categories.'}


@router.get('/{category_id}', response=CategoryOut, auth=WorkspaceJWTAuth())
def get_category(request: HttpRequest, category_id: int):
    """Get a specific category by ID."""
    workspace_id = request.auth.current_workspace_id
    return CategoryService.get_category(category_id, workspace_id)


@router.post('', response={201: CategoryOut}, auth=WorkspaceJWTAuth())
def create_category(request: HttpRequest, data: CategoryCreate):
    """Create a new category."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    category = CategoryService.create(user, workspace_id, data)
    return 201, category


@router.put('/{category_id}', response=CategoryOut, auth=WorkspaceJWTAuth())
def update_category(request: HttpRequest, category_id: int, data: CategoryUpdate):
    """Update a category."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return CategoryService.update(user, workspace_id, category_id, data)


@router.delete('/{category_id}', response={204: None}, auth=WorkspaceJWTAuth())
def delete_category(request: HttpRequest, category_id: int):
    """Delete a category."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, WRITE_ROLES)
    CategoryService.delete(workspace_id, category_id)
    return 204, None
