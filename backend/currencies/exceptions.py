"""Domain exceptions for the currencies app."""

from common.exceptions import NotFoundError, ValidationError


class UnknownCurrencyError(NotFoundError):
    default_code = 'unknown_currency'

    def __init__(self, code: str):
        super().__init__(f'Currency {code} not found in the catalog')


class CurrencyNotEnabledError(NotFoundError):
    default_code = 'currency_not_enabled'

    def __init__(self, code: str):
        super().__init__(f'Currency {code} is not enabled for this workspace')


class DuplicateCurrencyError(ValidationError):
    default_code = 'duplicate_currency'

    def __init__(self, code: str):
        super().__init__(f'Currency {code} already exists')


class LastCurrencyError(ValidationError):
    default_message = 'Cannot disable the only enabled currency of a workspace'
    default_code = 'last_currency'


class CurrencyInUseError(ValidationError):
    default_code = 'currency_in_use'

    def __init__(self, code: str, references: int):
        super().__init__(f'Currency {code} is referenced by {references} record(s) and cannot be disabled')
