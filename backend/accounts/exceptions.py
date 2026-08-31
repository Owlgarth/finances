"""Domain exceptions for the accounts app."""

from django.utils.translation import gettext_lazy

from common.exceptions import NotFoundError, ValidationError


class AccountNotFoundError(NotFoundError):
    default_message = gettext_lazy('Account not found')
    default_code = 'account_not_found'


class AccountDuplicateNameError(ValidationError):
    default_message = gettext_lazy('Account with this name already exists')
    default_code = 'account_duplicate_name'


class AccountCurrencyImmutableError(ValidationError):
    default_message = gettext_lazy('Account currency cannot be changed after creation')
    default_code = 'account_currency_immutable'


class AccountInUseError(ValidationError):
    default_message = gettext_lazy('Account has records and cannot be deleted. Archive it instead.')
    default_code = 'account_in_use'
