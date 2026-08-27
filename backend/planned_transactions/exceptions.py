"""Custom exceptions for planned_transactions app."""

from common.exceptions import NotFoundError, ValidationError


class PlannedTransactionNotFoundError(NotFoundError):
    default_message = 'Planned transaction not found'
    default_code = 'not_found'


class PlannedTransactionAccountArchivedError(ValidationError):
    default_message = 'Account is archived and cannot receive new planned transactions'
    default_code = 'account_archived'


class PlannedTransactionCurrencyMismatchError(ValidationError):
    default_message = 'Currency does not match the account currency'
    default_code = 'currency_mismatch'


class PlannedTransactionCurrencyRequiredError(ValidationError):
    default_message = 'Currency is required when no account is set'
    default_code = 'currency_required'


class PlannedTransactionCategoryNotFoundError(ValidationError):
    default_message = 'Category not found, archived, or not in this workspace'
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
