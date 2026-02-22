"""Django-Ninja API endpoints for budget periods."""

from datetime import date
from typing import Optional

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
from budget_periods.services import BudgetPeriodService
from common.auth import JWTAuth
from common.permissions import require_role
from common.services.base import get_workspace_currencies, get_workspace_period
from core.schemas import DetailOut
from period_balances.models import PeriodBalance
from workspaces.models import WRITE_ROLES

router = Router(tags=['Budget Periods'])


# =============================================================================
# Helper Functions
# =============================================================================


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
    user = request.auth
    workspace = user.current_workspace

    require_role(user, workspace.id, WRITE_ROLES)

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
            created_by=user,
            updated_by=user,
        )

        # Automatically create period balances for all currencies
        currencies = get_workspace_currencies(workspace)
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
    user = request.auth
    workspace = user.current_workspace

    require_role(user, workspace.id, WRITE_ROLES)

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

    period.updated_by = user
    period.save()

    return 200, period


@router.delete('{period_id}', response={204: None, 404: DetailOut}, auth=JWTAuth())
def delete_period(request, period_id: int):
    """Delete a budget period."""
    user = request.auth
    workspace = user.current_workspace

    require_role(user, workspace.id, WRITE_ROLES)

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
    user = request.auth
    workspace = user.current_workspace

    new_period = BudgetPeriodService.copy(user, workspace, period_id, data)
    return 201, new_period
