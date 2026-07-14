"""Factory Boy factories for the currencies app."""

import factory
from factory.django import DjangoModelFactory

from currencies.models import Currency, WorkspaceCurrency


class CatalogCurrencyFactory(DjangoModelFactory):
    """Global catalog currency (workspace=None)."""

    class Meta:
        model = Currency
        django_get_or_create = ('code', 'workspace')

    code = 'USD'
    name = 'US Dollar'
    symbol = '$'
    decimals = 2
    is_custom = False
    workspace = None


class CustomCurrencyFactory(DjangoModelFactory):
    """Workspace-owned custom currency."""

    class Meta:
        model = Currency
        django_get_or_create = ('code', 'workspace')

    code = 'GOLD'
    name = 'Gold grams'
    symbol = 'g'
    decimals = 2
    is_custom = True
    workspace = factory.SubFactory('workspaces.factories.WorkspaceFactory')


class WorkspaceCurrencyFactory(DjangoModelFactory):
    class Meta:
        model = WorkspaceCurrency
        django_get_or_create = ('workspace', 'currency')

    workspace = factory.SubFactory('workspaces.factories.WorkspaceFactory')
    currency = factory.SubFactory(CatalogCurrencyFactory)
