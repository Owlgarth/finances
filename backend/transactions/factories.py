"""Factory Boy factories for the transactions app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from transactions.models import Transaction, TransactionItem


class TransactionFactory(DjangoModelFactory):
    class Meta:
        model = Transaction

    account = factory.SubFactory('accounts.factories.AccountFactory')
    # Own currency defaults to the account's; account-less rows pass
    # account=None plus an explicit currency AND workspace.
    currency = factory.LazyAttribute(lambda obj: obj.account.currency)
    workspace = factory.LazyAttribute(lambda obj: obj.account.workspace)
    date = factory.Faker('date_this_year')
    description = factory.Faker('sentence')
    category = None
    amount = Decimal('100.00')
    type = 'expense'
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')


class TransactionItemFactory(DjangoModelFactory):
    class Meta:
        model = TransactionItem

    transaction = factory.SubFactory(TransactionFactory)
    position = factory.Sequence(lambda n: n)
    name = factory.Faker('word')
    quantity = Decimal('1')
    unit_price = Decimal('10.00')
    line_total = Decimal('10.00')
