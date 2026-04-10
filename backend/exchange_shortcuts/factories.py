"""Factory Boy factories for the exchange_shortcuts app."""

import factory
from factory.django import DjangoModelFactory

from common.tests.factories import UserFactory
from exchange_shortcuts.models import ExchangeShortcut
from workspaces.factories import WorkspaceFactory


class ExchangeShortcutFactory(DjangoModelFactory):
    class Meta:
        model = ExchangeShortcut

    workspace = factory.SubFactory(WorkspaceFactory)
    created_by = factory.SubFactory(UserFactory)
    updated_by = factory.SubFactory(UserFactory)
    from_currency = 'PLN'
    to_currency = 'USD'
