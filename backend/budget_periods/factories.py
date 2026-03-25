"""Factory Boy factories for the budget_periods app."""

from datetime import timedelta

import factory
from factory.django import DjangoModelFactory

from budget_periods.models import BudgetPeriod


class BudgetPeriodFactory(DjangoModelFactory):
    class Meta:
        model = BudgetPeriod

    budget_account = factory.SubFactory('common.tests.factories.BudgetAccountFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.budget_account.workspace)
    name = factory.Faker('word')
    start_date = factory.Faker('date_this_year')
    end_date = factory.LazyAttribute(lambda obj: obj.start_date + timedelta(days=30))
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
