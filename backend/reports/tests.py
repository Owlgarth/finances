"""Tests for reports API endpoints."""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from budgets.models import Budget
from categories.models import Category
from common.tests.mixins import APIClientMixin, AuthMixin
from period_balances.models import PeriodBalance
from transactions.models import Transaction
from workspaces.models import Workspace, WorkspaceMember

User = get_user_model()


# =============================================================================
# Base Test Case
# =============================================================================


class ReportsTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base test case for reports tests with common setup."""

    def setUp(self):
        """Set up authenticated user and create test data."""
        super().setUp()

        # Create budget period
        self.period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            weeks=5,
            created_by=self.user,
        )

        # Create another period for testing "current balances"
        self.period2 = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='February 2025',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 28),
            weeks=4,
            created_by=self.user,
        )

        # Create categories
        self.category1 = Category.objects.create(
            budget_period=self.period,
            name='Groceries',
            created_by=self.user,
        )

        self.category2 = Category.objects.create(
            budget_period=self.period,
            name='Transport',
            created_by=self.user,
        )

        self.category3 = Category.objects.create(
            budget_period=self.period,
            name='Entertainment',
            created_by=self.user,
        )

        # Create budgets
        Budget.objects.create(
            budget_period=self.period,
            category=self.category1,
            currency='PLN',
            amount=Decimal('1000.00'),
            created_by=self.user,
        )

        Budget.objects.create(
            budget_period=self.period,
            category=self.category2,
            currency='PLN',
            amount=Decimal('500.00'),
            created_by=self.user,
        )

        Budget.objects.create(
            budget_period=self.period,
            category=self.category3,
            currency='USD',
            amount=Decimal('200.00'),
            created_by=self.user,
        )

        # Create period balances
        PeriodBalance.objects.create(
            budget_period=self.period,
            currency='PLN',
            opening_balance=Decimal('5000.00'),
            total_income=Decimal('8000.00'),
            total_expenses=Decimal('3000.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('10000.00'),
            created_by=self.user,
        )

        PeriodBalance.objects.create(
            budget_period=self.period,
            currency='USD',
            opening_balance=Decimal('1000.00'),
            total_income=Decimal('2000.00'),
            total_expenses=Decimal('500.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('2500.00'),
            created_by=self.user,
        )

        PeriodBalance.objects.create(
            budget_period=self.period2,
            currency='PLN',
            opening_balance=Decimal('10000.00'),
            total_income=Decimal('5000.00'),
            total_expenses=Decimal('2000.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('13000.00'),
            created_by=self.user,
        )


# =============================================================================
# Budget Summary Tests
# =============================================================================


class TestBudgetSummary(ReportsTestCase):
    """Tests for budget summary endpoint."""

    def test_budget_summary_success(self):
        """Test getting budget summary for a period."""
        data = self.get(f'/api/reports/budget-summary?budget_period_id={self.period.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['period']['id'], self.period.id)
        self.assertEqual(data['period']['name'], 'January 2025')
        self.assertIn('PLN', data['currencies'])
        self.assertIn('USD', data['currencies'])

        # Check PLN currency summary
        pln_data = data['currencies']['PLN']
        self.assertEqual(pln_data['total_budget'], '1500.00')  # 1000 + 500
        self.assertEqual(len(pln_data['categories']), 2)

        # Check balances
        self.assertIn('PLN', data['balances'])
        self.assertEqual(data['balances']['PLN']['opening'], '5000.00')
        self.assertEqual(data['balances']['PLN']['closing'], '10000.00')

    def test_budget_summary_with_actual_spending(self):
        """Test budget summary with actual transaction data."""
        # Create some transactions
        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 15),
            description='Grocery shopping',
            category=self.category1,
            amount=Decimal('250.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 10),
            description='Bus ticket',
            category=self.category2,
            amount=Decimal('50.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        data = self.get(f'/api/reports/budget-summary?budget_period_id={self.period.id}', **self.auth_headers())
        self.assertStatus(200)

        # Check that actual spending is included
        pln_data = data['currencies']['PLN']
        self.assertEqual(pln_data['total_actual'], '300.00')

        # Check category-level actual spending
        groceries = next(c for c in pln_data['categories'] if c['category'] == 'Groceries')
        self.assertEqual(groceries['actual'], '250.00')
        self.assertEqual(groceries['difference'], '750.00')

    def test_budget_summary_period_not_found(self):
        """Test budget summary with non-existent period."""
        data = self.get('/api/reports/budget-summary?budget_period_id=99999', **self.auth_headers())
        self.assertStatus(404)

    def test_budget_summary_from_other_workspace_fails(self):
        """Test that getting summary from another workspace fails."""
        other_workspace = Workspace.objects.create(name='Other Workspace')
        other_user = User.objects.create_user(
            email='other@example.com',
            password='otherpass123',
            current_workspace=other_workspace,
        )
        other_workspace.owner = other_user
        other_workspace.save()

        WorkspaceMember.objects.create(
            workspace=other_workspace,
            user=other_user,
            role='owner',
        )

        other_account = BudgetAccount.objects.create(
            workspace=other_workspace,
            name='Other Account',
            default_currency='PLN',
            created_by=other_user,
        )

        other_period = BudgetPeriod.objects.create(
            budget_account=other_account,
            name='Other Period',
            start_date=date(2025, 4, 1),
            end_date=date(2025, 4, 30),
            created_by=other_user,
        )

        data = self.get(f'/api/reports/budget-summary?budget_period_id={other_period.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_budget_summary_without_auth_fails(self):
        """Test that getting budget summary without authentication fails."""
        data = self.get(f'/api/reports/budget-summary?budget_period_id={self.period.id}')
        self.assertStatus(401)


# =============================================================================
# Current Balances Tests
# =============================================================================


class TestCurrentBalances(ReportsTestCase):
    """Tests for current balances endpoint."""

    def test_current_balances_success(self):
        """Test getting current balances for all currencies."""
        data = self.get('/api/reports/current-balances', **self.auth_headers())
        self.assertStatus(200)

        # PLN should have the latest balance (period2)
        self.assertEqual(data['PLN'], '13000.00')

        # USD should have balance from period1 (latest for USD)
        self.assertEqual(data['USD'], '2500.00')

        # EUR and UAH should be 0 (no balances)
        self.assertEqual(data['EUR'], '0')
        self.assertEqual(data['UAH'], '0')

    def test_current_balances_empty_workspace(self):
        """Test current balances when workspace has no balances."""
        # Delete all balances for the current workspace
        PeriodBalance.objects.filter(budget_period__budget_account__workspace=self.workspace).delete()

        data = self.get('/api/reports/current-balances', **self.auth_headers())
        self.assertStatus(200)

        # All currencies should be 0
        self.assertEqual(data['PLN'], '0')
        self.assertEqual(data['USD'], '0')
        self.assertEqual(data['EUR'], '0')
        self.assertEqual(data['UAH'], '0')

    def test_current_balances_without_auth_fails(self):
        """Test that getting current balances without authentication fails."""
        data = self.get('/api/reports/current-balances')
        self.assertStatus(401)

    def test_current_balances_returns_latest_by_date(self):
        """Test that current balances returns the latest period balance for each currency."""
        # Add a new USD balance to period2 (later than period1)
        PeriodBalance.objects.create(
            budget_period=self.period2,
            currency='USD',
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
        self.assertEqual(data['USD'], '2700.00')
