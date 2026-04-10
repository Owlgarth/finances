from common.exceptions import NotFoundError, ValidationError


class ExchangeShortcutNotFoundError(NotFoundError):
    default_message = 'Exchange shortcut not found'
    default_code = 'exchange_shortcut_not_found'


class ExchangeShortcutLimitError(ValidationError):
    default_message = 'Exchange shortcut limit reached for this workspace'
    default_code = 'exchange_shortcut_limit_reached'


class ExchangeShortcutDuplicateError(ValidationError):
    default_message = 'This currency pair shortcut already exists'
    default_code = 'exchange_shortcut_duplicate'


class ExchangeShortcutCurrencyError(ValidationError):
    default_message = 'Currencies must be different'
    default_code = 'exchange_shortcut_same_currency'


class ExchangeShortcutCurrencyNotInWorkspaceError(ValidationError):
    default_code = 'exchange_shortcut_currency_not_in_workspace'

    def __init__(self, currency: str):
        super().__init__(
            f'Currency {currency} not found in workspace', code='exchange_shortcut_currency_not_in_workspace'
        )
