"""Business logic for the budgets app."""

from ninja.errors import HttpError

from budgets.models import Budget
from budgets.schemas import BudgetCreate, BudgetUpdate
from categories.models import Category
from common.permissions import require_role
from common.services.base import get_workspace_period
from workspaces.models import WRITE_ROLES


class BudgetService:
    @staticmethod
    def get_budget(budget_id: int, workspace_id: int) -> Budget | None:
        """Get a budget and verify it belongs to the workspace."""
        return (
            Budget.objects.select_related('category')
            .filter(id=budget_id, budget_period__budget_account__workspace_id=workspace_id)
            .first()
        )

    @staticmethod
    def create(user, workspace, data: BudgetCreate) -> Budget:
        """Create a budget entry, validating period and category membership."""
        require_role(user, workspace.id, WRITE_ROLES)

        period = get_workspace_period(data.budget_period_id, workspace.id)
        if not period:
            raise HttpError(404, 'Budget period not found')

        category = Category.objects.filter(id=data.category_id, budget_period_id=data.budget_period_id).first()
        if not category:
            raise HttpError(400, 'Category not found or does not belong to the specified budget period')

        return Budget.objects.create(
            budget_period_id=data.budget_period_id,
            category_id=data.category_id,
            currency=data.currency,
            amount=data.amount,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    def update(user, workspace, budget_id: int, data: BudgetUpdate) -> Budget:
        """Update a budget entry."""
        require_role(user, workspace.id, WRITE_ROLES)

        budget = BudgetService.get_budget(budget_id, workspace.id)
        if not budget:
            raise HttpError(404, 'Budget not found')

        if data.amount is not None:
            budget.amount = data.amount

        budget.updated_by = user
        budget.save()

        return budget

    @staticmethod
    def delete(user, workspace, budget_id: int) -> None:
        """Delete a budget entry."""
        require_role(user, workspace.id, WRITE_ROLES)

        budget = BudgetService.get_budget(budget_id, workspace.id)
        if not budget:
            raise HttpError(404, 'Budget not found')

        budget.delete()
