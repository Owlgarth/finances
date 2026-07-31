"""Business logic for the categories app (budget-scoped, persistent categories)."""

from django.db import transaction as db_transaction

from budgeting.models import CategoryBudget
from budgeting.services import BudgetService
from categories.exceptions import CategoryDuplicateNameError, CategoryMergeSelfError, CategoryNotFoundError
from categories.models import Category
from categories.schemas import CategoryArchive, CategoryCreate, CategoryMerge, CategoryUpdate
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction


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
    def merge(user, workspace_id: int, budget_id: int, category_id: int, data: CategoryMerge) -> Category:
        """Merge another category of the same budget into this one.

        Transactions, planned transactions, and planned amounts move to the
        target category; planned amounts for the same period and currency are
        summed. The source category is deleted afterwards.
        """
        target = CategoryService.get(category_id, workspace_id)
        if target.budget_id != budget_id:
            raise CategoryNotFoundError()
        if data.source_category_id == target.id:
            raise CategoryMergeSelfError()
        source = CategoryService.get(data.source_category_id, workspace_id)
        if source.budget_id != budget_id:
            raise CategoryNotFoundError()

        # Serialize concurrent merges touching either category: lock both rows in a
        # deterministic order (by id) to avoid deadlock, and re-verify both still
        # exist — a concurrent merge may have deleted the source while we waited.
        # Must materialize via list(): .count() compiles to an aggregate query,
        # from which Django silently strips FOR UPDATE (Postgres forbids it),
        # acquiring no locks at all.
        locked = list(Category.objects.select_for_update().filter(id__in=[target.id, source.id]).order_by('id'))
        if len(locked) != 2:
            raise CategoryNotFoundError()

        Transaction.objects.filter(category=source).update(category=target)
        PlannedTransaction.objects.filter(category=source).update(category=target)

        target_amounts = {(cb.period_id, cb.currency_id): cb for cb in CategoryBudget.objects.filter(category=target)}
        for cb in CategoryBudget.objects.filter(category=source):
            existing = target_amounts.get((cb.period_id, cb.currency_id))
            if existing:
                existing.amount += cb.amount
                existing.updated_by = user
                existing.save(update_fields=['amount', 'updated_by', 'updated_at'])
                cb.delete()
            else:
                cb.category = target
                cb.updated_by = user
                cb.save(update_fields=['category', 'updated_by', 'updated_at'])

        source.delete()
        target.updated_by = user
        target.save(update_fields=['updated_by', 'updated_at'])
        return target

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
