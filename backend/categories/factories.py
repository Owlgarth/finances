"""Factory Boy factories for the categories app."""

import factory
from factory.django import DjangoModelFactory

from categories.models import Category


class CategoryFactory(DjangoModelFactory):
    class Meta:
        model = Category

    budget_period = factory.SubFactory('budget_periods.factories.BudgetPeriodFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.budget_period.workspace)
    name = factory.Faker('word')
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
