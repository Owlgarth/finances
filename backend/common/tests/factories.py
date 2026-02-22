"""Factory Boy factories for testing."""

import factory
from factory.django import DjangoModelFactory

from budget_accounts.models import BudgetAccount
from users.models import User


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Faker('email')
    full_name = factory.Faker('name')
    current_workspace = factory.SubFactory('workspaces.factories.WorkspaceFactory')


class BudgetAccountFactory(DjangoModelFactory):
    class Meta:
        model = BudgetAccount

    workspace = factory.SubFactory('workspaces.factories.WorkspaceFactory')
    name = factory.Faker('word')
    description = factory.Faker('sentence')
    default_currency = factory.LazyAttribute(lambda obj: obj.workspace.currencies.filter(symbol='PLN').first())
    is_active = True
    display_order = 0
