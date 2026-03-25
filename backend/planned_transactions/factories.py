"""Factory Boy factories for the planned_transactions app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from planned_transactions.models import PlannedTransaction


class PlannedTransactionFactory(DjangoModelFactory):
    class Meta:
        model = PlannedTransaction

    budget_period = factory.SubFactory('budget_periods.factories.BudgetPeriodFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.budget_period.budget_account.workspace)
    name = factory.Faker('sentence')
    amount = Decimal('100.00')
    currency = factory.LazyAttribute(lambda obj: obj.budget_period.budget_account.workspace.currencies.first())
    planned_date = factory.Faker('future_date')
    payment_date = None
    status = 'pending'
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
