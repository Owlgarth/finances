"""Factory Boy factories for the transfers app."""

from datetime import date
from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from transfers.models import Transfer


class TransferFactory(DjangoModelFactory):
    """Same-currency transfer between two accounts of one workspace."""

    class Meta:
        model = Transfer

    from_account = factory.SubFactory('accounts.factories.AccountFactory')
    to_account = factory.SubFactory(
        'accounts.factories.AccountFactory',
        workspace=factory.SelfAttribute('..from_account.workspace'),
    )
    workspace = factory.LazyAttribute(lambda obj: obj.from_account.workspace)
    from_amount = Decimal('40.00')
    to_amount = Decimal('40.00')
    date = factory.LazyFunction(date.today)
    description = ''
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
