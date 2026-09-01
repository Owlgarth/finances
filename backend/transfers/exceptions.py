"""Domain exceptions for the transfers app."""

from django.utils.translation import gettext_lazy

from common.exceptions import NotFoundError, ValidationError


class TransferNotFoundError(NotFoundError):
    default_message = gettext_lazy('Transfer not found')
    default_code = 'transfer_not_found'


class TransferAccountsEqualError(ValidationError):
    default_message = gettext_lazy('From and to accounts must differ')
    default_code = 'transfer_accounts_equal'


class TransferAccountArchivedError(ValidationError):
    default_message = gettext_lazy('Cannot transfer to or from an archived account')
    default_code = 'transfer_account_archived'


class TransferAmountsMismatchError(ValidationError):
    default_message = gettext_lazy('Amounts must match for same-currency transfers')
    default_code = 'transfer_amounts_mismatch'


class TransferToAmountRequiredError(ValidationError):
    default_message = gettext_lazy('to_amount is required for cross-currency transfers')
    default_code = 'transfer_to_amount_required'
