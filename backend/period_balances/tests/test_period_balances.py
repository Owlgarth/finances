"""Tests for period_balances API endpoints."""

from datetime import date
from decimal import Decimal

# Import User model at module level for use in tests
from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from common.tests.mixins import APIClientMixin, AuthMixin
from currency_exchanges.models import CurrencyExchange
from period_balances.models import PeriodBalance
from transactions.models import Transaction
from workspaces.models import Workspace, WorkspaceMember

User = get_user_model()


class PeriodBalancesTestCase(AuthMixin, APIClientMixin, TestCase):
    """Test cases for period_balances API endpoints."""

    def setUp(self):
        """Set up test data for period_balances API tests."""
        super().setUp()

        # Create an additional budget account for testing
        self.other_account = BudgetAccount.objects.create(
            workspace=self.workspace,
            name='Other Account',
            description='Another budget account',
            default_currency='USD',
            is_active=True,
            display_order=1,
            created_by=self.user,
        )

        # Create budget periods
        self.period1 = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            weeks=5,
            created_by=self.user,
        )

        self.period2 = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='February 2025',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 28),
            weeks=4,
            created_by=self.user,
        )

        self.other_period = BudgetPeriod.objects.create(
            budget_account=self.other_account,
            name='March 2025',
            start_date=date(2025, 3, 1),
            end_date=date(2025, 3, 31),
            weeks=5,
            created_by=self.user,
        )

        # Create period balances
        self.balance1_pln = PeriodBalance.objects.create(
            budget_period=self.period1,
            currency='PLN',
            opening_balance=Decimal('1000.00'),
            total_income=Decimal('5000.00'),
            total_expenses=Decimal('3000.00'),
            exchanges_in=Decimal('100.00'),
            exchanges_out=Decimal('50.00'),
            closing_balance=Decimal('3050.00'),
            created_by=self.user,
        )

        self.balance1_usd = PeriodBalance.objects.create(
            budget_period=self.period1,
            currency='USD',
            opening_balance=Decimal('500.00'),
            total_income=Decimal('2000.00'),
            total_expenses=Decimal('1500.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('100.00'),
            closing_balance=Decimal('900.00'),
            created_by=self.user,
        )

        self.balance2_pln = PeriodBalance.objects.create(
            budget_period=self.period2,
            currency='PLN',
            opening_balance=Decimal('3050.00'),
            total_income=Decimal('4000.00'),
            total_expenses=Decimal('3500.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('3550.00'),
            created_by=self.user,
        )

        self.other_balance = PeriodBalance.objects.create(
            budget_period=self.other_period,
            currency='EUR',
            opening_balance=Decimal('0'),
            total_income=Decimal('1000.00'),
            total_expenses=Decimal('800.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('200.00'),
            created_by=self.user,
        )

    # =============================================================================
    # List Balances Tests
    # =============================================================================

    def test_list_balances_returns_all_in_workspace(self):
        """Test listing all balances in the workspace."""
        data = self.get('/api/period-balances', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(
            len(data), 4
        )  # 4 balances in user's workspace (2 in period1 + 1 in period2 + 1 in other_period)

    def test_list_balances_filtered_by_period(self):
        """Test listing balances filtered by budget period."""
        data = self.get(f'/api/period-balances?budget_period_id={self.period1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)  # Only balances in period1

        data = self.get(f'/api/period-balances?budget_period_id={self.period2.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)  # Only balance in period2

    def test_list_balances_filtered_by_currency(self):
        """Test listing balances filtered by currency."""
        data = self.get('/api/period-balances?currency=PLN', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)  # 2 PLN balances

        data = self.get('/api/period-balances?currency=USD', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)  # 1 USD balance

    def test_list_balances_filtered_by_period_and_currency(self):
        """Test listing balances with both period and currency filters."""
        data = self.get(f'/api/period-balances?budget_period_id={self.period1.id}&currency=PLN', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['currency'], 'PLN')
        self.assertEqual(data[0]['budget_period_id'], self.period1.id)

    def test_list_balances_filter_no_results(self):
        """Test listing balances with filters that return no results."""
        data = self.get('/api/period-balances?currency=UAH', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 0)

    def test_list_balances_without_auth_returns_401(self):
        """Test that listing balances without authentication fails."""
        data = self.get('/api/period-balances')
        self.assertStatus(401)

    # =============================================================================
    # Get Balance Tests
    # =============================================================================

    def test_get_balance_by_id(self):
        """Test getting a specific balance by ID."""
        data = self.get(f'/api/period-balances/{self.balance1_pln.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['id'], self.balance1_pln.id)
        self.assertEqual(data['currency'], 'PLN')
        self.assertEqual(float(data['opening_balance']), 1000.00)

    def test_get_balance_not_found(self):
        """Test getting a balance that doesn't exist."""
        data = self.get('/api/period-balances/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_get_balance_from_other_workspace_fails(self):
        """Test that getting a balance from another workspace fails."""
        # Create another workspace with a period and balance
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

        other_balance = PeriodBalance.objects.create(
            budget_period=other_period,
            currency='PLN',
            opening_balance=Decimal('500.00'),
            total_income=Decimal('1000.00'),
            total_expenses=Decimal('800.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('700.00'),
            created_by=other_user,
        )

        data = self.get(f'/api/period-balances/{other_balance.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_get_balance_without_auth_fails(self):
        """Test that getting a balance without authentication fails."""
        data = self.get(f'/api/period-balances/{self.balance1_pln.id}')
        self.assertStatus(401)

    # =============================================================================
    # Update Balance Tests
    # =============================================================================

    def test_update_balance_opening_balance(self):
        """Test updating the opening balance of a period balance."""
        payload = {
            'opening_balance': '2000.00',
        }
        data = self.put(f'/api/period-balances/{self.balance1_pln.id}', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(float(data['opening_balance']), 2000.00)

        # Verify closing balance is recalculated
        # closing = opening + income + exchanges_in - expenses - exchanges_out
        # closing = 2000 + 5000 + 100 - 3000 - 50 = 4050
        expected_closing = 2000 + 5000 + 100 - 3000 - 50
        self.assertEqual(float(data['closing_balance']), float(expected_closing))

        # Verify in database
        self.balance1_pln.refresh_from_db()
        self.assertEqual(self.balance1_pln.opening_balance, Decimal('2000.00'))

    def test_update_balance_zero_opening_balance(self):
        """Test updating opening balance to zero."""
        payload = {
            'opening_balance': '0',
        }
        data = self.put(f'/api/period-balances/{self.balance1_pln.id}', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(float(data['opening_balance']), 0.00)

    def test_update_balance_not_found(self):
        """Test updating a balance that doesn't exist."""
        payload = {'opening_balance': '100.00'}
        data = self.put('/api/period-balances/99999', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_update_balance_without_auth_fails(self):
        """Test that updating a balance without authentication fails."""
        payload = {'opening_balance': '100.00'}
        data = self.put(f'/api/period-balances/{self.balance1_pln.id}', payload)
        self.assertStatus(401)

    # =============================================================================
    # Recalculate Balance Tests
    # =============================================================================

    def test_recalculate_balance_creates_new_balance(self):
        """Test recalculating creates balance if it doesn't exist."""
        # Create a new period with no balances
        new_period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='April 2025',
            start_date=date(2025, 4, 1),
            end_date=date(2025, 4, 30),
            created_by=self.user,
        )

        payload = {
            'budget_period_id': new_period.id,
            'currency': 'PLN',
        }
        data = self.post('/api/period-balances/recalculate', payload, **self.auth_headers())
        self.assertStatus(200)

        # Verify balance was created
        balance = PeriodBalance.objects.get(budget_period_id=new_period.id, currency='PLN')
        self.assertEqual(balance.currency, 'PLN')
        self.assertEqual(balance.budget_period_id, new_period.id)

    def test_recalculate_balance_with_transactions(self):
        """Test recalculation includes transaction totals."""
        # Create transactions for period1
        Transaction.objects.create(
            budget_period=self.period1,
            date=date(2025, 1, 15),
            description='Salary',
            amount=Decimal('5000.00'),
            currency='USD',
            type='income',
            created_by=self.user,
        )

        Transaction.objects.create(
            budget_period=self.period1,
            date=date(2025, 1, 20),
            description='Rent',
            amount=Decimal('2000.00'),
            currency='USD',
            type='expense',
            created_by=self.user,
        )

        payload = {
            'budget_period_id': self.period1.id,
            'currency': 'USD',
        }
        data = self.post('/api/period-balances/recalculate', payload, **self.auth_headers())
        self.assertStatus(200)

        # Verify totals match transaction sums (recalculate from scratch)
        self.assertEqual(float(data['total_income']), 5000.00)  # Only the new income transaction
        self.assertEqual(float(data['total_expenses']), 2000.00)  # Only the new expense transaction

    def test_recalculate_balance_with_exchanges(self):
        """Test recalculation includes currency exchange totals."""
        # Create currency exchanges for period1
        CurrencyExchange.objects.create(
            budget_period=self.period1,
            date=date(2025, 1, 10),
            description='Buy EUR',
            from_currency='PLN',
            from_amount=Decimal('500.00'),
            to_currency='EUR',
            to_amount=Decimal('100.00'),
            created_by=self.user,
        )

        CurrencyExchange.objects.create(
            budget_period=self.period1,
            date=date(2025, 1, 15),
            description='Buy PLN',
            from_currency='EUR',
            from_amount=Decimal('50.00'),
            to_currency='PLN',
            to_amount=Decimal('250.00'),
            created_by=self.user,
        )

        # Recalculate PLN balance
        payload_pln = {
            'budget_period_id': self.period1.id,
            'currency': 'PLN',
        }
        data_pln = self.post('/api/period-balances/recalculate', payload_pln, **self.auth_headers())
        self.assertStatus(200)
        # exchanges_out = 500 (only the new PLN->EUR exchange)
        self.assertEqual(float(data_pln['exchanges_out']), 500.00)

        # Recalculate EUR balance (should create new)
        payload_eur = {
            'budget_period_id': self.period1.id,
            'currency': 'EUR',
        }
        data_eur = self.post('/api/period-balances/recalculate', payload_eur, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(float(data_eur['exchanges_in']), 100.00)
        self.assertEqual(float(data_eur['exchanges_out']), 50.00)

    def test_recalculate_balance_uses_previous_period_closing(self):
        """Test recalculation uses previous period's closing as opening."""
        # Recalculate period2 (should use period1's closing as opening)
        payload = {
            'budget_period_id': self.period2.id,
            'currency': 'PLN',
        }

        # First, ensure period1 closing is correct
        self.balance1_pln.closing_balance = Decimal('4000.00')
        self.balance1_pln.save()

        # Set period2 opening balance to 0 so it will be updated
        self.balance2_pln.opening_balance = Decimal('0')
        self.balance2_pln.save()

        data = self.post('/api/period-balances/recalculate', payload, **self.auth_headers())
        self.assertStatus(200)

        # Opening balance should be from previous period's closing
        self.assertEqual(float(data['opening_balance']), 4000.00)

    def test_recalculate_balance_preserves_manual_opening_balance(self):
        """Test that recalculation preserves manually set opening balance."""
        # Set a non-zero opening balance manually
        self.balance2_pln.opening_balance = Decimal('5000.00')
        self.balance2_pln.save()

        payload = {
            'budget_period_id': self.period2.id,
            'currency': 'PLN',
        }
        data = self.post('/api/period-balances/recalculate', payload, **self.auth_headers())
        self.assertStatus(200)

        # Opening balance should be preserved (not overwritten)
        self.assertEqual(float(data['opening_balance']), 5000.00)

    def test_recalculate_balance_period_not_found(self):
        """Test recalculation with non-existent period."""
        payload = {
            'budget_period_id': 99999,
            'currency': 'PLN',
        }
        data = self.post('/api/period-balances/recalculate', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_recalculate_balance_without_auth_fails(self):
        """Test that recalculation without authentication fails."""
        payload = {
            'budget_period_id': self.period1.id,
            'currency': 'PLN',
        }
        data = self.post('/api/period-balances/recalculate', payload)
        self.assertStatus(401)

    # =============================================================================
    # Recalculate All Balances Tests
    # =============================================================================

    def test_recalculate_all_balances(self):
        """Test recalculation of all currency balances for a period."""
        payload = {
            'budget_period_id': self.period1.id,
        }
        data = self.post('/api/period-balances/recalculate-all', payload, **self.auth_headers())
        self.assertStatus(200)

        # Should return 4 currencies
        self.assertEqual(len(data), 4)

        currencies = {b['currency'] for b in data}
        self.assertEqual(currencies, {'PLN', 'USD', 'EUR', 'UAH'})

    def test_recalculate_all_creates_missing_balances(self):
        """Test recalculate-all creates balances for currencies that don't exist."""
        # period1 only has PLN and USD balances
        payload = {
            'budget_period_id': self.period1.id,
        }
        data = self.post('/api/period-balances/recalculate-all', payload, **self.auth_headers())
        self.assertStatus(200)

        # Verify EUR and UAH balances were created
        currencies = {b['currency'] for b in data}
        self.assertEqual(currencies, {'PLN', 'USD', 'EUR', 'UAH'})

        # Verify they exist in database
        self.assertTrue(
            PeriodBalance.objects.filter(
                budget_period_id=self.period1.id,
                currency='EUR',
            ).exists()
        )
        self.assertTrue(
            PeriodBalance.objects.filter(
                budget_period_id=self.period1.id,
                currency='UAH',
            ).exists()
        )

    def test_recalculate_all_period_not_found(self):
        """Test recalculate-all with non-existent period."""
        payload = {
            'budget_period_id': 99999,
        }
        data = self.post('/api/period-balances/recalculate-all', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_recalculate_all_without_auth_fails(self):
        """Test that recalculate-all without authentication fails."""
        payload = {
            'budget_period_id': self.period1.id,
        }
        data = self.post('/api/period-balances/recalculate-all', payload)
        self.assertStatus(401)
