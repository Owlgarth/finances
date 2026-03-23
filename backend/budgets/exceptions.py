"""Custom exceptions for budgets app."""

from common.exceptions import NotFoundError, ValidationError


class BudgetNotFoundError(NotFoundError):
    default_message = 'Budget not found'
    default_code = 'not_found'


class BudgetCategoryNotFoundError(ValidationError):
    default_message = 'Category not found or does not belong to the specified budget period'
    default_code = 'category_not_found'
