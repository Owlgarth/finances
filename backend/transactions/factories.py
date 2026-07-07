"""Factory Boy factories for the transactions app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from transactions.models import Transaction


class TransactionFactory(DjangoModelFactory):
    class Meta:
        model = Transaction

    account = factory.SubFactory('accounts.factories.AccountFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.account.workspace)
    date = factory.Faker('date_this_year')
    description = factory.Faker('sentence')
    category = None
    amount = Decimal('100.00')
    type = 'expense'
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
