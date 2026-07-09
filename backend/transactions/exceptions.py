"""Custom exceptions for transactions app."""

from common.exceptions import NotFoundError, ServiceError, ValidationError


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


class AttachmentNotFoundError(NotFoundError):
    default_message = 'Attachment not found'
    default_code = 'not_found'


class AttachmentTypeError(ValidationError):
    default_message = 'Unsupported file type — allowed: JPEG, PNG, HEIC, WebP, PDF'
    default_code = 'unsupported_media_type'


class AttachmentStorageUnavailableError(ServiceError):
    http_status = 503
    default_message = 'File storage is not configured'
    default_code = 'storage_unavailable'
