"""Django-Ninja API endpoints for categories app."""

import json
from datetime import date
from typing import List

from django.db import IntegrityError
from ninja import File, Form, Query, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile
from pydantic import BaseModel

from budget_periods.models import BudgetPeriod
from categories.models import Category
from categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from common.auth import JWTAuth
from common.permissions import require_role
from core.schemas import DetailOut
from workspaces.models import WRITE_ROLES

router = Router(tags=['Categories'])


# =============================================================================
# Helper Functions
# =============================================================================


def get_workspace_period(period_id: int, workspace_id: int) -> BudgetPeriod:
    """Helper to get a period and verify it belongs to the current workspace."""
    period = (
        BudgetPeriod.objects.select_related('budget_account')
        .filter(id=period_id, budget_account__workspace_id=workspace_id)
        .first()
    )
    if not period:
        return None
    return period


def get_workspace_category(category_id: int, workspace_id: int) -> Category:
    """Helper to get a category and verify it belongs to the current workspace."""
    category = (
        Category.objects.select_related('budget_period__budget_account')
        .filter(id=category_id, budget_period__budget_account__workspace_id=workspace_id)
        .first()
    )
    if not category:
        return None
    return category


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

    # Verify the period belongs to current workspace
    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    return Category.objects.filter(budget_period_id=budget_period_id)


# =============================================================================
# Export/Import Endpoints (specific routes must come before /{category_id})
# =============================================================================


class CategoryExportOut(BaseModel):
    """Schema for category export response."""

    class Config:
        arbitrary_types_allowed = True


@router.get('/export/', response={200: List[str]}, auth=JWTAuth())
def export_categories(
    request,
    budget_period_id: int = Query(...),
):
    """Export categories from a budget period as JSON."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    categories = Category.objects.filter(budget_period_id=budget_period_id)
    category_names = [category.name for category in categories]

    return category_names


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

    require_role(user, workspace.id, WRITE_ROLES)

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Budget period not found'}

    # Read file contents - Django Ninja's UploadedFile has .read() method directly
    try:
        contents = file.read()
        data = json.loads(contents)
        if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
            return 400, {'detail': 'Invalid JSON format. Expected a list of strings.'}
    except json.JSONDecodeError:
        return 400, {'detail': 'Invalid JSON file.'}

    # Get existing category names for the budget period to avoid duplicates
    existing_category_names = set(
        Category.objects.filter(budget_period_id=budget_period_id).values_list('name', flat=True)
    )

    new_categories_to_add = []
    for category_name in data:
        if category_name not in existing_category_names:
            new_categories_to_add.append(Category(name=category_name, budget_period_id=budget_period_id))
            existing_category_names.add(category_name)

    if not new_categories_to_add:
        return 201, {'message': 'No new categories to import.'}

    Category.objects.bulk_create(new_categories_to_add)

    return 201, {'message': f'Successfully imported {len(new_categories_to_add)} new categories.'}


# =============================================================================
# Single Category Endpoints
# =============================================================================


@router.get('/{category_id}', response={200: CategoryOut, 404: DetailOut}, auth=JWTAuth())
def get_category(request, category_id: int):
    """Get a specific category by ID."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    category = get_workspace_category(category_id, workspace.id)
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

    require_role(user, workspace.id, WRITE_ROLES)

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(data.budget_period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Budget period not found'}

    try:
        category = Category.objects.create(
            budget_period_id=data.budget_period_id,
            name=data.name,
            created_by=user,
            updated_by=user,
        )
    except IntegrityError:
        return 400, {'detail': 'A category with this name already exists in this budget period.'}

    return 201, category


@router.put('/{category_id}', response={200: CategoryOut, 404: DetailOut}, auth=JWTAuth())
def update_category(request, category_id: int, data: CategoryUpdate):
    """Update a category."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, WRITE_ROLES)

    category = get_workspace_category(category_id, workspace.id)
    if not category:
        return 404, {'detail': 'Category not found'}

    if data.name is not None:
        category.name = data.name

    category.updated_by = user
    category.save()

    return 200, category


@router.delete('/{category_id}', response={204: None, 404: DetailOut}, auth=JWTAuth())
def delete_category(request, category_id: int):
    """Delete a category."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, WRITE_ROLES)

    category = get_workspace_category(category_id, workspace.id)
    if not category:
        return 404, {'detail': 'Category not found'}

    category.delete()

    return 204, None
