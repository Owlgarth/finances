"""Django-Ninja API endpoints for planned_transactions app."""

import json
from datetime import date
from decimal import Decimal

from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.files import UploadedFile

from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from common.throttle import validate_file_size
from core.schemas.common import DetailOut
from core.schemas.pagination import PaginatedOut
from planned_transactions.schemas import (
    PlannedTransactionCreate,
    PlannedTransactionOut,
    PlannedTransactionTotalsResponse,
)
from planned_transactions.services import PlannedTransactionService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Planned Transactions'])

ORDERING_PATTERN = r'^(-?(name|amount|status|planned_date|category__name|account__name|account__currency__code))$'


# =============================================================================
# Planned Transaction Endpoints
# =============================================================================


@router.get('', response=PaginatedOut[PlannedTransactionOut], auth=WorkspaceJWTAuth())
def list_planned(
    request: HttpRequest,
    status: str | None = Query(None),
    account_id: int | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    category_id: list[int] | None = Query(None),
    budget_id: int | None = Query(None),
    search: str | None = Query(None),
    amount_gte: Decimal | None = Query(None),
    amount_lte: Decimal | None = Query(None),
    ordering: str | None = Query(None, pattern=ORDERING_PATTERN),
    page: int = Query(1, ge=1),
    page_size: int = Query(25),
):
    """List planned transactions for the current workspace with optional filters."""
    workspace_id = request.auth.current_workspace_id
    return PlannedTransactionService.list(
        workspace_id,
        status,
        account_id,
        start_date,
        end_date,
        category_id=category_id,
        budget_id=budget_id,
        search=search,
        amount_gte=amount_gte,
        amount_lte=amount_lte,
        ordering=ordering,
        page=page,
        page_size=page_size,
    )


@router.post('', response={201: PlannedTransactionOut, 400: dict, 404: DetailOut}, auth=WorkspaceJWTAuth())
def create_planned(request: HttpRequest, data: PlannedTransactionCreate):
    """Create a new planned transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    planned = PlannedTransactionService.create(user, workspace_id, data)
    return 201, planned


@router.get('/totals', response=PlannedTransactionTotalsResponse, auth=WorkspaceJWTAuth())
def planned_totals(
    request: HttpRequest,
    status: str | None = Query(None),
    account_id: int | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    category_id: list[int] | None = Query(None),
    budget_id: int | None = Query(None),
    search: str | None = Query(None),
    amount_gte: Decimal | None = Query(None),
    amount_lte: Decimal | None = Query(None),
    group_by: str = Query('currency', pattern=r'^(currency|category)$'),
):
    """Get aggregated planned transaction totals grouped by currency or category."""
    workspace_id = request.auth.current_workspace_id
    return {
        'totals': PlannedTransactionService.totals(
            workspace_id,
            status,
            account_id,
            start_date,
            end_date,
            category_id=category_id,
            budget_id=budget_id,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
            group_by=group_by,
        )
    }


# Specific routes must come before parameterized routes
@router.get('/export/', auth=WorkspaceJWTAuth())
def export_planned_transactions(
    request: HttpRequest,
    status: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
):
    """Export planned transactions as JSON."""
    workspace_id = request.auth.current_workspace_id

    export_data = PlannedTransactionService.export(workspace_id, status, start_date, end_date)
    response = HttpResponse(
        json.dumps(export_data, indent=2),
        content_type='application/json',
    )
    response['Content-Disposition'] = 'attachment; filename=planned_export.json'
    return response


@router.post('/import', response={201: dict, 400: dict, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def import_planned_transactions(
    request: HttpRequest,
    account_id: int = Form(...),
    budget_id: int | None = Form(None),
    file: UploadedFile = File(...),
):
    """Import planned transactions from a JSON file into an account (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    validate_file_size(file, max_size_mb=5)

    try:
        data = json.loads(file.read())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return 400, {'detail': 'Invalid JSON file.'}

    count = PlannedTransactionService.import_data(user, workspace_id, account_id, data, budget_id)
    if count == 0:
        return 201, {'message': 'No new planned transactions to import.'}
    return 201, {'message': f'Successfully imported {count} new planned transactions.'}


# Parameterized routes must come after specific routes
@router.get('/{planned_id}', response={200: PlannedTransactionOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_planned(request: HttpRequest, planned_id: int):
    """Get a specific planned transaction by ID."""
    workspace_id = request.auth.current_workspace_id
    return PlannedTransactionService.get_planned(planned_id, workspace_id)


@router.put(
    '/{planned_id}', response={200: PlannedTransactionOut, 400: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def update_planned(request: HttpRequest, planned_id: int, data: PlannedTransactionCreate):
    """Update a planned transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    planned = PlannedTransactionService.update(user, workspace_id, planned_id, data)
    return planned


@router.delete('/{planned_id}', response={204: None, 404: DetailOut}, auth=WorkspaceJWTAuth())
def delete_planned(request: HttpRequest, planned_id: int):
    """Delete a planned transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    PlannedTransactionService.delete(workspace_id, planned_id)
    return 204, None


@router.post(
    '/{planned_id}/execute',
    response={200: PlannedTransactionOut, 400: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
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
