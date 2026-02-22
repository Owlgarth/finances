"""Django-Ninja API endpoints for transactions app."""

import json
from datetime import date
from decimal import Decimal
from typing import List, Optional

from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from budget_periods.models import BudgetPeriod
from common.auth import JWTAuth
from common.throttle import validate_file_size
from core.schemas import DetailOut
from transactions.models import Transaction
from transactions.schemas import TransactionCreate, TransactionOut
from transactions.services import TransactionService

router = Router(tags=['Transactions'])


# =============================================================================
# Transaction Endpoints
# =============================================================================


@router.get('', response=list[TransactionOut], auth=JWTAuth())
def list_transactions(
    request: HttpRequest,
    budget_period_id: Optional[int] = Query(None),
    current_date: Optional[date] = Query(None),
    type: Optional[List[str]] = Query(None),
    category_id: Optional[List[int]] = Query(None),
    search: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    amount_gte: Optional[Decimal] = Query(None),
    amount_lte: Optional[Decimal] = Query(None),
    ordering: Optional[str] = Query(None, pattern=r'^(date|-date)$'),
):
    """List transactions for the current workspace with optional filters."""
    workspace = request.auth.current_workspace
    if not workspace:
        raise HttpError(404, 'No workspace selected')

    queryset = Transaction.objects.select_related('category').filter(
        budget_period__budget_account__workspace_id=workspace.id
    )

    if budget_period_id:
        queryset = queryset.filter(budget_period_id=budget_period_id)
    elif current_date:
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace.id,
                start_date__lte=current_date,
                end_date__gte=current_date,
            )
            .first()
        )
        if not period:
            raise HttpError(404, 'No budget period found for the given date')
        queryset = queryset.filter(budget_period_id=period.id)

    if type:
        queryset = queryset.filter(type__in=type)
    if category_id:
        queryset = queryset.filter(category_id__in=category_id)
    if search:
        queryset = queryset.filter(description__icontains=search)
    if start_date:
        queryset = queryset.filter(date__gte=start_date)
    if end_date:
        queryset = queryset.filter(date__lte=end_date)
    if amount_gte is not None:
        queryset = queryset.filter(amount__gte=amount_gte)
    if amount_lte is not None:
        queryset = queryset.filter(amount__lte=amount_lte)

    sort_order = ordering or '-date'
    return list(queryset.order_by(sort_order, '-created_at'))


# Specific routes must come before parameterized routes
@router.get('/export/', auth=JWTAuth())
def export_transactions(
    request: HttpRequest,
    budget_period_id: int = Query(...),
    type: Optional[str] = Query(None, pattern=r'^(expense|income)$'),
):
    """Export transactions from a budget period as JSON."""
    workspace = request.auth.current_workspace
    if not workspace:
        raise HttpError(404, 'No workspace selected')

    export_data = TransactionService.export(workspace, budget_period_id, type)
    response = HttpResponse(json.dumps(export_data, indent=2), content_type='application/json')
    response['Content-Disposition'] = f'attachment; filename=transactions_export_{budget_period_id}.json'
    return response


@router.post('/import', response={201: dict, 400: dict, 404: dict}, auth=JWTAuth())
def import_transactions(
    request: HttpRequest,
    budget_period_id: int = Form(...),
    file: UploadedFile = File(...),
):
    """Import transactions from a JSON file into a budget period (requires write access)."""
    user = request.auth
    workspace = user.current_workspace
    if not workspace:
        raise HttpError(404, 'No workspace selected')

    validate_file_size(file, max_size_mb=5)

    try:
        data = json.loads(file.read())
    except json.JSONDecodeError:
        return 400, {'detail': 'Invalid JSON file.'}
    except Exception as e:
        return 400, {'detail': f'Invalid data format: {e}'}

    count = TransactionService.import_data(user, workspace, budget_period_id, data)
    if count == 0:
        return 201, {'message': 'No new transactions to import.'}
    return 201, {'message': f'Successfully imported {count} new transactions.'}


# Parameterized routes must come after specific routes
@router.get('/{transaction_id}', response={200: TransactionOut, 404: DetailOut}, auth=JWTAuth())
def get_transaction(request: HttpRequest, transaction_id: int):
    """Get a specific transaction by ID."""
    workspace = request.auth.current_workspace
    if not workspace:
        raise HttpError(404, 'No workspace selected')

    trans = TransactionService.get_transaction(transaction_id, workspace.id)
    if not trans:
        return 404, {'detail': 'Transaction not found'}
    return 200, trans


@router.post('', response={201: TransactionOut}, auth=JWTAuth())
def create_transaction(request: HttpRequest, data: TransactionCreate):
    """Create a new transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace
    if not workspace:
        raise HttpError(404, 'No workspace selected')

    trans = TransactionService.create(user, workspace, data)
    return 201, trans


@router.put('/{transaction_id}', response={200: TransactionOut}, auth=JWTAuth())
def update_transaction(request: HttpRequest, transaction_id: int, data: TransactionCreate):
    """Update a transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace
    if not workspace:
        raise HttpError(404, 'No workspace selected')

    trans = TransactionService.update(user, workspace, transaction_id, data)
    return 200, trans


@router.delete('/{transaction_id}', response={204: None}, auth=JWTAuth())
def delete_transaction(request: HttpRequest, transaction_id: int):
    """Delete a transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace
    if not workspace:
        raise HttpError(404, 'No workspace selected')

    TransactionService.delete(user, workspace, transaction_id)
    return 204, None
