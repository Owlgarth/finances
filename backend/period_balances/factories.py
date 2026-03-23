"""Factory Boy factories for the period_balances app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from period_balances.models import PeriodBalance


class PeriodBalanceFactory(DjangoModelFactory):
    class Meta:
        model = PeriodBalance

    budget_period = factory.SubFactory('budget_periods.factories.BudgetPeriodFactory')
    currency = factory.LazyAttribute(lambda obj: obj.budget_period.budget_account.workspace.currencies.first())
    opening_balance = Decimal('1000.00')
    total_income = Decimal('500.00')
    total_expenses = Decimal('200.00')
    exchanges_in = Decimal('0')
    exchanges_out = Decimal('0')
    closing_balance = Decimal('1300.00')
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
