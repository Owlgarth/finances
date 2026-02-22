"""Django-Ninja API endpoints for categories app."""

import json
from datetime import date
from typing import List

from ninja import File, Form, Query, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from budget_periods.models import BudgetPeriod
from categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from categories.services import CategoryService
from common.auth import JWTAuth
from common.services.base import get_workspace_period
from common.throttle import validate_file_size
from core.schemas import DetailOut

router = Router(tags=['Categories'])


# =============================================================================
# Category Endpoints
# =============================================================================


@router.get('', response=list[CategoryOut], auth=JWTAuth())
def list_categories(
    request,
    budget_period_id: int | None = Query(None),
    current_date: date | None = Query(None),
):
    """List categories for the current workspace."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    if current_date:
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(budget_account__workspace_id=workspace.id, start_date__lte=current_date, end_date__gte=current_date)
            .first()
        )
        if period:
            budget_period_id = period.id
        else:
            return []

    if budget_period_id is None:
        raise HttpError(400, 'Either budget_period_id or current_date must be provided')

    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    from categories.models import Category

    return Category.objects.filter(budget_period_id=budget_period_id)


# =============================================================================
# Export/Import Endpoints (specific routes must come before /{category_id})
# =============================================================================


@router.get('/export/', response={200: List[str]}, auth=JWTAuth())
def export_categories(
    request,
    budget_period_id: int = Query(...),
):
    """Export categories from a budget period as JSON."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    return CategoryService.export(workspace, budget_period_id)


@router.post('/import', response={201: dict, 400: dict, 404: dict}, auth=JWTAuth())
def import_categories(
    request,
    budget_period_id: int = Form(...),
    file: UploadedFile = File(...),
):
    """Import categories from a JSON file into a budget period."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    validate_file_size(file, max_size_mb=5)

    try:
        contents = file.read()
        data = json.loads(contents)
        if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
            return 400, {'detail': 'Invalid JSON format. Expected a list of strings.'}
    except json.JSONDecodeError:
        return 400, {'detail': 'Invalid JSON file.'}

    count = CategoryService.import_data(user, workspace, budget_period_id, data)
    if count == 0:
        return 201, {'message': 'No new categories to import.'}
    return 201, {'message': f'Successfully imported {count} new categories.'}


# =============================================================================
# Single Category Endpoints
# =============================================================================


@router.get('/{category_id}', response={200: CategoryOut, 404: DetailOut}, auth=JWTAuth())
def get_category(request, category_id: int):
    """Get a specific category by ID."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    category = CategoryService.get_category(category_id, workspace.id)
    if not category:
        return 404, {'detail': 'Category not found'}

    return 200, category


@router.post('', response={201: CategoryOut, 400: dict, 404: dict}, auth=JWTAuth())
def create_category(request, data: CategoryCreate):
    """Create a new category."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    category = CategoryService.create(user, workspace, data)
    return 201, category


@router.put('/{category_id}', response={200: CategoryOut, 404: DetailOut}, auth=JWTAuth())
def update_category(request, category_id: int, data: CategoryUpdate):
    """Update a category."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    category = CategoryService.update(user, workspace, category_id, data)
    return 200, category


@router.delete('/{category_id}', response={204: None, 404: DetailOut}, auth=JWTAuth())
def delete_category(request, category_id: int):
    """Delete a category."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    CategoryService.delete(user, workspace, category_id)
    return 204, None
