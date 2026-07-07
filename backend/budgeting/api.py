"""Django-Ninja API endpoints for the budgeting app."""

from datetime import date

from django.http import HttpRequest
from ninja import Query, Router

from budgeting.schemas import (
    BudgetArchive,
    BudgetCreate,
    BudgetOut,
    BudgetUpdate,
    PeriodCreate,
    PeriodOut,
    PeriodUpdate,
)
from budgeting.services import BudgetService, PeriodService
from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from core.schemas.common import DetailOut
from workspaces.models import ADMIN_ROLES

router = Router(tags=['Budgets'])


# =============================================================================
# Budget Endpoints
# =============================================================================


@router.get('', response=list[BudgetOut], auth=WorkspaceJWTAuth())
def list_budgets(request: HttpRequest, include_inactive: bool = Query(False)):
    """List all budgets in the current workspace."""
    workspace_id = request.auth.current_workspace_id
    return BudgetService.list(workspace_id, include_inactive)


@router.post('', response={201: BudgetOut, 400: DetailOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def create_budget(request: HttpRequest, data: BudgetCreate):
    """Create a new budget (requires owner or admin role)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return 201, BudgetService.create(user, workspace_id, data)


@router.get('/{budget_id}', response={200: BudgetOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_budget(request: HttpRequest, budget_id: int):
    """Get a specific budget."""
    workspace_id = request.auth.current_workspace_id
    return BudgetService.get(budget_id, workspace_id)


@router.put(
    '/{budget_id}', response={200: BudgetOut, 400: DetailOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def update_budget(request: HttpRequest, budget_id: int, data: BudgetUpdate):
    """Update a budget (requires owner or admin role). Cadence changes apply forward only."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return BudgetService.update(user, workspace_id, budget_id, data)


@router.patch(
    '/{budget_id}/archive', response={200: BudgetOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def set_budget_archive_status(request: HttpRequest, budget_id: int, data: BudgetArchive):
    """Archive or unarchive a budget (set is_active)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return BudgetService.set_archive_status(user, workspace_id, budget_id, data)


@router.delete('/{budget_id}', response={204: None, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def delete_budget(request: HttpRequest, budget_id: int):
    """Delete a budget and its periods (requires owner or admin role)."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, ADMIN_ROLES)
    BudgetService.delete(workspace_id, budget_id)
    return 204, None


# =============================================================================
# Period Endpoints
# =============================================================================


@router.get(
    '/{budget_id}/periods/current', response={200: PeriodOut, 400: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def get_current_period(request: HttpRequest, budget_id: int, date_: date | None = Query(None, alias='date')):
    """Get the period covering the given date (default today), materializing it lazily."""
    workspace_id = request.auth.current_workspace_id
    budget = BudgetService.get(budget_id, workspace_id)
    target_date = date_ or date.today()
    return PeriodService.get_or_create_for_date(request.auth, budget, target_date)


@router.get('/{budget_id}/periods', response={200: list[PeriodOut], 404: DetailOut}, auth=WorkspaceJWTAuth())
def list_periods(request: HttpRequest, budget_id: int):
    """List all periods of a budget, newest first."""
    workspace_id = request.auth.current_workspace_id
    return PeriodService.list(workspace_id, budget_id)


@router.post(
    '/{budget_id}/periods',
    response={201: PeriodOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def create_custom_period(request: HttpRequest, budget_id: int, data: PeriodCreate):
    """Create a custom period with an explicit range (requires owner or admin role)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return 201, PeriodService.create_custom(user, workspace_id, budget_id, data)


@router.put(
    '/{budget_id}/periods/{period_id}',
    response={200: PeriodOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def update_custom_period(request: HttpRequest, budget_id: int, period_id: int, data: PeriodUpdate):
    """Update a custom period (auto-created periods are immutable)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return PeriodService.update_custom(user, workspace_id, budget_id, period_id, data)


@router.delete(
    '/{budget_id}/periods/{period_id}',
    response={204: None, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def delete_custom_period(request: HttpRequest, budget_id: int, period_id: int):
    """Delete a custom period (auto-created periods cannot be deleted)."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, ADMIN_ROLES)
    PeriodService.delete(workspace_id, budget_id, period_id)
    return 204, None
