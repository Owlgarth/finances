"""Domain exceptions for the currencies app."""

from django.utils.translation import gettext_lazy, ngettext

from common.exceptions import NotFoundError, ValidationError


class UnknownCurrencyError(NotFoundError):
    default_code = 'unknown_currency'

    def __init__(self, code: str):
        super().__init__(gettext_lazy('Currency %(code)s not found in the catalog') % {'code': code})


class CurrencyNotEnabledError(NotFoundError):
    default_code = 'currency_not_enabled'

    def __init__(self, code: str):
        super().__init__(gettext_lazy('Currency %(code)s is not enabled for this workspace') % {'code': code})


class DuplicateCurrencyError(ValidationError):
    default_code = 'duplicate_currency'

    def __init__(self, code: str):
        super().__init__(gettext_lazy('Currency %(code)s already exists') % {'code': code})


class LastCurrencyError(ValidationError):
    default_message = gettext_lazy('Cannot disable the only enabled currency of a workspace')
    default_code = 'last_currency'


class CurrencyOrderMismatchError(ValidationError):
    default_message = gettext_lazy(
        "The currency order must list exactly the workspace's enabled currencies "
        '(same set, no duplicates, none missing, none extra)'
    )
    default_code = 'currency_order_mismatch'


def _reference_label(kind: str, count: int) -> str:
    """Locale-correct plural label for a reference kind (literal msgid pairs
    so xgettext collects them; unknown kinds fall back to the raw key).

    Iteration order of the dict passed to CurrencyInUseError drives the
    sentence order, so a new reference kind appends its branch LAST.
    """
    if kind == 'accounts':
        return ngettext('account', 'accounts', count)
    if kind == 'category_budgets':
        return ngettext('planned amount', 'planned amounts', count)
    if kind == 'budget_currencies':
        return ngettext('budget currency set', 'budget currency sets', count)
    if kind == 'planned_transactions':
        return ngettext('planned transaction', 'planned transactions', count)
    if kind == 'transactions':
        return ngettext('transaction', 'transactions', count)
    return kind


class CurrencyInUseError(ValidationError):
    default_code = 'currency_in_use'

    def __init__(self, code: str, breakdown: dict[str, int]):
        parts = [f'{count} {_reference_label(kind, count)}' for kind, count in breakdown.items() if count]
        summary = ', '.join(parts) if parts else str(gettext_lazy('other records'))
        super().__init__(
            gettext_lazy('Currency %(code)s is in use: %(summary)s. Remove those references before disabling it.')
            % {'code': code, 'summary': summary},
        )
