"""Factory Boy factories for the categories app."""

import factory
from factory.django import DjangoModelFactory

from categories.models import Category


class CategoryFactory(DjangoModelFactory):
    class Meta:
        model = Category

    budget = factory.SubFactory('budgeting.factories.BudgetFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.budget.workspace)
    name = factory.Sequence(lambda n: f'Category {n}')
    is_archived = False
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
