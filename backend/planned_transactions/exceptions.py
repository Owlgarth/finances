"""Custom exceptions for planned_transactions app."""

from common.exceptions import NotFoundError, ValidationError


class PlannedTransactionNotFoundError(NotFoundError):
    default_message = 'Planned transaction not found'
    default_code = 'not_found'


class PlannedTransactionPeriodNotFoundError(NotFoundError):
    default_message = 'Budget period not found'
    default_code = 'period_not_found'


class PlannedTransactionNoActivePeriodError(ValidationError):
    default_message = 'No active budget period for the planned transaction date'
    default_code = 'no_active_period'


class PlannedTransactionCategoryNotFoundError(ValidationError):
    default_message = 'Category not found or does not belong to the specified budget period'
    default_code = 'category_not_found'


class PlannedTransactionAlreadyExecutedError(ValidationError):
    default_message = 'Already executed'
    default_code = 'already_executed'


class PlannedTransactionCannotRevertError(ValidationError):
    default_message = 'Cannot change status of an executed planned transaction'
    default_code = 'cannot_revert_executed'


class PlannedTransactionImportError(ValidationError):
    def __init__(self, message: str):
        super().__init__(message, code='import_error')
