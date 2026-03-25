"""Business logic for the budgets app."""

from budget_periods.services import BudgetPeriodService
from budgets.exceptions import (
    BudgetCategoryNotFoundError,
    BudgetNotFoundError,
)
from budgets.models import Budget
from budgets.schemas import BudgetCreate, BudgetUpdate
from categories.models import Category
from common.exceptions import CurrencyNotFoundInWorkspaceError
from common.services.base import resolve_currency


class BudgetService:
    @staticmethod
    def get_budget(budget_id: int, workspace_id: int) -> Budget:
        """Get a budget and verify it belongs to the workspace."""
        budget = (
            Budget.objects.select_related('category', 'currency')
            .for_workspace(workspace_id)
            .filter(id=budget_id)
            .first()
        )
        if not budget:
            raise BudgetNotFoundError()
        return budget

    @staticmethod
    def list(workspace_id: int, budget_period_id: int | None = None) -> list[Budget]:
        """List budgets for a workspace, optionally filtered by period."""
        queryset = Budget.objects.select_related('category').for_workspace(workspace_id)
        if budget_period_id:
            queryset = queryset.filter(budget_period_id=budget_period_id)
        return list(queryset)

    @staticmethod
    def create(user, workspace_id: int, data: BudgetCreate) -> Budget:
        """Create a budget entry, validating period and category membership."""
        BudgetPeriodService.get(data.budget_period_id, workspace_id)

        category = Category.objects.filter(id=data.category_id, budget_period_id=data.budget_period_id).first()
        if not category:
            raise BudgetCategoryNotFoundError()

        currency = resolve_currency(workspace_id, data.currency)
        if not currency:
            raise CurrencyNotFoundInWorkspaceError(data.currency)

        return Budget.objects.create(
            budget_period_id=data.budget_period_id,
            workspace_id=workspace_id,
            category_id=data.category_id,
            currency=currency,
            amount=data.amount,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    def update(user, workspace_id: int, budget_id: int, data: BudgetUpdate) -> Budget:
        """Update a budget entry."""
        budget = BudgetService.get_budget(budget_id, workspace_id)

        if data.amount is not None:
            budget.amount = data.amount

        budget.updated_by = user
        budget.save()

        return budget

    @staticmethod
    def delete(workspace_id: int, budget_id: int) -> None:
        """Delete a budget entry."""
        budget = BudgetService.get_budget(budget_id, workspace_id)
        budget.delete()
