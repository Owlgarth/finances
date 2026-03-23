"""Custom exceptions for budget_accounts app."""

from common.exceptions import NotFoundError, ValidationError


class BudgetAccountNotFoundError(NotFoundError):
    default_message = 'Budget account not found'
    default_code = 'not_found'


class BudgetAccountDuplicateNameError(ValidationError):
    default_message = 'Budget account with this name already exists'
    default_code = 'duplicate_name'
