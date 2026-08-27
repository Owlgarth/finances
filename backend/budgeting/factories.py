"""Factory Boy factories for the budgeting app."""

from datetime import date

import factory
from factory.django import DjangoModelFactory

from budgeting.models import Budget, BudgetCurrency, Cadence, Period


def _current_month_start():
    return date.today().replace(day=1)


def _current_month_end():
    import calendar

    today = date.today()
    return today.replace(day=calendar.monthrange(today.year, today.month)[1])


class BudgetFactory(DjangoModelFactory):
    class Meta:
        model = Budget

    workspace = factory.SubFactory('workspaces.factories.WorkspaceFactory')
    name = factory.Sequence(lambda n: f'Budget {n}')
    is_active = True
    display_order = 0
    cadence = Cadence.MONTHLY


class BudgetCurrencyFactory(DjangoModelFactory):
    class Meta:
        model = BudgetCurrency
        django_get_or_create = ('budget', 'currency')

    budget = factory.SubFactory(BudgetFactory)
    currency = factory.SubFactory('currencies.factories.CatalogCurrencyFactory')
    position = 0


class PeriodFactory(DjangoModelFactory):
    class Meta:
        model = Period

    budget = factory.SubFactory(BudgetFactory)
    workspace = factory.LazyAttribute(lambda o: o.budget.workspace)
    name = factory.LazyFunction(lambda: date.today().strftime('%B %Y'))
    start_date = factory.LazyFunction(_current_month_start)
    end_date = factory.LazyFunction(_current_month_end)
    is_custom = False
