"""Factory Boy factories for the transactions app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from transactions.models import Transaction


class TransactionFactory(DjangoModelFactory):
    class Meta:
        model = Transaction

    budget_period = factory.SubFactory('budget_periods.factories.BudgetPeriodFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.budget_period.budget_account.workspace)
    date = factory.Faker('date_this_year')
    description = factory.Faker('sentence')
    category = factory.SubFactory('categories.factories.CategoryFactory')
    amount = Decimal('100.00')
    currency = factory.LazyAttribute(lambda obj: obj.budget_period.budget_account.workspace.currencies.first())
    type = 'expense'
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
