"""Factory Boy factories for the budgets app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from budgets.models import Budget


class BudgetFactory(DjangoModelFactory):
    class Meta:
        model = Budget

    budget_period = factory.SubFactory('budget_periods.factories.BudgetPeriodFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.budget_period.workspace)
    category = factory.SubFactory('categories.factories.CategoryFactory')
    currency = factory.LazyAttribute(lambda obj: obj.budget_period.budget_account.workspace.currencies.first())
    amount = Decimal('100.00')
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
