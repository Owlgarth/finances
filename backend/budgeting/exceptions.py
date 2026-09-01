"""Domain exceptions for the budgeting app."""

from django.utils.translation import gettext_lazy

from common.exceptions import NotFoundError, ValidationError


class BudgetNotFoundError(NotFoundError):
    default_message = gettext_lazy('Budget not found')
    default_code = 'budget_not_found'


class BudgetDuplicateNameError(ValidationError):
    default_message = gettext_lazy('Budget with this name already exists')
    default_code = 'budget_duplicate_name'


class BudgetCadenceConfigError(ValidationError):
    default_message = gettext_lazy('Every-N-weeks cadence requires cadence_weeks >= 1 and a cadence_anchor date')
    default_code = 'budget_cadence_config'


class PeriodNotFoundError(NotFoundError):
    default_message = gettext_lazy('Period not found')
    default_code = 'period_not_found'


class NoPeriodForDateError(ValidationError):
    default_message = gettext_lazy('This budget uses custom periods and no period covers the given date')
    default_code = 'no_period_for_date'


class PeriodOverlapError(ValidationError):
    default_message = gettext_lazy('Period overlaps an existing period of this budget')
    default_code = 'period_overlap'


class PeriodNotEditableError(ValidationError):
    default_message = gettext_lazy('Auto-created periods cannot be edited or deleted; only custom periods can')
    default_code = 'period_not_editable'


class CategoryBudgetNotFoundError(NotFoundError):
    default_message = gettext_lazy('Category budget not found')
    default_code = 'category_budget_not_found'


class CategoryBudgetInvalidCategoryError(ValidationError):
    default_message = gettext_lazy('Category does not belong to this budget')
    default_code = 'category_budget_invalid_category'
