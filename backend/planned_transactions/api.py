"""Django-Ninja API endpoints for planned_transactions app."""

import json
from datetime import date

from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.files import UploadedFile

from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from common.throttle import validate_file_size
from planned_transactions.schemas import (
    PlannedTransactionCreate,
    PlannedTransactionOut,
    PlannedTransactionUpdate,
)
from planned_transactions.services import PlannedTransactionService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Planned Transactions'])


# =============================================================================
# Planned Transaction Endpoints
# =============================================================================


@router.get('', response=list[PlannedTransactionOut], auth=WorkspaceJWTAuth())
def list_planned(
    request: HttpRequest,
    status: str | None = Query(None),
    budget_period_id: int | None = Query(None),
):
    """List planned transactions for the current workspace."""
    workspace_id = request.auth.current_workspace_id

    from planned_transactions.models import PlannedTransaction

    queryset = PlannedTransaction.objects.select_related('category').for_workspace(workspace_id)

    if status:
        queryset = queryset.filter(status=status)
    if budget_period_id:
        queryset = queryset.filter(budget_period_id=budget_period_id)

    return list(queryset.order_by('planned_date'))


@router.post('', response={201: PlannedTransactionOut, 400: dict}, auth=WorkspaceJWTAuth())
def create_planned(request: HttpRequest, data: PlannedTransactionCreate):
    """Create a new planned transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    planned = PlannedTransactionService.create(user, workspace_id, data)
    return 201, planned


# Specific routes must come before parameterized routes
@router.get('/export/', auth=WorkspaceJWTAuth())
def export_planned_transactions(
    request: HttpRequest,
    budget_period_id: int = Query(...),
    status: str | None = Query(None),
):
    """Export planned transactions from a budget period as JSON."""
    workspace_id = request.auth.current_workspace_id

    export_data = PlannedTransactionService.export(workspace_id, budget_period_id, status)
    response = HttpResponse(
        json.dumps(export_data, indent=2),
        content_type='application/json',
    )
    response['Content-Disposition'] = f'attachment; filename=planned_export_{budget_period_id}.json'
    return response


@router.post('/import', response={201: dict, 400: dict}, auth=WorkspaceJWTAuth())
def import_planned_transactions(
    request: HttpRequest,
    budget_period_id: int = Form(...),
    file: UploadedFile = File(...),
):
    """Import planned transactions from a JSON file into a budget period (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    validate_file_size(file, max_size_mb=5)

    try:
        data = json.loads(file.read())
    except json.JSONDecodeError:
        return 400, {'detail': 'Invalid JSON file.'}
    except Exception as e:
        return 400, {'detail': f'Invalid data format: {e}'}

    count = PlannedTransactionService.import_data(user, workspace_id, budget_period_id, data)
    if count == 0:
        return 201, {'message': 'No new planned transactions to import.'}
    return 201, {'message': f'Successfully imported {count} new planned transactions.'}


# Parameterized routes must come after specific routes
@router.get('/{planned_id}', response=PlannedTransactionOut, auth=WorkspaceJWTAuth())
def get_planned(request: HttpRequest, planned_id: int):
    """Get a specific planned transaction by ID."""
    workspace_id = request.auth.current_workspace_id
    return PlannedTransactionService.get_planned(planned_id, workspace_id)


@router.put('/{planned_id}', response=PlannedTransactionOut, auth=WorkspaceJWTAuth())
def update_planned(request: HttpRequest, planned_id: int, data: PlannedTransactionUpdate):
    """Update a planned transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    planned = PlannedTransactionService.update(user, workspace_id, planned_id, data)
    return planned


@router.delete('/{planned_id}', response={204: None}, auth=WorkspaceJWTAuth())
def delete_planned(request: HttpRequest, planned_id: int):
    """Delete a planned transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    PlannedTransactionService.delete(workspace_id, planned_id)
    return 204, None


@router.post('/{planned_id}/execute', response=PlannedTransactionOut, auth=WorkspaceJWTAuth())
def execute_planned(
    request: HttpRequest,
    planned_id: int,
    payment_date: date = Query(...),
):
    """Execute a planned transaction, creating an actual transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    planned = PlannedTransactionService.execute(user, workspace_id, planned_id, payment_date)
    return planned
