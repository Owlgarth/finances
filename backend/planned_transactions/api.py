"""Django-Ninja API endpoints for planned_transactions app."""

import json
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from budget_periods.models import BudgetPeriod
from categories.models import Category
from common.auth import JWTAuth
from period_balances.models import PeriodBalance
from planned_transactions.models import PlannedTransaction
from planned_transactions.schemas import (
    PlannedTransactionCreate,
    PlannedTransactionImport,
    PlannedTransactionOut,
    PlannedTransactionUpdate,
)
from transactions.models import Transaction
from workspaces.models import WorkspaceMember

router = Router(tags=['Planned Transactions'])


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


def get_workspace_planned(planned_id: int, workspace_id: int) -> PlannedTransaction:
    """Helper to get a planned transaction and verify it belongs to the current workspace."""
    planned = (
        PlannedTransaction.objects.select_related('budget_period__budget_account', 'category')
        .filter(
            id=planned_id,
            budget_period__budget_account__workspace_id=workspace_id,
        )
        .first()
    )
    if not planned:
        return None
    return planned


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


def update_period_balance_expense(period_id: int, currency: str, amount: Decimal) -> None:
    """Update period balance for an expense transaction."""
    balance = get_or_create_period_balance(period_id, currency)
    balance.total_expenses += amount
    balance.closing_balance = (
        balance.opening_balance
        + balance.total_income
        - balance.total_expenses
        + balance.exchanges_in
        - balance.exchanges_out
    )
    balance.save(update_fields=['total_expenses', 'closing_balance'])


def require_role(user, workspace_id: int, allowed_roles: list[str]) -> None:
    """Raise error if user's role is not in allowed_roles."""
    try:
        member = WorkspaceMember.objects.get(workspace_id=workspace_id, user=user)
        role = member.role
    except WorkspaceMember.DoesNotExist:
        role = 'viewer'
    if role not in allowed_roles:
        raise HttpError(403, f'Insufficient permissions. Required: {", ".join(allowed_roles)}. Your role: {role}')


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

    require_role(user, workspace.id, ['owner', 'admin', 'member'])

    period_id = data.budget_period_id
    if period_id:
        # Verify the period belongs to current workspace
        period = get_workspace_period(period_id, workspace.id)
        if not period:
            raise HttpError(400, 'Budget period not found')
    else:
        # Auto-assign period within current workspace
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace.id,
                start_date__lte=data.planned_date,
                end_date__gte=data.planned_date,
            )
            .first()
        )
        if not period:
            raise HttpError(400, 'No active budget period for the planned transaction date')
        period_id = period.id

    # Validate category_id belongs to budget_period_id (only if category is provided)
    if data.category_id:
        category = Category.objects.filter(
            id=data.category_id,
            budget_period_id=period_id,
        ).first()
        if not category:
            raise HttpError(400, 'Category not found or does not belong to the specified budget period')

    planned = PlannedTransaction.objects.create(
        budget_period_id=period_id,
        name=data.name,
        amount=data.amount,
        currency=data.currency,
        category_id=data.category_id,
        planned_date=data.planned_date,
        status=data.status,
        created_by=user,
        updated_by=user,
    )

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

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    queryset = PlannedTransaction.objects.select_related('category').filter(budget_period_id=budget_period_id)

    if status:
        queryset = queryset.filter(status=status)

    planned_transactions = queryset.order_by('planned_date')

    export_data = []
    for pt in planned_transactions:
        export_data.append(
            {
                'name': pt.name,
                'amount': str(pt.amount),
                'currency': pt.currency,
                'category_name': pt.category.name if pt.category else None,
                'planned_date': pt.planned_date.isoformat(),
            }
        )

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

    require_role(user, workspace.id, ['owner', 'admin', 'member'])

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    # Read and parse file
    try:
        contents = file.read()
        data = json.loads(contents)
    except json.JSONDecodeError:
        return 400, {'error': 'Invalid JSON file.'}
    except Exception as e:
        return 400, {'error': f'Invalid data format: {e}'}

    new_transactions = []
    for item in data:
        # Create import schema instance for validation
        try:
            import_item = PlannedTransactionImport(**item)
        except Exception as e:
            return 400, {'error': f'Invalid data format: {e}'}

        # Find category by name if provided
        category_id = None
        if import_item.category_name:
            category = Category.objects.filter(
                name=import_item.category_name,
                budget_period_id=budget_period_id,
            ).first()
            if category:
                category_id = category.id

        new_trans = PlannedTransaction(
            name=import_item.name,
            amount=import_item.amount,
            currency=import_item.currency,
            planned_date=import_item.planned_date,
            category_id=category_id,
            budget_period_id=budget_period_id,
            status='pending',
            created_by=user,
            updated_by=user,
        )
        new_transactions.append(new_trans)

    if not new_transactions:
        return 201, {'message': 'No new planned transactions to import.'}

    PlannedTransaction.objects.bulk_create(new_transactions)

    return 201, {'message': f'Successfully imported {len(new_transactions)} new planned transactions.'}


# Parameterized routes must come after specific routes
@router.get('/{planned_id}', response=PlannedTransactionOut, auth=JWTAuth())
def get_planned(request: HttpRequest, planned_id: int):
    """Get a specific planned transaction by ID."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    planned = get_workspace_planned(planned_id, workspace.id)
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

    require_role(user, workspace.id, ['owner', 'admin', 'member'])

    planned = get_workspace_planned(planned_id, workspace.id)
    if not planned:
        raise HttpError(404, 'Planned transaction not found')

    period_id = data.budget_period_id
    if period_id:
        # Verify the period belongs to current workspace
        period = get_workspace_period(period_id, workspace.id)
        if not period:
            raise HttpError(400, 'Budget period not found')
    else:
        # Auto-assign period within current workspace
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace.id,
                start_date__lte=data.planned_date,
                end_date__gte=data.planned_date,
            )
            .first()
        )
        if not period:
            raise HttpError(400, 'No active budget period for the planned transaction date')
        period_id = period.id

    # Validate category_id belongs to budget_period_id (only if category is provided)
    if data.category_id:
        category = Category.objects.filter(
            id=data.category_id,
            budget_period_id=period_id,
        ).first()
        if not category:
            raise HttpError(400, 'Category not found or does not belong to the specified budget period')

    # Update fields
    planned.budget_period_id = period_id
    planned.name = data.name
    planned.amount = data.amount
    planned.currency = data.currency
    planned.category_id = data.category_id
    planned.planned_date = data.planned_date
    planned.status = data.status
    planned.updated_by = user
    planned.save()

    return planned


@router.delete('/{planned_id}', response={204: None}, auth=JWTAuth())
def delete_planned(request: HttpRequest, planned_id: int):
    """Delete a planned transaction (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, ['owner', 'admin', 'member'])

    planned = get_workspace_planned(planned_id, workspace.id)
    if not planned:
        raise HttpError(404, 'Planned transaction not found')

    planned.delete()

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

    require_role(user, workspace.id, ['owner', 'admin', 'member'])

    planned = get_workspace_planned(planned_id, workspace.id)
    if not planned:
        raise HttpError(404, 'Planned transaction not found')

    if planned.status == 'done':
        raise HttpError(400, 'Already executed')

    with transaction.atomic():
        # Find period within current workspace
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace.id,
                start_date__lte=payment_date,
                end_date__gte=payment_date,
            )
            .first()
        )
        if not period:
            raise HttpError(400, 'No active budget period for the payment date')

        # Create actual transaction
        transaction_obj = Transaction.objects.create(
            budget_period_id=period.id,
            date=payment_date,
            description=planned.name,
            category_id=planned.category_id,
            amount=planned.amount,
            currency=planned.currency,
            type='expense',
            created_by=user,
            updated_by=user,
        )

        # Update balance
        update_period_balance_expense(period.id, planned.currency, planned.amount)

        # Update planned transaction
        planned.transaction_id = transaction_obj.id
        planned.status = 'done'
        planned.payment_date = payment_date
        planned.updated_by = user
        planned.save()

    return planned
