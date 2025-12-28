"""Django-Ninja API endpoints for budget periods."""

from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta
from django.db import transaction
from ninja import Query, Router

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from budget_periods.schemas import (
    BudgetPeriodCopy,
    BudgetPeriodCreate,
    BudgetPeriodOut,
    BudgetPeriodUpdate,
)
from budgets.models import Budget
from categories.models import Category
from common.auth import JWTAuth
from core.schemas import DetailOut
from period_balances.models import PeriodBalance
from planned_transactions.models import PlannedTransaction

router = Router(tags=['Budget Periods'])


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


# =============================================================================
# Budget Period Endpoints
# =============================================================================


@router.get('', response=list[BudgetPeriodOut], auth=JWTAuth())
def list_periods(request, budget_account_id: Optional[int] = Query(None)):
    """List budget periods for the current workspace, optionally filtered by budget account."""
    workspace = request.auth.current_workspace
    queryset = BudgetPeriod.objects.select_related('budget_account').filter(budget_account__workspace_id=workspace.id)

    if budget_account_id:
        queryset = queryset.filter(budget_account_id=budget_account_id)

    return list(queryset.order_by('-start_date'))


@router.get('/current', response={200: BudgetPeriodOut, 404: DetailOut}, auth=JWTAuth())
def get_current_period(request, current_date: date):
    """Get the budget period containing the given date for the current workspace."""
    workspace = request.auth.current_workspace
    period = (
        BudgetPeriod.objects.select_related('budget_account')
        .filter(budget_account__workspace_id=workspace.id, start_date__lte=current_date, end_date__gte=current_date)
        .first()
    )
    if not period:
        return 404, {'detail': 'No budget period found for the given date'}
    return 200, period


@router.get('{period_id}', response={200: BudgetPeriodOut, 404: DetailOut}, auth=JWTAuth())
def get_period(request, period_id: int):
    """Get a specific budget period by ID."""
    workspace = request.auth.current_workspace
    period = get_workspace_period(period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Period not found'}
    return 200, period


@router.post('', response={201: BudgetPeriodOut, 404: DetailOut}, auth=JWTAuth())
def create_period(request, data: BudgetPeriodCreate):
    """Create a new budget period. The budget_account_id must belong to the current workspace."""
    workspace = request.auth.current_workspace

    # Verify the budget account belongs to the current workspace
    budget_account = BudgetAccount.objects.filter(id=data.budget_account_id, workspace_id=workspace.id).first()
    if not budget_account:
        return 404, {'detail': 'Budget account not found in current workspace'}

    with transaction.atomic():
        period = BudgetPeriod.objects.create(
            budget_account_id=data.budget_account_id,
            name=data.name,
            start_date=data.start_date,
            end_date=data.end_date,
            weeks=data.weeks,
            created_by=request.auth,
            updated_by=request.auth,
        )

        # Automatically create period balances for all currencies
        currencies = ['PLN', 'USD', 'EUR', 'UAH']
        PeriodBalance.objects.bulk_create(
            [
                PeriodBalance(
                    budget_period=period,
                    currency=currency,
                    opening_balance=0,
                    total_income=0,
                    total_expenses=0,
                    exchanges_in=0,
                    exchanges_out=0,
                    closing_balance=0,
                )
                for currency in currencies
            ]
        )

    return 201, period


@router.put('{period_id}', response={200: BudgetPeriodOut, 404: DetailOut}, auth=JWTAuth())
def update_period(request, period_id: int, data: BudgetPeriodUpdate):
    """Update a budget period."""
    workspace = request.auth.current_workspace
    period = get_workspace_period(period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Period not found'}

    # If budget_account_id is being changed, verify the new account belongs to workspace
    if data.budget_account_id is not None and data.budget_account_id != period.budget_account_id:
        new_account = BudgetAccount.objects.filter(id=data.budget_account_id, workspace_id=workspace.id).first()
        if not new_account:
            return 404, {'detail': 'Budget account not found in current workspace'}
        period.budget_account_id = data.budget_account_id

    if data.name is not None:
        period.name = data.name
    if data.start_date is not None:
        period.start_date = data.start_date
    if data.end_date is not None:
        period.end_date = data.end_date
    if data.weeks is not None:
        period.weeks = data.weeks

    period.updated_by = request.auth
    period.save()

    return 200, period


@router.delete('{period_id}', response={204: None, 404: DetailOut}, auth=JWTAuth())
def delete_period(request, period_id: int):
    """Delete a budget period."""
    workspace = request.auth.current_workspace
    period = get_workspace_period(period_id, workspace.id)
    if not period:
        return 404, {'detail': 'Period not found'}

    period.delete()
    return 204, None


@router.post('{period_id}/copy', response={201: BudgetPeriodOut, 404: DetailOut}, auth=JWTAuth())
def copy_period(request, period_id: int, data: BudgetPeriodCopy):
    """
    Copy a budget period with all categories, budgets, and planned transactions.
    Planned transactions will have their dates adjusted and status set to pending.
    """
    workspace = request.auth.current_workspace

    # Get source period and verify it belongs to current workspace
    source_period = get_workspace_period(period_id, workspace.id)
    if not source_period:
        return 404, {'detail': 'Period not found'}

    with transaction.atomic():
        # Create new period (must be in same budget account as source)
        new_period = BudgetPeriod.objects.create(
            budget_account_id=source_period.budget_account_id,
            name=data.name,
            start_date=data.start_date,
            end_date=data.end_date,
            weeks=data.weeks,
            created_by=request.auth,
            updated_by=request.auth,
        )

        # Create period balances for all currencies
        currencies = ['PLN', 'USD', 'EUR', 'UAH']
        PeriodBalance.objects.bulk_create(
            [
                PeriodBalance(
                    budget_period=new_period,
                    currency=currency,
                    opening_balance=0,
                    total_income=0,
                    total_expenses=0,
                    exchanges_in=0,
                    exchanges_out=0,
                    closing_balance=0,
                )
                for currency in currencies
            ]
        )

        # Calculate date offset between periods
        date_offset = relativedelta(new_period.start_date, source_period.start_date)

        # Copy categories and keep mapping
        category_mapping = {}  # old_id -> new_category
        for source_category in source_period.categories.all():
            new_category = Category.objects.create(
                budget_period=new_period,
                name=source_category.name,
                created_by=request.auth,
            )
            category_mapping[source_category.id] = new_category

        # Copy budgets
        Budget.objects.bulk_create(
            [
                Budget(
                    budget_period=new_period,
                    category_id=category_mapping[source_budget.category_id].id,
                    currency=source_budget.currency,
                    amount=source_budget.amount,
                )
                for source_budget in source_period.budgets.all()
                if source_budget.category_id in category_mapping
            ]
        )

        # Copy planned transactions with adjusted dates and status
        planned_transactions_to_create = []
        for source_planned in source_period.planned_transactions.all():
            new_category_id = None
            if source_planned.category_id:
                new_category = category_mapping.get(source_planned.category_id)
                if new_category:
                    new_category_id = new_category.id

            # Adjust the planned date
            new_planned_date = source_planned.planned_date + date_offset

            planned_transactions_to_create.append(
                PlannedTransaction(
                    budget_period=new_period,
                    name=source_planned.name,
                    amount=source_planned.amount,
                    currency=source_planned.currency,
                    category_id=new_category_id,
                    planned_date=new_planned_date,
                    payment_date=None,
                    status='pending',
                    transaction_id=None,
                    created_by=request.auth,
                )
            )

        PlannedTransaction.objects.bulk_create(planned_transactions_to_create)

    return 201, new_period
