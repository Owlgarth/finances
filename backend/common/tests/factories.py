"""Factory Boy factories for testing."""

import factory
from factory.django import DjangoModelFactory

from budget_accounts.models import BudgetAccount
from users.models import User
from workspaces.models import Currency, Workspace, WorkspaceCurrency, WorkspaceMember


class CurrencyFactory(DjangoModelFactory):
    class Meta:
        model = Currency
        django_get_or_create = ('symbol',)

    name = factory.Faker('currency_name')
    symbol = factory.Faker('currency_code')


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Faker('email')
    full_name = factory.Faker('name')
    current_workspace = factory.SubFactory('common.tests.factories.WorkspaceFactory')


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
            for currency in extracted:
                WorkspaceCurrency.objects.create(workspace=self, currency=currency)
        else:
            default_currencies = [
                ('PLN', 'Polish Zloty'),
                ('USD', 'US Dollar'),
                ('EUR', 'Euro'),
                ('UAH', 'Ukrainian Hryvnia'),
            ]
            for symbol, name in default_currencies:
                currency, _ = Currency.objects.get_or_create(
                    symbol=symbol,
                    defaults={'name': name},
                )
                WorkspaceCurrency.objects.create(workspace=self, currency=currency)


class WorkspaceMemberFactory(DjangoModelFactory):
    class Meta:
        model = WorkspaceMember

    workspace = factory.SubFactory(WorkspaceFactory)
    user = factory.SubFactory(UserFactory)
    role = 'owner'


class BudgetAccountFactory(DjangoModelFactory):
    class Meta:
        model = BudgetAccount

    workspace = factory.SubFactory(WorkspaceFactory)
    name = factory.Faker('word')
    description = factory.Faker('sentence')
    default_currency = 'PLN'
    is_active = True
    display_order = 0
