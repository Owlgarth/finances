"""Custom exceptions for bookmarks app."""

from django.utils.translation import gettext_lazy

from common.exceptions import NotFoundError, ValidationError


class BookmarkNotFoundError(NotFoundError):
    default_message = gettext_lazy('Bookmark not found')
    default_code = 'not_found'


class BookmarkDuplicateNameError(ValidationError):
    default_message = gettext_lazy('A bookmark with this name already exists')
    default_code = 'duplicate_name'


class BookmarkInvalidTargetError(ValidationError):
    """Family base for bookmark target-shape violations (kind/field coherence).

    Sub-classes give the precise sub-case; catching this class catches every
    target validation failure. All map to HTTP 400.
    """

    default_message = gettext_lazy('Bookmark target is invalid for its kind')
    default_code = 'invalid_target'


class BookmarkBudgetTargetRequiredError(BookmarkInvalidTargetError):
    default_message = gettext_lazy('Budget bookmarks require a budget and a currency')
    default_code = 'budget_target_required'


class BookmarkFilterTargetNotAllowedError(BookmarkInvalidTargetError):
    default_message = gettext_lazy('Only budget bookmarks can reference a budget or currency')
    default_code = 'filter_target_not_allowed'


class BookmarkBudgetNotFoundError(NotFoundError):
    """The bookmark's budget FK is a resource reference, not a filter value -
    a missing budget is a 404 (BudgetService.get precedent), not a 400."""

    default_message = gettext_lazy('Budget not found in this workspace')
    default_code = 'budget_not_found'


class BookmarkCurrencyNotEnabledError(NotFoundError):
    """The bookmark's currency is a resource reference too - unknown/disabled
    codes 404 (UnknownCurrencyError precedent in TransactionService)."""

    default_message = gettext_lazy('Currency is not enabled in this workspace')
    default_code = 'currency_not_enabled'
