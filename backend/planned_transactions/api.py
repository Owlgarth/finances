"""Django-Ninja API endpoints for planned_transactions app."""

import json
from datetime import date

from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from common.auth import JWTAuth
from common.throttle import validate_file_size
from planned_transactions.schemas import (
    PlannedTransactionCreate,
    PlannedTransactionOut,
    PlannedTransactionUpdate,
)
from planned_transactions.services import PlannedTransactionService

router = Router(tags=['Planned Transactions'])


# =============================================================================
# Planned Transaction Endpoints
# =============================================================================


@router.get('', response=list[PlannedTransactionOut], auth=JWTAuth())
def list_planned(
    request: HttpRequest,
    status: str | None = Query(None),
    budget_period_id: int | None = Query(None),
):
    """List planned transactions for the current workspace."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    from planned_transactions.models import PlannedTransaction

    queryset = PlannedTransaction.objects.select_related('category').filter(
        budget_period__budget_account__workspace_id=workspace.id
    )

    if status:
        queryset = queryset.filter(status=status)
    if budget_period_id:
        queryset = queryset.filter(budget_period_id=budget_period_id)

    return list(queryset.order_by('planned_date'))


@router.post('', response={201: PlannedTransactionOut, 400: dict}, auth=JWTAuth())
def create_planned(request: HttpRequest, data: PlannedTransactionCreate):
    """Create a new planned transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    planned = PlannedTransactionService.create(user, workspace, data)
    return 201, planned


# Specific routes must come before parameterized routes
@router.get('/export/', auth=JWTAuth())
def export_planned_transactions(
    request: HttpRequest,
    budget_period_id: int = Query(...),
    status: str | None = Query(None),
):
    """Export planned transactions from a budget period as JSON."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    export_data = PlannedTransactionService.export(workspace, budget_period_id, status)
    response = HttpResponse(
        json.dumps(export_data, indent=2),
        content_type='application/json',
    )
    response['Content-Disposition'] = f'attachment; filename=planned_export_{budget_period_id}.json'
    return response


@router.post('/import', response={201: dict, 400: dict}, auth=JWTAuth())
def import_planned_transactions(
    request: HttpRequest,
    budget_period_id: int = Form(...),
    file: UploadedFile = File(...),
):
    """Import planned transactions from a JSON file into a budget period (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    validate_file_size(file, max_size_mb=5)

    try:
        data = json.loads(file.read())
    except json.JSONDecodeError:
        return 400, {'error': 'Invalid JSON file.'}
    except Exception as e:
        return 400, {'error': f'Invalid data format: {e}'}

    count = PlannedTransactionService.import_data(user, workspace, budget_period_id, data)
    if count == 0:
        return 201, {'message': 'No new planned transactions to import.'}
    return 201, {'message': f'Successfully imported {count} new planned transactions.'}


# Parameterized routes must come after specific routes
@router.get('/{planned_id}', response=PlannedTransactionOut, auth=JWTAuth())
def get_planned(request: HttpRequest, planned_id: int):
    """Get a specific planned transaction by ID."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    planned = PlannedTransactionService.get_planned(planned_id, workspace.id)
    if not planned:
        raise HttpError(404, 'Planned transaction not found')

    return planned


@router.put('/{planned_id}', response=PlannedTransactionOut, auth=JWTAuth())
def update_planned(request: HttpRequest, planned_id: int, data: PlannedTransactionUpdate):
    """Update a planned transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    planned = PlannedTransactionService.update(user, workspace, planned_id, data)
    return planned


@router.delete('/{planned_id}', response={204: None}, auth=JWTAuth())
def delete_planned(request: HttpRequest, planned_id: int):
    """Delete a planned transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    PlannedTransactionService.delete(user, workspace, planned_id)
    return 204, None


@router.post('/{planned_id}/execute', response=PlannedTransactionOut, auth=JWTAuth())
def execute_planned(
    request: HttpRequest,
    planned_id: int,
    payment_date: date = Query(...),
):
    """Execute a planned transaction, creating an actual transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    planned = PlannedTransactionService.execute(user, workspace, planned_id, payment_date)
    return planned
