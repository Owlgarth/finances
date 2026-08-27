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


class CurrencyOrderMismatchError(ValidationError):
    default_message = (
        "The currency order must list exactly the workspace's enabled currencies "
        '(same set, no duplicates, none missing, none extra)'
    )
    default_code = 'currency_order_mismatch'


# Human labels for the per-type reference breakdown; iteration order of the
# dict passed to CurrencyInUseError drives the sentence order.
REFERENCE_LABELS = {
    'accounts': 'account',
    'category_budgets': 'planned amount',
    'budget_currencies': 'budget currency set',
    'planned_transactions': 'planned transaction',
}


class CurrencyInUseError(ValidationError):
    default_code = 'currency_in_use'

    def __init__(self, code: str, breakdown: dict[str, int]):
        parts = [
            f'{count} {REFERENCE_LABELS.get(kind, kind)}{"s" if count != 1 else ""}'
            for kind, count in breakdown.items()
            if count
        ]
        summary = ', '.join(parts) if parts else 'other records'
        super().__init__(f'Currency {code} is in use: {summary}. Remove those references before disabling it.')
