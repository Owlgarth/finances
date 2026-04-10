"""Django-Ninja API endpoints for transactions app."""

import json
from datetime import date
from decimal import Decimal

from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.files import UploadedFile

from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from common.throttle import validate_file_size
from core.schemas.pagination import PaginatedOut
from transactions.schemas import TransactionCreate, TransactionOut
from transactions.services import TransactionService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Transactions'])


@router.get('', response=PaginatedOut[TransactionOut], auth=WorkspaceJWTAuth())
def list_transactions(
    request: HttpRequest,
    budget_period_id: int | None = Query(None),
    current_date: date | None = Query(None),
    type: list[str] | None = Query(None),
    category_id: list[int] | None = Query(None),
    search: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    amount_gte: Decimal | None = Query(None),
    amount_lte: Decimal | None = Query(None),
    ordering: str | None = Query(None, pattern=r'^(date|-date)$'),
    page: int = Query(1, ge=1),
    page_size: int = Query(25),
):
    """List transactions for the current workspace with optional filters."""
    workspace_id = request.auth.current_workspace_id
    return TransactionService.list(
        workspace_id=workspace_id,
        budget_period_id=budget_period_id,
        current_date=current_date,
        type=type,
        category_id=category_id,
        search=search,
        start_date=start_date,
        end_date=end_date,
        amount_gte=amount_gte,
        amount_lte=amount_lte,
        ordering=ordering,
        page=page,
        page_size=page_size,
    )


@router.get('/export/', auth=WorkspaceJWTAuth())
def export_transactions(
    request: HttpRequest,
    budget_period_id: int = Query(...),
    type: str | None = Query(None, pattern=r'^(expense|income)$'),
):
    """Export transactions from a budget period as JSON."""
    workspace_id = request.auth.current_workspace_id
    export_data = TransactionService.export(workspace_id, budget_period_id, type)
    response = HttpResponse(json.dumps(export_data, indent=2), content_type='application/json')
    response['Content-Disposition'] = f'attachment; filename=transactions_export_{budget_period_id}.json'
    return response


@router.post('/import', response={201: dict, 400: dict}, auth=WorkspaceJWTAuth())
def import_transactions(
    request: HttpRequest,
    budget_period_id: int = Form(...),
    file: UploadedFile = File(...),
):
    """Import transactions from a JSON file into a budget period (requires write access)."""
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

    count = TransactionService.import_data(user, workspace_id, budget_period_id, data)

    if count == 0:
        return 201, {'message': 'No new transactions to import.'}
    return 201, {'message': f'Successfully imported {count} new transactions.'}


@router.get('/{transaction_id}', response=TransactionOut, auth=WorkspaceJWTAuth())
def get_transaction(request: HttpRequest, transaction_id: int):
    """Get a specific transaction by ID."""
    workspace_id = request.auth.current_workspace_id
    return TransactionService.get_transaction(transaction_id, workspace_id)


@router.post('', response={201: TransactionOut}, auth=WorkspaceJWTAuth())
def create_transaction(request: HttpRequest, data: TransactionCreate):
    """Create a new transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    trans = TransactionService.create(user, workspace_id, data)
    return 201, trans


@router.put('/{transaction_id}', response=TransactionOut, auth=WorkspaceJWTAuth())
def update_transaction(request: HttpRequest, transaction_id: int, data: TransactionCreate):
    """Update a transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return TransactionService.update(user, workspace_id, transaction_id, data)


@router.delete('/{transaction_id}', response={204: None}, auth=WorkspaceJWTAuth())
def delete_transaction(request: HttpRequest, transaction_id: int):
    """Delete a transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    TransactionService.delete(workspace_id, transaction_id)
    return 204, None
