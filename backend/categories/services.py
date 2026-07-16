"""Business logic for the categories app (budget-scoped, persistent categories)."""

from django.db import transaction as db_transaction

from budgeting.services import BudgetService
from categories.exceptions import CategoryDuplicateNameError, CategoryNotFoundError
from categories.models import Category
from categories.schemas import CategoryArchive, CategoryCreate, CategoryUpdate


class CategoryService:
    @staticmethod
    def _check_ci_duplicate(budget_id: int, name: str, exclude_id: int | None = None) -> None:
        queryset = Category.objects.filter(budget_id=budget_id, name__iexact=name)
        if exclude_id is not None:
            queryset = queryset.exclude(id=exclude_id)
        if queryset.exists():
            raise CategoryDuplicateNameError()

    @staticmethod
    def get(category_id: int, workspace_id: int) -> Category:
        """Get a category and verify it belongs to the workspace."""
        category = Category.objects.for_workspace(workspace_id).filter(id=category_id).first()
        if not category:
            raise CategoryNotFoundError()
        return category

    @staticmethod
    def list(workspace_id: int, budget_id: int, include_archived: bool = False) -> list[Category]:
        """List categories of a budget, archived ones only on request."""
        BudgetService.get(budget_id, workspace_id)
        queryset = Category.objects.filter(budget_id=budget_id)
        if not include_archived:
            queryset = queryset.filter(is_archived=False)
        return list(queryset)

    @staticmethod
    def list_workspace(workspace_id: int, include_archived: bool = False) -> 'list[Category]':
        # NOTE: the annotation is quoted — `list` is shadowed by the staticmethod above
        # inside this class body.
        """List categories across all budgets of a workspace (for cross-budget filters)."""
        queryset = Category.objects.for_workspace(workspace_id).order_by('budget_id', 'name')
        if not include_archived:
            queryset = queryset.filter(is_archived=False)
        return list(queryset)

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, budget_id: int, data: CategoryCreate) -> Category:
        """Create a category under a budget (case-insensitively unique name per budget)."""
        BudgetService.get(budget_id, workspace_id)
        CategoryService._check_ci_duplicate(budget_id, data.name)

        return Category.objects.create(
            budget_id=budget_id,
            workspace_id=workspace_id,
            name=data.name,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, budget_id: int, category_id: int, data: CategoryUpdate) -> Category:
        """Rename a category (case-insensitive duplicate check)."""
        category = CategoryService.get(category_id, workspace_id)
        if category.budget_id != budget_id:
            raise CategoryNotFoundError()

        if data.name is not None and data.name.lower() != category.name.lower():
            CategoryService._check_ci_duplicate(budget_id, data.name, exclude_id=category_id)
        if data.name is not None:
            category.name = data.name

        category.updated_by = user
        category.save()
        return category

    @staticmethod
    @db_transaction.atomic
    def set_archive_status(
        user, workspace_id: int, budget_id: int, category_id: int, data: CategoryArchive
    ) -> Category:
        """Archive or unarchive a category. Archived categories keep their history."""
        category = CategoryService.get(category_id, workspace_id)
        if category.budget_id != budget_id:
            raise CategoryNotFoundError()
        category.is_archived = data.is_archived
        category.updated_by = user
        category.save()
        return category

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, budget_id: int, category_id: int) -> None:
        """Delete a category. Transaction FKs are SET_NULL, so this uncategorizes records.

        B5: the budget-deletion prompt flow (delete-or-uncategorize transactions)
        arrives when transactions live on accounts.
        """
        category = CategoryService.get(category_id, workspace_id)
        if category.budget_id != budget_id:
            raise CategoryNotFoundError()
        category.delete()
