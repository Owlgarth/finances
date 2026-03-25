"""Factory Boy factories for the currency_exchanges app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from currency_exchanges.models import CurrencyExchange


class CurrencyExchangeFactory(DjangoModelFactory):
    class Meta:
        model = CurrencyExchange

    budget_period = factory.SubFactory('budget_periods.factories.BudgetPeriodFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.budget_period.budget_account.workspace)
    date = factory.Faker('date_this_year')
    description = factory.Faker('sentence')
    from_currency = factory.LazyAttribute(lambda obj: obj.budget_period.budget_account.workspace.currencies.first())
    from_amount = Decimal('100.00')
    to_currency = factory.LazyAttribute(lambda obj: obj.budget_period.budget_account.workspace.currencies.first())
    to_amount = Decimal('25.00')
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
