"""Django-Ninja API endpoints for budgets app."""

from django.contrib.auth import get_user_model
from ninja import Query, Router
from ninja.errors import HttpError

from budget_periods.models import BudgetPeriod
from budgets.models import Budget
from budgets.schemas import BudgetCreate, BudgetOut, BudgetUpdate
from categories.models import Category
from common.auth import JWTAuth

router = Router(tags=['Budgets'])

User = get_user_model()


# =============================================================================
# Auth Helpers
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


def get_workspace_budget(budget_id: int, workspace_id: int) -> Budget:
    """Helper to get a budget and verify it belongs to the current workspace."""
    budget = (
        Budget.objects.select_related('category')
        .filter(id=budget_id, budget_period__budget_account__workspace_id=workspace_id)
        .first()
    )
    if not budget:
        return None
    return budget


# =============================================================================
# Budget Endpoints
# =============================================================================


@router.get('', response=list[BudgetOut], auth=JWTAuth())
def list_budgets(
    request,
    budget_period_id: int | None = Query(None),
):
    """List budgets for the current workspace, optionally filtered by period."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    queryset = Budget.objects.select_related('category').filter(
        budget_period__budget_account__workspace_id=workspace.id
    )

    if budget_period_id:
        queryset = queryset.filter(budget_period_id=budget_period_id)

    return queryset


@router.post('', response={201: BudgetOut, 400: dict}, auth=JWTAuth())
def create_budget(request, data: BudgetCreate):
    """Create a new budget entry."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    # Verify the budget period belongs to current workspace
    period = get_workspace_period(data.budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    # Validate category_id belongs to budget_period_id
    category = Category.objects.filter(id=data.category_id, budget_period_id=data.budget_period_id).first()
    if not category:
        raise HttpError(400, 'Category not found or does not belong to the specified budget period')

    budget = Budget.objects.create(
        budget_period_id=data.budget_period_id,
        category_id=data.category_id,
        currency=data.currency,
        amount=data.amount,
        created_by=user,
        updated_by=user,
    )

    return 201, budget


@router.put('/{budget_id}', response=BudgetOut, auth=JWTAuth())
def update_budget(request, budget_id: int, data: BudgetUpdate):
    """Update a budget entry."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    budget = get_workspace_budget(budget_id, workspace.id)
    if not budget:
        raise HttpError(404, 'Budget not found')

    if data.amount is not None:
        budget.amount = data.amount

    budget.updated_by = user
    budget.save()

    return budget


@router.delete('/{budget_id}', response={204: None}, auth=JWTAuth())
def delete_budget(request, budget_id: int):
    """Delete a budget entry."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    budget = get_workspace_budget(budget_id, workspace.id)
    if not budget:
        raise HttpError(404, 'Budget not found')

    budget.delete()

    return 204, None
