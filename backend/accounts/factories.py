"""Factory Boy factories for the accounts app."""

import factory
from factory.django import DjangoModelFactory

from accounts.models import Account, AccountType
from currencies.models import Currency


def _default_currency():
    """Get-or-create the global PLN catalog row (seeded by conftest in tests)."""
    currency, _ = Currency.objects.get_or_create(
        code='PLN', workspace=None, defaults={'name': 'Polish Zloty', 'symbol': 'zł', 'decimals': 2}
    )
    return currency


class AccountFactory(DjangoModelFactory):
    class Meta:
        model = Account

    workspace = factory.SubFactory('workspaces.factories.WorkspaceFactory')
    name = factory.Sequence(lambda n: f'Account {n}')
    type = AccountType.BANK
    currency = factory.LazyFunction(_default_currency)
    opening_balance = 0
    is_archived = False
    display_order = 0
