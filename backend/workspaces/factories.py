"""Factory Boy factories for the workspaces app."""

import factory
from factory.django import DjangoModelFactory

from workspaces.models import Currency, Workspace, WorkspaceMember

# Legacy per-workspace currency rows created for tests (the old 4-currency
# default). Removed with the legacy Currency model in B8.
DEFAULT_CURRENCIES = [
    ('USD', 'US Dollar'),
    ('UAH', 'Ukrainian Hryvnia'),
    ('PLN', 'Polish Zloty'),
    ('EUR', 'Euro'),
]


class WorkspaceFactory(DjangoModelFactory):
    class Meta:
        model = Workspace
        skip_postgeneration_save = True

    name = factory.Faker('company')

    @factory.post_generation
    def currencies(self, create, extracted, **kwargs):
        if not create:
            return

        if extracted:
            for symbol, name in extracted:
                Currency.objects.create(workspace=self, symbol=symbol, name=name)
        else:
            for symbol, name in DEFAULT_CURRENCIES:
                Currency.objects.create(workspace=self, symbol=symbol, name=name)


class CurrencyFactory(DjangoModelFactory):
    class Meta:
        model = Currency
        django_get_or_create = ('symbol', 'workspace')

    workspace = factory.SubFactory(WorkspaceFactory)
    name = factory.Faker('currency_name')
    symbol = factory.Faker('currency_code')


class WorkspaceMemberFactory(DjangoModelFactory):
    class Meta:
        model = WorkspaceMember

    workspace = factory.SubFactory(WorkspaceFactory)
    user = factory.SubFactory('common.tests.factories.UserFactory')
    role = 'owner'
