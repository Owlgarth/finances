"""Factory Boy factories for the planned_transactions app."""

from datetime import date
from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from planned_transactions.models import PlannedTransaction, RecurringTransaction


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


class RecurringTransactionFactory(DjangoModelFactory):
    """Recurring transaction rule factory.

    Account-having by default, currency derived from the account (same shape
    as PlannedTransactionFactory). Account-less rules pass account=None
    together with an explicit currency AND workspace. start_date is a FIXED
    day-31 date so monthly-clamp math is deterministic by default; date-math
    tests should still pass explicit start_date values.
    """

    class Meta:
        model = RecurringTransaction

    account = factory.SubFactory('accounts.factories.AccountFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.account.workspace)
    currency = factory.LazyAttribute(lambda obj: obj.account.currency)
    category = None
    name = factory.Faker('sentence')
    amount = Decimal('100.00')
    interval_kind = 'monthly'
    interval_count = 1
    start_date = date(2026, 1, 31)
    lead_days = 4
    upfront_count = 1
    materialize_all = False
    end_date = None
    is_active = True
    last_generated_date = None
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
