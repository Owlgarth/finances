"""Business logic for the categories app."""

from django.db import IntegrityError
from ninja.errors import HttpError

from categories.models import Category
from categories.schemas import CategoryCreate, CategoryUpdate
from common.permissions import require_role
from common.services.base import get_workspace_period
from workspaces.models import WRITE_ROLES


class CategoryService:
    @staticmethod
    def get_category(category_id: int, workspace_id: int) -> Category | None:
        """Get a category and verify it belongs to the workspace."""
        return (
            Category.objects.select_related('budget_period__budget_account')
            .filter(id=category_id, budget_period__budget_account__workspace_id=workspace_id)
            .first()
        )

    @staticmethod
    def create(user, workspace, data: CategoryCreate) -> Category:
        """Create a category, validating period ownership."""
        require_role(user, workspace.id, WRITE_ROLES)

        period = get_workspace_period(data.budget_period_id, workspace.id)
        if not period:
            raise HttpError(404, 'Budget period not found')

        try:
            return Category.objects.create(
                budget_period_id=data.budget_period_id,
                name=data.name,
                created_by=user,
                updated_by=user,
            )
        except IntegrityError:
            raise HttpError(400, 'A category with this name already exists in this budget period.')

    @staticmethod
    def update(user, workspace, category_id: int, data: CategoryUpdate) -> Category:
        """Update a category."""
        require_role(user, workspace.id, WRITE_ROLES)

        category = CategoryService.get_category(category_id, workspace.id)
        if not category:
            raise HttpError(404, 'Category not found')

        if data.name is not None:
            category.name = data.name

        category.updated_by = user
        category.save()

        return category

    @staticmethod
    def delete(user, workspace, category_id: int) -> None:
        """Delete a category."""
        require_role(user, workspace.id, WRITE_ROLES)

        category = CategoryService.get_category(category_id, workspace.id)
        if not category:
            raise HttpError(404, 'Category not found')

        category.delete()

    @staticmethod
    def export(workspace, period_id: int) -> list[str]:
        """Return category names for a period."""
        period = get_workspace_period(period_id, workspace.id)
        if not period:
            raise HttpError(404, 'Budget period not found')

        return list(Category.objects.filter(budget_period_id=period_id).values_list('name', flat=True))

    @staticmethod
    def import_data(user, workspace, period_id: int, data: list) -> int:
        """Bulk-create categories from a list of name strings. Returns count of created records."""
        require_role(user, workspace.id, WRITE_ROLES)

        period = get_workspace_period(period_id, workspace.id)
        if not period:
            raise HttpError(404, 'Budget period not found')

        existing_names = set(Category.objects.filter(budget_period_id=period_id).values_list('name', flat=True))

        new_categories = []
        for name in data:
            if name not in existing_names:
                new_categories.append(Category(name=name, budget_period_id=period_id))
                existing_names.add(name)

        if not new_categories:
            return 0

        Category.objects.bulk_create(new_categories)
        return len(new_categories)
