"""Custom exceptions for currency_exchanges app."""

from common.exceptions import NotFoundError, ValidationError


class CurrencyExchangeNotFoundError(NotFoundError):
    default_message = 'Exchange not found'
    default_code = 'not_found'


class CurrencyExchangePeriodNotFoundError(NotFoundError):
    default_message = 'Budget period not found'
    default_code = 'period_not_found'


class CurrencyExchangeImportError(ValidationError):
    def __init__(self, message: str):
        super().__init__(message, code='import_error')


class CurrencyExchangeNoPeriodError(ValidationError):
    default_message = 'No budget period covers the given date. Create a period first.'
    default_code = 'currency_exchange_no_period'
