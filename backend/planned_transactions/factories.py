"""Factory Boy factories for the planned_transactions app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from planned_transactions.models import PlannedTransaction


class PlannedTransactionFactory(DjangoModelFactory):
    """Planned transaction factory.

    Account-having by default, with the currency derived from the account.
    Account-less rows pass account=None together with an explicit currency
    AND workspace (the workspace LazyAttribute cannot derive from a None
    account): PlannedTransactionFactory(account=None, currency=eur,
    workspace=self.workspace, ...).
    """

    class Meta:
        model = PlannedTransaction

    account = factory.SubFactory('accounts.factories.AccountFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.account.workspace)
    currency = factory.LazyAttribute(lambda obj: obj.account.currency)
    name = factory.Faker('sentence')
    amount = Decimal('100.00')
    category = None
    planned_date = factory.Faker('future_date')
    payment_date = None
    status = 'pending'
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
