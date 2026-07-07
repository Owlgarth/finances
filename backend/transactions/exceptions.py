"""Custom exceptions for transactions app."""

from common.exceptions import NotFoundError, ValidationError


class TransactionNotFoundError(NotFoundError):
    default_message = 'Transaction not found'
    default_code = 'not_found'


class TransactionCategoryNotFoundError(ValidationError):
    default_message = 'Category not found, archived, or not in this workspace'
    default_code = 'category_not_found'


class AccountRequiredError(ValidationError):
    default_message = 'Multiple accounts exist — specify account_id'
    default_code = 'account_required'


class TransactionAccountArchivedError(ValidationError):
    default_message = 'Account is archived and cannot receive new transactions'
    default_code = 'account_archived'


class TransactionAmountInvalidError(ValidationError):
    default_message = 'Amount must be positive (income/expense) or a non-zero delta (adjustment)'
    default_code = 'amount_invalid'


class TransactionAdjustmentCategoryError(ValidationError):
    default_message = 'Adjustments cannot have a category'
    default_code = 'adjustment_category'


class TransactionOriginalCurrencyError(ValidationError):
    default_code = 'original_currency_invalid'

    def __init__(self, message: str = 'Original currency is unknown or equals the account currency'):
        super().__init__(message)


class TransactionBulkAccountError(ValidationError):
    default_message = 'All transactions and the target account must belong to the workspace'
    default_code = 'bulk_account_invalid'


class TransactionImportError(ValidationError):
    def __init__(self, message: str):
        super().__init__(message, code='import_error')
