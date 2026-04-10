"""Business logic for the categories app."""

from __future__ import annotations

from django.db import IntegrityError

from budget_periods.services import BudgetPeriodService
from categories.exceptions import (
    CategoryDuplicateNameError,
    CategoryNotFoundError,
)
from categories.models import Category
from categories.schemas import CategoryCreate, CategoryUpdate
from core.schemas.pagination import DEFAULT_PAGE_SIZE, paginate_queryset


class CategoryService:
    @staticmethod
    def get_category(category_id: int, workspace_id: int) -> Category:
        """Get a category and verify it belongs to the workspace."""
        category = (
            Category.objects.select_related('budget_period__budget_account')
            .for_workspace(workspace_id)
            .filter(id=category_id)
            .first()
        )
        if not category:
            raise CategoryNotFoundError()
        return category

    @staticmethod
    def _empty_paginated(page: int, page_size: int) -> dict:
        """Return a paginated dict with empty items."""
        return {'items': [], 'total': 0, 'page': page, 'page_size': page_size, 'total_pages': 0}

    @staticmethod
    def list(
        workspace_id: int,
        budget_period_id: int | None = None,
        current_date=None,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> dict:
        """List categories for a workspace, optionally filtered by period or date.

        Returns an empty paginated result (not 404) when budget_period_id does not belong to
        the workspace. This prevents leaking whether a period ID exists elsewhere.
        """
        from budget_periods.models import BudgetPeriod

        if current_date and not budget_period_id:
            period = (
                BudgetPeriod.objects.select_related('budget_account')
                .for_workspace(workspace_id)
                .filter(start_date__lte=current_date, end_date__gte=current_date)
                .first()
            )
            if period:
                budget_period_id = period.id
            else:
                return CategoryService._empty_paginated(page, page_size)

        if budget_period_id is None:
            return CategoryService._empty_paginated(page, page_size)

        if not BudgetPeriod.objects.for_workspace(workspace_id).filter(id=budget_period_id).exists():
            return CategoryService._empty_paginated(page, page_size)

        queryset = Category.objects.filter(budget_period_id=budget_period_id)
        items, total, page, page_size, total_pages = paginate_queryset(queryset, page, page_size)
        return {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        }

    @staticmethod
    def create(user, workspace_id: int, data: CategoryCreate) -> Category:
        """Create a category, validating period ownership."""
        BudgetPeriodService.get(data.budget_period_id, workspace_id)

        try:
            return Category.objects.create(
                budget_period_id=data.budget_period_id,
                workspace_id=workspace_id,
                name=data.name,
                created_by=user,
                updated_by=user,
            )
        except IntegrityError:
            raise CategoryDuplicateNameError()

    @staticmethod
    def update(user, workspace_id: int, category_id: int, data: CategoryUpdate) -> Category:
        """Update a category."""
        category = CategoryService.get_category(category_id, workspace_id)

        if data.name is not None:
            category.name = data.name

        category.updated_by = user
        category.save()

        return category

    @staticmethod
    def delete(workspace_id: int, category_id: int) -> None:
        """Delete a category."""
        category = CategoryService.get_category(category_id, workspace_id)
        category.delete()

    @staticmethod
    def export(workspace_id: int, period_id: int) -> list[str]:
        """Return category names for a period."""
        BudgetPeriodService.get(period_id, workspace_id)

        return list(Category.objects.filter(budget_period_id=period_id).values_list('name', flat=True))

    @staticmethod
    def import_data(user, workspace_id: int, period_id: int, data: list) -> int:
        """Bulk-create categories from a list of name strings. Returns count of created records."""
        BudgetPeriodService.get(period_id, workspace_id)

        existing_names = set(Category.objects.filter(budget_period_id=period_id).values_list('name', flat=True))

        new_categories = []
        for name in data:
            if name not in existing_names:
                new_categories.append(
                    Category(
                        name=name,
                        budget_period_id=period_id,
                        workspace_id=workspace_id,
                        created_by=user,
                        updated_by=user,
                    )
                )
                existing_names.add(name)

        if not new_categories:
            return 0

        Category.objects.bulk_create(new_categories)
        return len(new_categories)
