"""Custom exceptions for planned_transactions app."""

from django.utils.translation import gettext_lazy

from common.exceptions import NotFoundError, ValidationError


class PlannedTransactionNotFoundError(NotFoundError):
    default_message = gettext_lazy('Planned transaction not found')
    default_code = 'not_found'


class PlannedTransactionAccountArchivedError(ValidationError):
    default_message = gettext_lazy('Account is archived and cannot receive new planned transactions')
    default_code = 'account_archived'


class PlannedTransactionCurrencyMismatchError(ValidationError):
    default_message = gettext_lazy('Currency does not match the account currency')
    default_code = 'currency_mismatch'


class PlannedTransactionCurrencyRequiredError(ValidationError):
    default_message = gettext_lazy('Currency is required when no account is set')
    default_code = 'currency_required'


class PlannedTransactionCategoryNotFoundError(ValidationError):
    default_message = gettext_lazy('Category not found, archived, or not in this workspace')
    default_code = 'category_not_found'


class PlannedTransactionAlreadyExecutedError(ValidationError):
    default_message = gettext_lazy('Already executed')
    default_code = 'already_executed'


class PlannedTransactionCannotRevertError(ValidationError):
    default_message = gettext_lazy('Cannot change status of an executed planned transaction')
    default_code = 'cannot_revert_executed'


class PlannedTransactionImportError(ValidationError):
    def __init__(self, message: str):
        super().__init__(message, code='import_error')


class RecurringTransactionNotFoundError(NotFoundError):
    default_message = gettext_lazy('Recurring transaction not found')
    default_code = 'not_found'


class RecurringTransactionEndDateError(ValidationError):
    default_message = gettext_lazy('End date must be on or after the start date')
    default_code = 'invalid_date_range'


class RecurringTransactionAdoptNotAllowedError(ValidationError):
    default_message = gettext_lazy('A planned transaction can only be adopted when creating a recurring rule')
    default_code = 'adopt_not_allowed'


class RecurringTransactionAdoptNotPendingError(ValidationError):
    default_message = gettext_lazy('Only a pending planned transaction can be converted to recurring')
    default_code = 'adopt_not_pending'


class RecurringTransactionAdoptAlreadyLinkedError(ValidationError):
    default_message = gettext_lazy('Planned transaction is already linked to a recurring rule')
    default_code = 'adopt_already_linked'
