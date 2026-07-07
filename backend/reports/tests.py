"""Tests for reports API endpoints.

Budget-summary tests were deleted with the legacy allocation app in B4;
the report is rebuilt in B8 on budgeting models.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_periods.factories import BudgetPeriodFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from period_balances.factories import PeriodBalanceFactory
from period_balances.models import PeriodBalance

User = get_user_model()


class ReportsTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base test case for reports tests with common setup."""

    def setUp(self):
        """Set up authenticated user and create test data."""
        super().setUp()

        self.period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            weeks=5,
            created_by=self.user,
        )

        self.period2 = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            name='February 2025',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 28),
            weeks=4,
            created_by=self.user,
        )

        self.pln = self.workspace.currencies.filter(symbol='PLN').first()
        self.usd = self.workspace.currencies.filter(symbol='USD').first()

        PeriodBalanceFactory(
            budget_period=self.period,
            currency=self.pln,
            opening_balance=Decimal('5000.00'),
            total_income=Decimal('8000.00'),
            total_expenses=Decimal('3000.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('10000.00'),
            created_by=self.user,
        )

        PeriodBalanceFactory(
            budget_period=self.period,
            currency=self.usd,
            opening_balance=Decimal('1000.00'),
            total_income=Decimal('2000.00'),
            total_expenses=Decimal('500.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('2500.00'),
            created_by=self.user,
        )

        PeriodBalanceFactory(
            budget_period=self.period2,
            currency=self.pln,
            opening_balance=Decimal('10000.00'),
            total_income=Decimal('5000.00'),
            total_expenses=Decimal('2000.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('13000.00'),
            created_by=self.user,
        )


class TestCurrentBalances(ReportsTestCase):
    """Tests for current balances endpoint."""

    def test_current_balances_success(self):
        """Test getting current balances for all currencies."""
        data = self.get('/api/reports/current-balances', **self.auth_headers())
        self.assertStatus(200)

        # PLN should have the latest balance (period2)
        self.assertEqual(data['balances']['PLN'], '13000.00')

        # USD should have balance from period1 (latest for USD)
        self.assertEqual(data['balances']['USD'], '2500.00')

    def test_current_balances_empty_workspace(self):
        """Test current balances when workspace has no balances."""
        # Delete all balances for the current workspace
        PeriodBalance.objects.filter(budget_period__budget_account__workspace=self.workspace).delete()

        data = self.get('/api/reports/current-balances', **self.auth_headers())
        self.assertStatus(200)

        # All currencies should be 0
        self.assertEqual(data['balances']['PLN'], '0')
        self.assertEqual(data['balances']['USD'], '0')

    def test_current_balances_without_auth_fails(self):
        """Test that getting current balances without authentication fails."""
        self.get('/api/reports/current-balances')
        self.assertStatus(401)

    def test_current_balances_returns_latest_by_date(self):
        """Test that current balances returns the latest period balance for each currency."""
        PeriodBalance.objects.create(
            budget_period=self.period2,
            workspace=self.workspace,
            currency=self.usd,
            opening_balance=Decimal('2000.00'),
            total_income=Decimal('1000.00'),
            total_expenses=Decimal('300.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('2700.00'),
            created_by=self.user,
        )

        data = self.get('/api/reports/current-balances', **self.auth_headers())
        self.assertStatus(200)

        # Should return the period2 balance for USD (latest)
        self.assertEqual(data['balances']['USD'], '2700.00')
