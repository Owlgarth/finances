"""Custom exceptions for budget_periods app."""

from common.exceptions import NotFoundError


class BudgetPeriodNotFoundError(NotFoundError):
    default_message = 'Period not found'
    default_code = 'not_found'


class BudgetPeriodAccountNotFoundError(NotFoundError):
    default_message = 'Budget account not found in current workspace'
    default_code = 'not_found'
