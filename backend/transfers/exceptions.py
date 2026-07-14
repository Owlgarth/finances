"""Domain exceptions for the transfers app."""

from common.exceptions import NotFoundError, ValidationError


class TransferNotFoundError(NotFoundError):
    default_message = 'Transfer not found'
    default_code = 'transfer_not_found'


class TransferAccountsEqualError(ValidationError):
    default_message = 'From and to accounts must differ'
    default_code = 'transfer_accounts_equal'


class TransferAccountArchivedError(ValidationError):
    default_message = 'Cannot transfer to or from an archived account'
    default_code = 'transfer_account_archived'


class TransferAmountError(ValidationError):
    default_message = 'Transfer amounts must be positive'
    default_code = 'transfer_amount_invalid'


class TransferAmountsMismatchError(ValidationError):
    default_message = 'Amounts must match for same-currency transfers'
    default_code = 'transfer_amounts_mismatch'


class TransferToAmountRequiredError(ValidationError):
    default_message = 'to_amount is required for cross-currency transfers'
    default_code = 'transfer_to_amount_required'
