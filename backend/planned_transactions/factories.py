"""Factory Boy factories for the planned_transactions app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from planned_transactions.models import PlannedTransaction


class PlannedTransactionFactory(DjangoModelFactory):
    class Meta:
        model = PlannedTransaction

    account = factory.SubFactory('accounts.factories.AccountFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.account.workspace)
    name = factory.Faker('sentence')
    amount = Decimal('100.00')
    category = None
    planned_date = factory.Faker('future_date')
    payment_date = None
    status = 'pending'
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
