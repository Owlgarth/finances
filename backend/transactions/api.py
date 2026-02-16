"""Django-Ninja API endpoints for transactions app."""

import json
from datetime import date
from decimal import Decimal
from typing import List, Optional

from django.db import transaction
from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from budget_periods.models import BudgetPeriod
from categories.models import Category
from common.auth import JWTAuth
from common.permissions import require_role
from core.schemas import DetailOut
from period_balances.models import PeriodBalance
from transactions.models import Transaction
from transactions.schemas import (
    TransactionCreate,
    TransactionImport,
    TransactionOut,
)
from workspaces.models import WRITE_ROLES

router = Router(tags=['Transactions'])


# =============================================================================
# Helper Functions
# =============================================================================


def get_workspace_period(period_id: int, workspace_id: int) -> BudgetPeriod | None:
    """Helper to get a period and verify it belongs to the current workspace."""
    period = (
        BudgetPeriod.objects.select_related('budget_account')
        .filter(id=period_id, budget_account__workspace_id=workspace_id)
        .first()
    )
    return period


def get_workspace_transaction(transaction_id: int, workspace_id: int) -> Transaction | None:
    """Helper to get a transaction and verify it belongs to the current workspace."""
    trans = (
        Transaction.objects.select_related('category', 'budget_period__budget_account')
        .filter(
            id=transaction_id,
            budget_period__budget_account__workspace_id=workspace_id,
        )
        .first()
    )
    return trans


def get_or_create_period_balance(period_id: int, currency: str) -> PeriodBalance:
    """Get existing or create new period balance record."""
    balance = PeriodBalance.objects.filter(
        budget_period_id=period_id,
        currency=currency,
    ).first()

    if not balance:
        balance = PeriodBalance.objects.create(
            budget_period_id=period_id,
            currency=currency,
            opening_balance=Decimal('0'),
            total_income=Decimal('0'),
            total_expenses=Decimal('0'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('0'),
        )

    return balance


def update_period_balance(period_id: int, currency: str, trans_type: str, amount: Decimal, operation: str) -> None:
    """Update period balance for a transaction."""
    balance = get_or_create_period_balance(period_id, currency)
    amount_value = amount if operation == 'add' else -amount

    if trans_type == 'income':
        balance.total_income += amount_value
    else:  # expense
        balance.total_expenses += amount_value

    balance.closing_balance = (
        balance.opening_balance
        + balance.total_income
        - balance.total_expenses
        + balance.exchanges_in
        - balance.exchanges_out
    )
    balance.save()


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

    # Default to descending date order if not specified
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

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    queryset = Transaction.objects.select_related('category').filter(budget_period_id=budget_period_id)

    if type:
        queryset = queryset.filter(type=type)

    transactions = queryset.order_by('-date')

    export_data = []
    for trans in transactions:
        export_data.append(
            {
                'date': trans.date.isoformat(),
                'description': trans.description,
                'category_name': trans.category.name if trans.category else None,
                'amount': str(trans.amount),
                'currency': trans.currency,
                'type': trans.type,
            }
        )

    response = HttpResponse(
        json.dumps(export_data, indent=2),
        content_type='application/json',
    )
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

    require_role(user, workspace.id, WRITE_ROLES)

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Budget period not found'}

    # Read and parse file
    try:
        contents = file.read()
        data = json.loads(contents)
    except json.JSONDecodeError:
        return 400, {'detail': 'Invalid JSON file.'}
    except Exception as e:
        return 400, {'detail': f'Invalid data format: {e}'}

    new_transactions = []
    for item in data:
        # Create import schema instance for validation
        try:
            import_item = TransactionImport(**item)
        except Exception as e:
            return 400, {'detail': f'Invalid data format: {e}'}

        # Income transactions should not have category
        if import_item.type == 'income':
            category_id = None
        else:
            # Find category by name if provided
            category_id = None
            if import_item.category_name:
                category = Category.objects.filter(
                    name=import_item.category_name,
                    budget_period_id=budget_period_id,
                ).first()
                if category:
                    category_id = category.id

        new_trans = Transaction(
            date=import_item.date,
            description=import_item.description,
            category_id=category_id,
            amount=import_item.amount,
            currency=import_item.currency,
            type=import_item.type,
            budget_period_id=budget_period_id,
            created_by=user,
            updated_by=user,
        )
        new_transactions.append(new_trans)

    if not new_transactions:
        return 201, {'message': 'No new transactions to import.'}

    with transaction.atomic():
        Transaction.objects.bulk_create(new_transactions)

        # Update balances for imported transactions
        for trans in new_transactions:
            update_period_balance(budget_period_id, trans.currency, trans.type, trans.amount, 'add')

    return 201, {'message': f'Successfully imported {len(new_transactions)} new transactions.'}


# Parameterized routes must come after specific routes
@router.get('/{transaction_id}', response={200: TransactionOut, 404: DetailOut}, auth=JWTAuth())
def get_transaction(request: HttpRequest, transaction_id: int):
    """Get a specific transaction by ID."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    trans = get_workspace_transaction(transaction_id, workspace.id)
    if not trans:
        return 404, {'detail': 'Transaction not found'}

    return 200, trans


@router.post('', response={201: TransactionOut, 400: dict, 404: dict}, auth=JWTAuth())
def create_transaction(request: HttpRequest, data: TransactionCreate):
    """Create a new transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, WRITE_ROLES)

    # Income transactions should not have a category
    category_id = None if data.type == 'income' else data.category_id

    # Use provided budget_period_id or auto-assign period
    period_id = data.budget_period_id
    if period_id:
        # Verify the period belongs to current workspace
        period = get_workspace_period(period_id, workspace.id)
        if not period:
            return 404, {'detail': 'Budget period not found'}
    else:
        # Auto-assign period within current workspace
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace.id,
                start_date__lte=data.date,
                end_date__gte=data.date,
            )
            .first()
        )
        if not period:
            return 400, {'detail': 'No active budget period for the transaction date'}
        period_id = period.id

    # Validate category_id belongs to budget_period_id (only for expense)
    if category_id:
        category = Category.objects.filter(
            id=category_id,
            budget_period_id=period_id,
        ).first()
        if not category:
            return 400, {'detail': 'Category not found or does not belong to the assigned budget period'}

    with transaction.atomic():
        trans = Transaction.objects.create(
            date=data.date,
            description=data.description,
            category_id=category_id,
            amount=data.amount,
            currency=data.currency,
            type=data.type,
            budget_period_id=period_id,
            created_by=user,
            updated_by=user,
        )

        # Update balance
        update_period_balance(period_id, data.currency, data.type, data.amount, 'add')

    return 201, trans


@router.put('/{transaction_id}', response={200: TransactionOut, 400: dict, 404: dict}, auth=JWTAuth())
def update_transaction(request: HttpRequest, transaction_id: int, data: TransactionCreate):
    """Update a transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, WRITE_ROLES)

    # Income transactions should not have a category
    category_id = None if data.type == 'income' else data.category_id

    trans = get_workspace_transaction(transaction_id, workspace.id)
    if not trans:
        return 404, {'detail': 'Transaction not found'}

    with transaction.atomic():
        # Revert old balance
        if trans.budget_period_id:
            update_period_balance(trans.budget_period_id, trans.currency, trans.type, trans.amount, 'subtract')

        # Use provided budget_period_id or auto-assign period
        period_id = data.budget_period_id
        if period_id:
            # Verify the period belongs to current workspace
            period = get_workspace_period(period_id, workspace.id)
            if not period:
                return 400, {'detail': 'Budget period not found'}
        else:
            # Auto-assign period within current workspace
            period = (
                BudgetPeriod.objects.select_related('budget_account')
                .filter(
                    budget_account__workspace_id=workspace.id,
                    start_date__lte=data.date,
                    end_date__gte=data.date,
                )
                .first()
            )
            if not period:
                return 400, {'detail': 'No active budget period for the transaction date'}
            period_id = period.id

        # Validate category_id belongs to budget_period_id (only for expense)
        if category_id:
            category = Category.objects.filter(
                id=category_id,
                budget_period_id=period_id,
            ).first()
            if not category:
                return 400, {'detail': 'Category not found or does not belong to the assigned budget period'}

        # Update transaction
        trans.date = data.date
        trans.description = data.description
        trans.category_id = category_id
        trans.amount = data.amount
        trans.currency = data.currency
        trans.type = data.type
        trans.budget_period_id = period_id
        trans.updated_by = user
        trans.save()

        # Apply new balance
        update_period_balance(period_id, data.currency, data.type, data.amount, 'add')

    return 200, trans


@router.delete('/{transaction_id}', response={204: None, 404: dict}, auth=JWTAuth())
def delete_transaction(request: HttpRequest, transaction_id: int):
    """Delete a transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, WRITE_ROLES)

    trans = get_workspace_transaction(transaction_id, workspace.id)
    if not trans:
        return 404, {'detail': 'Transaction not found'}

    with transaction.atomic():
        # Revert balance
        if trans.budget_period_id:
            update_period_balance(trans.budget_period_id, trans.currency, trans.type, trans.amount, 'subtract')

        trans.delete()

    return 204, None
