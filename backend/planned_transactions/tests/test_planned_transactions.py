"""Tests for planned_transactions API endpoints."""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.factories import BudgetPeriodFactory
from categories.factories import CategoryFactory
from common.enums import TotalsLabel
from common.tests.helpers import create_other_workspace
from common.tests.mixins import APIClientMixin, AuthMixin
from period_balances.factories import PeriodBalanceFactory
from period_balances.models import PeriodBalance
from planned_transactions.factories import PlannedTransactionFactory
from planned_transactions.models import PlannedTransaction
from planned_transactions.services import PlannedTransactionService
from planned_transactions.tasks import execute_planned_transaction
from transactions.models import Transaction
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.models import WorkspaceMember

User = get_user_model()


# =============================================================================
# Base Test Class
# =============================================================================


class PlannedTransactionTestCase(APIClientMixin, AuthMixin, TestCase):
    """Base test case for planned transaction tests with authenticated user and data."""

    def setUp(self):
        """Set up test data for planned transaction API tests."""
        APIClientMixin.setUp(self)
        AuthMixin.setUp(self)
        self.currencies = {c.symbol: c for c in self.workspace.currencies.all()}

        # Get or create the general budget account
        self.account = BudgetAccount.objects.filter(workspace=self.workspace, name='General').first()

        # Create budget periods
        self.period1 = BudgetPeriodFactory(
            budget_account=self.account,
            workspace=self.workspace,
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            weeks=5,
            created_by=self.user,
        )

        self.period2 = BudgetPeriodFactory(
            budget_account=self.account,
            workspace=self.workspace,
            name='February 2025',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 28),
            weeks=4,
            created_by=self.user,
        )

        # Create categories
        self.category1 = CategoryFactory(
            budget_period=self.period1,
            workspace=self.workspace,
            name='Groceries',
            created_by=self.user,
        )

        self.category2 = CategoryFactory(
            budget_period=self.period1,
            workspace=self.workspace,
            name='Rent',
            created_by=self.user,
        )

        # Create period balances for testing
        PeriodBalanceFactory(
            workspace=self.workspace,
            budget_period=self.period1,
            currency=self.currencies['USD'],
            opening_balance=Decimal('1000.00'),
            total_income=0,
            total_expenses=0,
            exchanges_in=0,
            exchanges_out=0,
            closing_balance=Decimal('1000.00'),
        )
        PeriodBalanceFactory(
            workspace=self.workspace,
            budget_period=self.period1,
            currency=self.currencies['EUR'],
            opening_balance=Decimal('500.00'),
            total_income=0,
            total_expenses=0,
            exchanges_in=0,
            exchanges_out=0,
            closing_balance=Decimal('500.00'),
        )

        # Create some test planned transactions
        self.planned1 = PlannedTransactionFactory(
            workspace=self.workspace,
            budget_period=self.period1,
            name='Monthly Rent',
            amount=Decimal('1200.00'),
            currency=self.currencies['USD'],
            category=self.category2,
            planned_date=date(2025, 1, 5),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )

        self.planned2 = PlannedTransactionFactory(
            workspace=self.workspace,
            budget_period=self.period1,
            name='Grocery Shopping',
            amount=Decimal('150.00'),
            currency=self.currencies['USD'],
            category=self.category1,
            planned_date=date(2025, 1, 15),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )

        self.planned3 = PlannedTransactionFactory(
            workspace=self.workspace,
            budget_period=self.period2,
            name='February Rent',
            amount=Decimal('1200.00'),
            currency=self.currencies['USD'],
            planned_date=date(2025, 2, 5),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )


# =============================================================================
# List Planned Transactions Tests
# =============================================================================


class TestListPlannedTransactions(PlannedTransactionTestCase):
    """Tests for GET /backend/planned-transactions."""

    def test_list_returns_all_planned_in_workspace(self):
        """Test listing all planned transactions in the workspace."""
        data = self.get('/api/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 3)  # All 3 planned transactions created in setUp

    def test_list_filtered_by_period(self):
        """Test listing planned transactions filtered by budget period."""
        data = self.get(f'/api/planned-transactions?budget_period_id={self.period1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 2)  # Only planned transactions in period1

        data = self.get(f'/api/planned-transactions?budget_period_id={self.period2.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 1)  # Only planned transaction in period2

    def test_list_filtered_by_status(self):
        """Test listing planned transactions filtered by status."""
        # Update one transaction to 'done' status
        self.planned1.status = 'done'
        self.planned1.save()

        data = self.get('/api/planned-transactions?status=pending', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 2)  # Only pending transactions

        data = self.get('/api/planned-transactions?status=done', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 1)  # Only done transactions

    def test_list_filtered_by_currency(self):
        """Test listing planned transactions filtered by currency."""
        # Update one planned transaction to use EUR
        self.planned1.currency = self.currencies['EUR']
        self.planned1.save()

        data = self.get('/api/planned-transactions?currency=EUR', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(data['items'][0]['id'], self.planned1.id)

        # Filter by USD should return the remaining two
        data = self.get('/api/planned-transactions?currency=USD', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 2)

        # Filter by multiple currencies
        data = self.get('/api/planned-transactions?currency=EUR&currency=USD', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 3)

    def test_list_ordered_by_planned_date(self):
        """Test that planned transactions are ordered by planned_date."""
        data = self.get('/api/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        # Check dates are in ascending order
        dates = [pt['planned_date'] for pt in data['items']]
        self.assertEqual(dates, sorted(dates))

    def test_list_default_ordering_is_planned_date_asc(self):
        """Omitting ordering defaults to planned_date ascending."""
        data = self.get('/api/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        ids = [pt['id'] for pt in data['items']]
        self.assertEqual(ids, [self.planned1.id, self.planned2.id, self.planned3.id])

    def test_list_ordered_by_planned_date_desc(self):
        """ordering=-planned_date returns planned transactions newest first."""
        data = self.get('/api/planned-transactions?ordering=-planned_date', **self.auth_headers())
        self.assertStatus(200)
        ids = [pt['id'] for pt in data['items']]
        self.assertEqual(ids, [self.planned3.id, self.planned2.id, self.planned1.id])

    def test_list_ordered_by_name_asc(self):
        """ordering=name sorts by name ascending."""
        data = self.get('/api/planned-transactions?ordering=name', **self.auth_headers())
        self.assertStatus(200)
        names = [pt['name'] for pt in data['items']]
        self.assertEqual(names, ['February Rent', 'Grocery Shopping', 'Monthly Rent'])

    def test_list_ordered_by_name_desc(self):
        """ordering=-name sorts by name descending."""
        data = self.get('/api/planned-transactions?ordering=-name', **self.auth_headers())
        self.assertStatus(200)
        names = [pt['name'] for pt in data['items']]
        self.assertEqual(names, ['Monthly Rent', 'Grocery Shopping', 'February Rent'])

    def test_list_ordered_by_amount_asc_applies_id_tiebreaker(self):
        """ordering=amount sorts ascending; equal amounts broken by -id."""
        data = self.get('/api/planned-transactions?ordering=amount', **self.auth_headers())
        self.assertStatus(200)
        ids = [pt['id'] for pt in data['items']]
        # 150 (planned2) first, then 1200 tie broken by -id: planned3 before planned1.
        self.assertEqual(ids, [self.planned2.id, self.planned3.id, self.planned1.id])

    def test_list_ordered_by_amount_desc(self):
        """ordering=-amount sorts descending; ties broken by -id."""
        data = self.get('/api/planned-transactions?ordering=-amount', **self.auth_headers())
        self.assertStatus(200)
        ids = [pt['id'] for pt in data['items']]
        self.assertEqual(ids, [self.planned3.id, self.planned1.id, self.planned2.id])

    def test_list_ordered_by_status_asc(self):
        """ordering=status sorts by status ascending."""
        self.planned1.status = 'done'
        self.planned1.save()
        data = self.get('/api/planned-transactions?ordering=status', **self.auth_headers())
        self.assertStatus(200)
        statuses = [pt['status'] for pt in data['items']]
        self.assertEqual(statuses, ['done', 'pending', 'pending'])
        ids = [pt['id'] for pt in data['items']]
        self.assertEqual(ids, [self.planned1.id, self.planned3.id, self.planned2.id])

    def test_list_ordered_by_status_desc(self):
        """ordering=-status sorts by status descending."""
        self.planned1.status = 'done'
        self.planned1.save()
        data = self.get('/api/planned-transactions?ordering=-status', **self.auth_headers())
        self.assertStatus(200)
        statuses = [pt['status'] for pt in data['items']]
        self.assertEqual(statuses, ['pending', 'pending', 'done'])
        ids = [pt['id'] for pt in data['items']]
        self.assertEqual(ids, [self.planned3.id, self.planned2.id, self.planned1.id])

    def test_list_ordered_by_category_name_asc(self):
        """ordering=category__name sorts by category name ascending."""
        utilities = CategoryFactory(
            budget_period=self.period2,
            workspace=self.workspace,
            name='Utilities',
            created_by=self.user,
        )
        self.planned3.category = utilities
        self.planned3.save()
        data = self.get('/api/planned-transactions?ordering=category__name', **self.auth_headers())
        self.assertStatus(200)
        category_names = [pt['category']['name'] for pt in data['items']]
        self.assertEqual(category_names, ['Groceries', 'Rent', 'Utilities'])

    def test_list_ordered_by_category_name_desc(self):
        """ordering=-category__name sorts by category name descending."""
        utilities = CategoryFactory(
            budget_period=self.period2,
            workspace=self.workspace,
            name='Utilities',
            created_by=self.user,
        )
        self.planned3.category = utilities
        self.planned3.save()
        data = self.get('/api/planned-transactions?ordering=-category__name', **self.auth_headers())
        self.assertStatus(200)
        category_names = [pt['category']['name'] for pt in data['items']]
        self.assertEqual(category_names, ['Utilities', 'Rent', 'Groceries'])

    def test_list_ordered_by_currency_symbol_asc(self):
        """ordering=currency__symbol sorts by currency ascending."""
        self.planned1.currency = self.currencies['EUR']
        self.planned1.save()
        data = self.get('/api/planned-transactions?ordering=currency__symbol', **self.auth_headers())
        self.assertStatus(200)
        symbols = [pt['currency'] for pt in data['items']]
        self.assertEqual(symbols, ['EUR', 'USD', 'USD'])
        ids = [pt['id'] for pt in data['items']]
        self.assertEqual(ids, [self.planned1.id, self.planned3.id, self.planned2.id])

    def test_list_ordered_by_currency_symbol_desc(self):
        """ordering=-currency__symbol sorts by currency descending."""
        self.planned1.currency = self.currencies['EUR']
        self.planned1.save()
        data = self.get('/api/planned-transactions?ordering=-currency__symbol', **self.auth_headers())
        self.assertStatus(200)
        symbols = [pt['currency'] for pt in data['items']]
        self.assertEqual(symbols, ['USD', 'USD', 'EUR'])
        ids = [pt['id'] for pt in data['items']]
        self.assertEqual(ids, [self.planned3.id, self.planned2.id, self.planned1.id])

    def test_list_invalid_ordering_returns_422(self):
        """Ordering values outside the allowlist are rejected by the regex pattern."""
        self.get('/api/planned-transactions?ordering=invalid_field', **self.auth_headers())
        self.assertStatus(422)

    def test_list_without_auth_returns_401(self):
        """Test that listing planned transactions without authentication fails."""
        self.get('/api/planned-transactions')
        self.assertStatus(401)


# =============================================================================
# Get Planned Transaction Tests
# =============================================================================


class TestGetPlannedTransaction(PlannedTransactionTestCase):
    """Tests for GET /backend/planned-transactions/{id}."""

    def test_get_planned_success(self):
        """Test getting a specific planned transaction."""
        data = self.get(f'/api/planned-transactions/{self.planned1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['id'], self.planned1.id)
        self.assertEqual(data['name'], 'Monthly Rent')
        self.assertEqual(str(data['amount']), '1200.00')

    def test_get_planned_not_found(self):
        """Test getting non-existent planned transaction returns 404."""
        self.get('/api/planned-transactions/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_get_planned_without_auth_fails(self):
        """Test that getting a planned transaction without authentication fails."""
        self.get(f'/api/planned-transactions/{self.planned1.id}')
        self.assertStatus(401)


# =============================================================================
# Create Planned Transaction Tests
# =============================================================================


class TestCreatePlannedTransaction(PlannedTransactionTestCase):
    """Tests for POST /backend/planned-transactions."""

    def test_create_planned_success(self):
        """Test creating a new planned transaction."""
        initial_count = PlannedTransaction.objects.count()

        payload = {
            'name': 'Electric Bill',
            'amount': '150.00',
            'currency': 'USD',
            'category_id': self.category1.id,
            'planned_date': '2025-01-25',
            'status': 'pending',
        }
        data = self.post('/api/planned-transactions', payload, **self.auth_headers())

        self.assertStatus(201)
        self.assertEqual(data['name'], 'Electric Bill')
        self.assertEqual(str(data['amount']), '150.00')
        self.assertEqual(data['budget_period_id'], self.period1.id)

        # Verify planned transaction was created
        self.assertEqual(PlannedTransaction.objects.count(), initial_count + 1)

    def test_create_planned_with_budget_period_id(self):
        """Test creating a planned transaction with explicit budget period."""
        payload = {
            'name': 'Internet Bill',
            'amount': '80.00',
            'currency': 'USD',
            'budget_period_id': self.period1.id,
            'planned_date': '2025-01-20',
        }
        data = self.post('/api/planned-transactions', payload, **self.auth_headers())

        self.assertStatus(201)
        self.assertEqual(data['budget_period_id'], self.period1.id)

    def test_create_planned_auto_assigns_period(self):
        """Test that planned transaction is auto-assigned to period based on date."""
        payload = {
            'name': 'February Bill',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-02-10',
        }
        data = self.post('/api/planned-transactions', payload, **self.auth_headers())

        self.assertStatus(201)
        self.assertEqual(data['budget_period_id'], self.period2.id)

    def test_create_planned_with_date_outside_period_fails(self):
        """Test creating planned transaction with date outside any period fails."""
        # Date in March, but we only have Jan and Feb periods
        payload = {
            'name': 'March Bill',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-03-15',
        }
        self.post('/api/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_create_planned_with_invalid_category_fails(self):
        """Test that creating with category from different period fails."""
        # Create a category in period2
        category_period2 = CategoryFactory(
            budget_period=self.period2,
            workspace=self.workspace,
            name='Utilities',
            created_by=self.user,
        )

        payload = {
            'name': 'Gas Bill',
            'amount': '50.00',
            'currency': 'USD',
            'budget_period_id': self.period1.id,
            'category_id': category_period2.id,  # Category from period2
            'planned_date': '2025-01-20',
        }
        self.post('/api/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_create_planned_with_zero_amount_fails(self):
        """Test that creating planned transaction with zero amount fails."""
        payload = {
            'name': 'Zero Bill',
            'amount': '0.00',  # Zero amount
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        self.post('/api/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(422)  # Pydantic validation error

    def test_create_planned_without_auth_fails(self):
        """Test that creating planned transaction without authentication fails."""
        payload = {
            'name': 'Test Bill',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        self.post('/api/planned-transactions', payload)
        self.assertStatus(401)

    def test_create_as_viewer_fails(self):
        """Test that viewer role cannot create planned transactions."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        payload = {
            'name': 'Test Bill',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        self.post('/api/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(403)

    def test_create_as_member_succeeds(self):
        """Test that member role can create planned transactions."""
        # Change user to member
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'member'
        member.save()

        payload = {
            'name': 'Test Bill',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        self.post('/api/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(201)

    def test_create_planned_with_status_done_creates_transaction(self):
        """Test creating a planned transaction with status done triggers execution."""
        initial_transaction_count = Transaction.objects.count()
        initial_expenses = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD').total_expenses

        payload = {
            'name': 'Paid Bill',
            'amount': '200.00',
            'currency': 'USD',
            'category_id': self.category1.id,
            'planned_date': '2025-01-10',
            'status': 'done',
        }
        data = self.post('/api/planned-transactions', payload, **self.auth_headers())

        self.assertStatus(201)
        self.assertEqual(data['status'], 'done')
        self.assertEqual(data['payment_date'], '2025-01-10')
        self.assertIsNotNone(data['transaction_id'])
        self.assertEqual(Transaction.objects.count(), initial_transaction_count + 1)

        balance = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD')
        self.assertEqual(balance.total_expenses, initial_expenses + Decimal('200.00'))

        transaction = Transaction.objects.get(id=data['transaction_id'])
        self.assertEqual(transaction.description, 'Paid Bill')
        self.assertEqual(transaction.amount, Decimal('200.00'))
        self.assertEqual(transaction.type, 'expense')


# =============================================================================
# Update Planned Transaction Tests
# =============================================================================


class TestUpdatePlannedTransaction(PlannedTransactionTestCase):
    """Tests for PUT /backend/planned-transactions/{id}."""

    def test_update_planned_success(self):
        """Test updating an existing planned transaction."""
        payload = {
            'name': 'Updated Rent',
            'amount': '1300.00',
            'currency': 'USD',
            'category_id': self.category2.id,
            'planned_date': '2025-01-10',
            'status': 'pending',
        }
        data = self.put(f'/api/planned-transactions/{self.planned1.id}', payload, **self.auth_headers())

        self.assertStatus(200)
        self.assertEqual(data['name'], 'Updated Rent')
        self.assertEqual(str(data['amount']), '1300.00')

    def test_update_planned_not_found(self):
        """Test updating non-existent planned transaction returns 404."""
        payload = {
            'name': 'Test',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        self.put('/api/planned-transactions/99999', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_update_planned_without_auth_fails(self):
        """Test that updating planned transaction without authentication fails."""
        payload = {
            'name': 'Test',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        self.put(f'/api/planned-transactions/{self.planned1.id}', payload)
        self.assertStatus(401)

    def test_update_as_viewer_fails(self):
        """Test that viewer role cannot update planned transactions."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        payload = {
            'name': 'Test',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        self.put(f'/api/planned-transactions/{self.planned1.id}', payload, **self.auth_headers())
        self.assertStatus(403)

    def test_update_status_to_done_creates_transaction(self):
        """Test updating status to done triggers execution side effects."""
        initial_transaction_count = Transaction.objects.count()
        initial_expenses = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD').total_expenses

        payload = {
            'name': 'Monthly Rent',
            'amount': '1200.00',
            'currency': 'USD',
            'planned_date': '2025-01-05',
            'status': 'done',
        }
        data = self.put(f'/api/planned-transactions/{self.planned1.id}', payload, **self.auth_headers())

        self.assertStatus(200)
        self.assertEqual(data['status'], 'done')
        self.assertEqual(data['payment_date'], '2025-01-05')
        self.assertIsNotNone(data['transaction_id'])
        self.assertEqual(Transaction.objects.count(), initial_transaction_count + 1)

        balance = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD')
        self.assertEqual(balance.total_expenses, initial_expenses + Decimal('1200.00'))

    def test_update_cannot_revert_from_done(self):
        """Test that changing status from done to pending raises an error."""
        self.planned1.status = 'done'
        self.planned1.save()

        payload = {
            'name': 'Monthly Rent',
            'amount': '1200.00',
            'currency': 'USD',
            'planned_date': '2025-01-05',
            'status': 'pending',
        }
        self.put(f'/api/planned-transactions/{self.planned1.id}', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_update_done_transaction_keeping_done(self):
        """Test that updating a done planned transaction while keeping done status works."""
        self.planned1.status = 'done'
        self.planned1.save()

        payload = {
            'name': 'Updated Rent',
            'amount': '1300.00',
            'currency': 'USD',
            'planned_date': '2025-01-05',
            'status': 'done',
        }
        data = self.put(f'/api/planned-transactions/{self.planned1.id}', payload, **self.auth_headers())

        self.assertStatus(200)
        self.assertEqual(data['name'], 'Updated Rent')
        self.assertEqual(data['status'], 'done')


# =============================================================================
# Delete Planned Transaction Tests
# =============================================================================


class TestDeletePlannedTransaction(PlannedTransactionTestCase):
    """Tests for DELETE /backend/planned-transactions/{id}."""

    def test_delete_planned_success(self):
        """Test deleting a planned transaction."""
        planned_id = self.planned1.id
        initial_count = PlannedTransaction.objects.count()

        self.delete(f'/api/planned-transactions/{planned_id}', **self.auth_headers())
        self.assertStatus(204)

        # Verify planned transaction is deleted
        self.assertFalse(PlannedTransaction.objects.filter(id=planned_id).exists())
        self.assertEqual(PlannedTransaction.objects.count(), initial_count - 1)

    def test_delete_planned_not_found(self):
        """Test deleting non-existent planned transaction returns 404."""
        self.delete('/api/planned-transactions/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_planned_without_auth_fails(self):
        """Test that deleting planned transaction without authentication fails."""
        self.delete(f'/api/planned-transactions/{self.planned1.id}')
        self.assertStatus(401)

    def test_delete_as_viewer_fails(self):
        """Test that viewer role cannot delete planned transactions."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        self.delete(f'/api/planned-transactions/{self.planned1.id}', **self.auth_headers())
        self.assertStatus(403)


# =============================================================================
# Execute Planned Transaction Tests
# =============================================================================


class TestExecutePlannedTransaction(PlannedTransactionTestCase):
    """Tests for POST /backend/planned-transactions/{id}/execute."""

    def test_execute_planned_success(self):
        """Test executing a planned transaction creates an actual transaction."""
        initial_transaction_count = Transaction.objects.count()
        initial_expenses = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD').total_expenses

        data = self.post(
            f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05', {}, **self.auth_headers()
        )

        self.assertStatus(200)
        self.assertEqual(data['status'], 'done')
        self.assertEqual(data['payment_date'], '2025-01-05')
        self.assertIsNotNone(data['transaction_id'])

        # Verify transaction was created
        self.assertEqual(Transaction.objects.count(), initial_transaction_count + 1)

        # Verify balance was updated
        balance = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD')
        self.assertEqual(balance.total_expenses, initial_expenses + Decimal('1200.00'))

    def test_execute_planned_twice_fails(self):
        """Test that executing an already executed planned transaction fails."""
        # Execute once
        self.post(
            f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05', {}, **self.auth_headers()
        )

        # Try to execute again
        self.post(
            f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-06', {}, **self.auth_headers()
        )
        self.assertStatus(400)

    def test_execute_planned_with_invalid_payment_date_fails(self):
        """Test executing with payment date outside any period fails."""
        # Payment date in March, but we only have Jan and Feb periods
        self.post(
            f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-03-15', {}, **self.auth_headers()
        )
        self.assertStatus(400)

    def test_execute_planned_not_found(self):
        """Test executing non-existent planned transaction returns 404."""
        self.post('/api/planned-transactions/99999/execute?payment_date=2025-01-05', {}, **self.auth_headers())
        self.assertStatus(404)

    def test_execute_without_auth_fails(self):
        """Test that executing without authentication fails."""
        self.post(f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05', {})
        self.assertStatus(401)

    def test_execute_as_viewer_fails(self):
        """Test that viewer role cannot execute planned transactions."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        self.post(
            f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05', {}, **self.auth_headers()
        )
        self.assertStatus(403)


# =============================================================================
# Export Planned Transactions Tests
# =============================================================================


class TestExportPlannedTransactions(PlannedTransactionTestCase):
    """Tests for GET /backend/planned-transactions/export/."""

    def test_export_planned_success(self):
        """Test exporting planned transactions from a budget period."""
        response = self.client.get(
            f'/api/planned-transactions/export/?budget_period_id={self.period1.id}',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertIn('attachment', response['Content-Disposition'])

        # Parse JSON content
        import json

        data = json.loads(response.content)
        self.assertEqual(len(data), 2)  # 2 planned transactions in period1
        self.assertEqual(data[0]['name'], 'Monthly Rent')  # Ordered by planned_date

    def test_export_planned_with_status_filter(self):
        """Test exporting planned transactions filtered by status."""
        # Update one transaction to 'done' status
        self.planned1.status = 'done'
        self.planned1.save()

        response = self.client.get(
            f'/api/planned-transactions/export/?budget_period_id={self.period1.id}&status=done',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 200)

        import json

        data = json.loads(response.content)
        self.assertEqual(len(data), 1)  # Only 1 done transaction

    def test_export_planned_from_other_workspace_fails(self):
        """Test exporting planned transactions from another workspace returns 404."""
        # Create another workspace
        other_workspace, other_user, other_account, _ = create_other_workspace()

        other_period = BudgetPeriodFactory(
            budget_account=other_account,
            workspace=other_workspace,
            name='Other Period',
            start_date=date(2025, 4, 1),
            end_date=date(2025, 4, 30),
            created_by=other_user,
        )

        # Try to export with first user
        response = self.client.get(
            f'/api/planned-transactions/export/?budget_period_id={other_period.id}',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 404)

    def test_export_planned_without_auth_fails(self):
        """Test exporting without authentication fails."""
        response = self.client.get(
            f'/api/planned-transactions/export/?budget_period_id={self.period1.id}',
        )
        self.assertEqual(response.status_code, 401)


# =============================================================================
# Import Planned Transactions Tests
# =============================================================================


class TestImportPlannedTransactions(PlannedTransactionTestCase):
    """Tests for POST /backend/planned-transactions/import."""

    def test_import_planned_success(self):
        """Test importing planned transactions from a JSON file."""
        import json
        import tempfile

        import_data = [
            {
                'name': 'Water Bill',
                'amount': '50.00',
                'currency': 'USD',
                'category_name': 'Groceries',
                'planned_date': '2025-01-10',
            },
            {
                'name': 'Gas Bill',
                'amount': '75.00',
                'currency': 'USD',
                'category_name': 'Rent',
                'planned_date': '2025-01-12',
            },
        ]

        # Create a temporary JSON file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(import_data, f)
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    '/api/planned-transactions/import',
                    data={'file': file, 'budget_period_id': self.period1.id},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn('Successfully imported 2', data['message'])

        # Verify planned transactions were created
        self.assertEqual(
            PlannedTransaction.objects.filter(budget_period=self.period1).count(),
            4,  # 2 original + 2 imported
        )

    def test_import_planned_with_unknown_category(self):
        """Test importing with unknown category name."""
        import json
        import tempfile

        import_data = [
            {
                'name': 'Electric Bill',
                'amount': '100.00',
                'currency': 'USD',
                'category_name': 'Unknown Category',  # Doesn't exist
                'planned_date': '2025-01-10',
            },
        ]

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(import_data, f)
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    '/api/planned-transactions/import',
                    data={'file': file, 'budget_period_id': self.period1.id},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 201)
        # Should import without category
        data = response.json()
        self.assertIn('Successfully imported 1', data['message'])

    def test_import_planned_without_category(self):
        """Test importing planned transactions without category."""
        import json
        import tempfile

        import_data = [
            {
                'name': 'Misc Bill',
                'amount': '25.00',
                'currency': 'USD',
                'planned_date': '2025-01-10',
            },
        ]

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(import_data, f)
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    '/api/planned-transactions/import',
                    data={'file': file, 'budget_period_id': self.period1.id},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 201)

    def test_import_planned_invalid_json_fails(self):
        """Test importing with invalid JSON fails."""
        import tempfile

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write('invalid json')
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    '/api/planned-transactions/import',
                    data={'file': file, 'budget_period_id': self.period1.id},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 400)

    def test_import_planned_invalid_binary_file_returns_400(self):
        """A non-JSON / non-UTF-8 upload returns 400, not 500 (UnicodeDecodeError is caught)."""
        import tempfile

        # A PNG header is not valid UTF-8, so json.loads() raises UnicodeDecodeError
        # (a ValueError, not a json.JSONDecodeError) which must be caught as a 400.
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.json', delete=False) as f:
            f.write(b'\x89PNG\r\n\x1a\n')
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    '/api/planned-transactions/import',
                    data={'file': file, 'budget_period_id': self.period1.id},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['detail'], 'Invalid JSON file.')

    def test_import_planned_invalid_data_fails(self):
        """Test importing with invalid data format fails."""
        import json
        import tempfile

        import_data = [
            {
                'name': 'Test Bill',
                'amount': 'invalid',  # Invalid amount
                'currency': 'USD',
                'planned_date': '2025-01-10',
            },
        ]

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(import_data, f)
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    '/api/planned-transactions/import',
                    data={'file': file, 'budget_period_id': self.period1.id},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 400)

    def test_import_planned_without_auth_fails(self):
        """Test importing without authentication fails."""
        import tempfile

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write('[]')
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    '/api/planned-transactions/import',
                    data={'file': file, 'budget_period_id': self.period1.id},
                )

        self.assertEqual(response.status_code, 401)

    def test_import_as_viewer_fails(self):
        """Test that viewer role cannot import planned transactions."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        import json
        import tempfile

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump([], f)
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    '/api/planned-transactions/import',
                    data={'file': file, 'budget_period_id': self.period1.id},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 403)


# =============================================================================
# Pagination Tests
# =============================================================================


class TestPlannedTransactionPagination(PlannedTransactionTestCase):
    """Tests for planned transaction list pagination."""

    def _create_planned_transactions(self, count):
        """Create the given number of planned transactions in period1."""
        for i in range(count):
            PlannedTransactionFactory(
                workspace=self.workspace,
                budget_period=self.period1,
                name=f'Planned {i}',
                amount=Decimal('50.00'),
                currency=self.currencies['USD'],
                planned_date=date(2025, 1, i % 28 + 1),
                status='pending',
                created_by=self.user,
                updated_by=self.user,
            )

    def test_default_pagination(self):
        """Default page_size=25, page=1."""
        self._create_planned_transactions(35)
        data = self.get('/api/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 25)
        self.assertEqual(data['total'], 38)  # 35 new + 3 from setUp
        self.assertEqual(data['page'], 1)
        self.assertEqual(data['page_size'], 25)
        self.assertEqual(data['total_pages'], 2)

    def test_custom_page_size(self):
        """page_size=25 returns 25 items."""
        self._create_planned_transactions(30)
        data = self.get('/api/planned-transactions?page_size=25', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 25)
        self.assertEqual(data['total'], 33)  # 30 new + 3 from setUp
        self.assertEqual(data['total_pages'], 2)

    def test_second_page(self):
        """page=2 returns correct slice."""
        self._create_planned_transactions(30)
        data = self.get('/api/planned-transactions?page=2&page_size=25', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 8)  # 33 total - 25 = 8
        self.assertEqual(data['page'], 2)

    def test_over_page_returns_empty(self):
        """Requesting page beyond total_pages returns empty items."""
        data = self.get('/api/planned-transactions?page=999&page_size=25', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 0)
        self.assertEqual(data['total'], 3)  # 3 from setUp

    def test_invalid_page_size_defaults(self):
        """Invalid page_size value falls back to default 25."""
        data = self.get('/api/planned-transactions?page_size=999', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['page_size'], 25)
        self.assertEqual(len(data['items']), 3)  # 3 from setUp, fits in page 1

    def test_zero_total_when_no_records(self):
        """Empty result returns total=0, total_pages=0 when workspace has no records."""
        # Delete the 3 records from setUp
        PlannedTransaction.objects.filter(workspace=self.workspace).delete()
        data = self.get('/api/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['items'], [])
        self.assertEqual(data['total'], 0)
        self.assertEqual(data['total_pages'], 0)


# =============================================================================
# Planned Transaction Totals Tests
# =============================================================================


class TestPlannedTransactionTotals(PlannedTransactionTestCase):
    """Tests for GET /api/planned-transactions/totals."""

    def test_totals_no_filters(self):
        """Test totals returns aggregated amounts grouped by currency."""
        data = self.get('/api/planned-transactions/totals', **self.auth_headers())
        self.assertStatus(200)
        self.assertIn('totals', data)
        totals = data['totals']
        # All 3 planned transactions use USD (1200 + 150 + 1200 = 2550)
        self.assertEqual(len(totals), 1)
        self.assertEqual(totals[0]['group'], 'USD')
        self.assertEqual(totals[0]['currency'], 'USD')
        self.assertEqual(Decimal(totals[0]['total']), Decimal('2550.00'))

    def test_totals_status_filter(self):
        """Test totals filtered by status."""
        self.planned1.status = 'done'
        self.planned1.save()

        data = self.get('/api/planned-transactions/totals?status=done', **self.auth_headers())
        self.assertStatus(200)
        totals = data['totals']
        self.assertEqual(len(totals), 1)
        self.assertEqual(totals[0]['group'], 'USD')
        self.assertEqual(Decimal(totals[0]['total']), Decimal('1200.00'))

    def test_totals_currency_filter(self):
        """Test totals filtered by currency."""
        # Change planned1 to EUR
        self.planned1.currency = self.currencies['EUR']
        self.planned1.save()

        data = self.get('/api/planned-transactions/totals?currency=USD', **self.auth_headers())
        self.assertStatus(200)
        totals = data['totals']
        self.assertEqual(len(totals), 1)
        self.assertEqual(totals[0]['group'], 'USD')
        self.assertEqual(totals[0]['currency'], 'USD')
        # Only planned2 (150) + planned3 (1200) = 1350 in USD
        self.assertEqual(Decimal(totals[0]['total']), Decimal('1350.00'))

    def test_totals_multiple_currencies(self):
        """Test totals with multiple currencies returns separate groups."""
        self.planned1.currency = self.currencies['EUR']
        self.planned1.save()

        data = self.get('/api/planned-transactions/totals', **self.auth_headers())
        self.assertStatus(200)
        totals = data['totals']
        self.assertEqual(len(totals), 2)

        # Find each currency group
        by_currency = {t['currency']: Decimal(t['total']) for t in totals}
        self.assertEqual(by_currency['EUR'], Decimal('1200.00'))
        self.assertEqual(by_currency['USD'], Decimal('1350.00'))

    def test_totals_budget_period_id_filter(self):
        """Test totals filtered by budget period."""
        data = self.get(f'/api/planned-transactions/totals?budget_period_id={self.period1.id}', **self.auth_headers())
        self.assertStatus(200)
        totals = data['totals']
        self.assertEqual(len(totals), 1)
        # Only planned1 (1200) + planned2 (150) = 1350 in period1
        self.assertEqual(Decimal(totals[0]['total']), Decimal('1350.00'))

    def test_totals_no_results(self):
        """Test totals returns empty list when no records match."""
        PlannedTransaction.objects.filter(workspace=self.workspace).delete()
        data = self.get('/api/planned-transactions/totals', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['totals'], [])

    def test_totals_cross_workspace_isolation(self):
        """Test that totals only include planned transactions from the user's workspace."""
        other_workspace = WorkspaceFactory(name='Other Workspace')
        other_user = User.objects.create_user(
            email='other@example.com',
            password='otherpass123',
            current_workspace=other_workspace,
        )
        WorkspaceMemberFactory(workspace=other_workspace, user=other_user, role='owner')

        other_account = BudgetAccount.objects.create(
            workspace=other_workspace,
            name='Other Account',
            default_currency=self.currencies['PLN'],
            created_by=other_user,
        )
        other_period = BudgetPeriodFactory(
            budget_account=other_account,
            workspace=other_workspace,
            name='Other Period',
            start_date=date(2025, 4, 1),
            end_date=date(2025, 4, 30),
            created_by=other_user,
        )

        # Create a planned transaction in other workspace
        PlannedTransactionFactory(
            workspace=other_workspace,
            budget_period=other_period,
            name='Other Planned',
            amount=Decimal('9999.00'),
            currency=self.currencies['USD'],
            planned_date=date(2025, 4, 10),
            status='pending',
            created_by=other_user,
            updated_by=other_user,
        )

        data = self.get('/api/planned-transactions/totals', **self.auth_headers())
        self.assertStatus(200)
        totals = data['totals']
        # Should only see the 3 planned transactions from the user's workspace
        self.assertEqual(len(totals), 1)
        self.assertEqual(Decimal(totals[0]['total']), Decimal('2550.00'))

    def test_totals_without_auth_returns_401(self):
        """Test that totals endpoint requires authentication."""
        self.get('/api/planned-transactions/totals')
        self.assertStatus(401)

    def test_totals_combined_filters(self):
        """Test totals with multiple filters applied together."""
        # planned1: USD, pending, period1, amount=1200
        # planned2: USD, pending, period1, amount=150
        # planned3: USD, pending, period2, amount=1200

        # Change planned2 to done
        self.planned2.status = 'done'
        self.planned2.save()

        # Filter: status=pending, budget_period_id=period1
        data = self.get(
            f'/api/planned-transactions/totals?status=pending&budget_period_id={self.period1.id}',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        totals = data['totals']
        self.assertEqual(len(totals), 1)
        # Only planned1 (1200) matches pending + period1
        self.assertEqual(Decimal(totals[0]['total']), Decimal('1200.00'))

    def test_totals_group_by_category(self):
        """Test totals grouped by category."""
        data = self.get(
            f'/api/planned-transactions/totals?group_by=category&budget_period_id={self.period1.id}',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        totals = data['totals']
        self.assertEqual(len(totals), 2)

        by_group = {t['group']: Decimal(t['total']) for t in totals}
        # planned1 (Rent): 1200, planned2 (Groceries): 150
        self.assertEqual(by_group['Groceries'], Decimal('150.00'))
        self.assertEqual(by_group['Rent'], Decimal('1200.00'))
        for t in totals:
            self.assertEqual(t['currency'], 'USD')

    def test_totals_group_by_category_uncategorized(self):
        """Test totals grouped by category with uncategorized transactions."""
        # planned3 has no category
        data = self.get(
            '/api/planned-transactions/totals?group_by=category',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        totals = data['totals']
        groups = [t['group'] for t in totals]
        self.assertIn(TotalsLabel.UNCATEGORIZED, groups)
        uncategorized = [t for t in totals if t['group'] == TotalsLabel.UNCATEGORIZED][0]
        self.assertEqual(Decimal(uncategorized['total']), Decimal('1200.00'))

    def test_totals_group_by_category_cross_workspace(self):
        """Test that category totals only include planned transactions from the user's workspace."""
        other_workspace = WorkspaceFactory(name='Other Workspace')
        other_user = User.objects.create_user(
            email='other2@example.com',
            password='otherpass123',
            current_workspace=other_workspace,
        )
        WorkspaceMemberFactory(workspace=other_workspace, user=other_user, role='owner')

        other_account = BudgetAccount.objects.create(
            workspace=other_workspace,
            name='Other Account',
            default_currency=self.currencies['PLN'],
            created_by=other_user,
        )
        other_period = BudgetPeriodFactory(
            budget_account=other_account,
            workspace=other_workspace,
            name='Other Period',
            start_date=date(2025, 4, 1),
            end_date=date(2025, 4, 30),
            created_by=other_user,
        )

        other_category = CategoryFactory(
            budget_period=other_period,
            workspace=other_workspace,
            name='Secret Category',
            created_by=other_user,
        )

        PlannedTransactionFactory(
            workspace=other_workspace,
            budget_period=other_period,
            name='Other Planned',
            amount=Decimal('9999.00'),
            currency=self.currencies['USD'],
            category=other_category,
            planned_date=date(2025, 4, 10),
            status='pending',
            created_by=other_user,
            updated_by=other_user,
        )

        data = self.get('/api/planned-transactions/totals?group_by=category', **self.auth_headers())
        self.assertStatus(200)
        totals = data['totals']
        groups = [t['group'] for t in totals]
        self.assertNotIn('Secret Category', groups)


# =============================================================================
# Date Range Filter Tests
# =============================================================================


class TestPlannedTransactionDateRangeFilter(PlannedTransactionTestCase):
    """Tests for start_date / end_date query params on list and totals endpoints."""

    def test_list_filtered_by_start_date(self):
        """Test listing planned transactions with start_date filter."""
        data = self.get('/api/planned-transactions?start_date=2025-01-15', **self.auth_headers())
        self.assertStatus(200)
        items = data['items']
        # planned1: 2025-01-05, planned2: 2025-01-15, planned3: 2025-02-05
        # start_date=2025-01-15 includes planned2 (15th) and planned3 (Feb 5th)
        self.assertEqual(len(items), 2)
        for item in items:
            self.assertGreaterEqual(date.fromisoformat(item['planned_date']), date(2025, 1, 15))

    def test_list_filtered_by_end_date(self):
        """Test listing planned transactions with end_date filter."""
        data = self.get('/api/planned-transactions?end_date=2025-01-15', **self.auth_headers())
        self.assertStatus(200)
        items = data['items']
        # planned1: 2025-01-05, planned2: 2025-01-15, planned3: 2025-02-05
        # end_date=2025-01-15 includes planned1 (5th) and planned2 (15th)
        self.assertEqual(len(items), 2)
        for item in items:
            self.assertLessEqual(date.fromisoformat(item['planned_date']), date(2025, 1, 15))

    def test_list_filtered_by_date_range(self):
        """Test listing planned transactions with both start_date and end_date."""
        data = self.get(
            '/api/planned-transactions?start_date=2025-01-10&end_date=2025-01-20',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        items = data['items']
        # Only planned2 (2025-01-15) falls in the range
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['id'], self.planned2.id)

    def test_list_date_range_with_period_filter(self):
        """Test that date range filters combine correctly with budget_period_id filter."""
        data = self.get(
            f'/api/planned-transactions?budget_period_id={self.period1.id}&start_date=2025-01-10',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        items = data['items']
        # period1: planned1 (Jan 5), planned2 (Jan 15). start_date=Jan 10 excludes planned1.
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['id'], self.planned2.id)

    def test_list_date_range_returns_empty_when_no_match(self):
        """Test that date range returns empty when no planned transactions match."""
        data = self.get(
            '/api/planned-transactions?start_date=2025-03-01&end_date=2025-03-31',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['items'], [])
        self.assertEqual(data['total'], 0)

    def test_totals_filtered_by_start_date(self):
        """Test totals with start_date filter."""
        data = self.get('/api/planned-transactions/totals?start_date=2025-01-15', **self.auth_headers())
        self.assertStatus(200)
        totals = data['totals']
        # planned2 (150, Jan 15) + planned3 (1200, Feb 5) = 1350
        self.assertEqual(len(totals), 1)
        self.assertEqual(Decimal(totals[0]['total']), Decimal('1350.00'))

    def test_totals_filtered_by_end_date(self):
        """Test totals with end_date filter."""
        data = self.get('/api/planned-transactions/totals?end_date=2025-01-15', **self.auth_headers())
        self.assertStatus(200)
        totals = data['totals']
        # planned1 (1200, Jan 5) + planned2 (150, Jan 15) = 1350
        self.assertEqual(len(totals), 1)
        self.assertEqual(Decimal(totals[0]['total']), Decimal('1350.00'))

    def test_totals_filtered_by_date_range(self):
        """Test totals with both start_date and end_date filters."""
        data = self.get(
            '/api/planned-transactions/totals?start_date=2025-01-10&end_date=2025-01-20',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        totals = data['totals']
        # Only planned2 (150) falls in range
        self.assertEqual(len(totals), 1)
        self.assertEqual(Decimal(totals[0]['total']), Decimal('150.00'))


# =============================================================================
# Celery Task Tests
# =============================================================================


class TestExecutePlannedTransactionTask(PlannedTransactionTestCase):
    """Tests for the execute_planned_transaction Celery task."""

    def test_task_creates_transaction_and_updates_balance(self):
        """Test that the Celery task creates a Transaction and updates PeriodBalance."""
        initial_transaction_count = Transaction.objects.count()
        initial_expenses = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD').total_expenses

        # Set up the planned tx as the service would (status='done', payment_date set)
        self.planned1.status = 'done'
        self.planned1.payment_date = date(2025, 1, 5)
        self.planned1.save()

        execute_planned_transaction(self.planned1.id)

        # Verify Transaction was created
        self.assertEqual(Transaction.objects.count(), initial_transaction_count + 1)

        # Verify PeriodBalance was updated
        balance = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD')
        self.assertEqual(balance.total_expenses, initial_expenses + Decimal('1200.00'))

        # Verify the planned transaction has transaction_id set
        self.planned1.refresh_from_db()
        self.assertIsNotNone(self.planned1.transaction_id)

    def test_task_idempotent_on_duplicate_call(self):
        """Test that calling the task twice does not create duplicate Transactions."""
        # Set up the planned tx as the service would
        self.planned1.status = 'done'
        self.planned1.payment_date = date(2025, 1, 5)
        self.planned1.save()

        # Execute once
        execute_planned_transaction(self.planned1.id)
        transaction_count_after_first = Transaction.objects.count()

        # Execute again — should be a no-op due to idempotency guard
        execute_planned_transaction(self.planned1.id)

        # No additional Transaction should be created
        self.assertEqual(Transaction.objects.count(), transaction_count_after_first)

        # PeriodBalance should not double-count
        balance = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD')
        self.assertEqual(balance.total_expenses, Decimal('1200.00'))

    def test_task_handles_missing_planned_transaction_gracefully(self):
        """Test that the task logs and returns (no raise) for non-existent planned tx."""
        non_existent_id = 99999
        # Should not raise — the task must handle this gracefully to avoid infinite retries
        execute_planned_transaction(non_existent_id)
        # No Transaction should be created
        self.assertEqual(Transaction.objects.count(), 0)

    def test_task_raises_for_missing_budget_period(self):
        """Test that the task raises when no period covers the payment date (triggers retry)."""
        from planned_transactions.exceptions import PlannedTransactionNoActivePeriodError

        # Set payment_date to a date outside any period
        self.planned1.status = 'done'
        self.planned1.payment_date = date(2025, 12, 25)  # No period covers Dec 2025
        self.planned1.save()

        with self.assertRaises(PlannedTransactionNoActivePeriodError):
            execute_planned_transaction(self.planned1.id)

        # No Transaction should have been created
        self.assertEqual(Transaction.objects.count(), 0)

        # transaction_id should NOT be set (task failed before setting it)
        self.planned1.refresh_from_db()
        self.assertIsNone(self.planned1.transaction_id)


class TestExecutePlannedTransactionDispatch(PlannedTransactionTestCase):
    """Tests for PlannedTransactionService.execute dispatching to the Celery task.

    CELERY_TASK_ALWAYS_EAGER=True in test settings means execute_planned_transaction.delay()
    runs synchronously, so we can assert the task's side effects directly after the service call.
    """

    def test_execute_dispatches_task_and_creates_transaction(self):
        """Service.execute enqueues the task, which creates the Transaction."""
        initial_transaction_count = Transaction.objects.count()

        PlannedTransactionService.execute(
            user=self.user,
            workspace_id=self.workspace.id,
            planned_id=self.planned1.id,
            payment_date=date(2025, 1, 5),
        )

        # Task ran synchronously via CELERY_TASK_ALWAYS_EAGER — Transaction created
        self.assertEqual(Transaction.objects.count(), initial_transaction_count + 1)

        # Task's side effect on the planned record: status flipped + transaction_id set
        self.planned1.refresh_from_db()
        self.assertEqual(self.planned1.status, 'done')
        self.assertEqual(self.planned1.payment_date, date(2025, 1, 5))
        self.assertIsNotNone(self.planned1.transaction_id)

    def test_execute_dispatch_updates_period_balance(self):
        """The dispatched task updates PeriodBalance.total_expenses."""
        initial_expenses = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD').total_expenses

        PlannedTransactionService.execute(
            user=self.user,
            workspace_id=self.workspace.id,
            planned_id=self.planned1.id,
            payment_date=date(2025, 1, 5),
        )

        # planned1 is $1200 USD in period1; PeriodBalance.total_expenses must reflect it
        balance = PeriodBalance.objects.get(budget_period=self.period1, currency__symbol='USD')
        self.assertEqual(balance.total_expenses, initial_expenses + Decimal('1200.00'))

    def test_execute_returns_planned_with_transaction_id(self):
        """The returned PlannedTransaction reflects the task's writes (refresh_from_db in service)."""
        result = PlannedTransactionService.execute(
            user=self.user,
            workspace_id=self.workspace.id,
            planned_id=self.planned1.id,
            payment_date=date(2025, 1, 5),
        )

        # Service does refresh_from_db before returning, so result carries the task's mutation
        self.assertEqual(result.status, 'done')
        self.assertIsNotNone(result.transaction_id)


class TestExecutePlannedTransactionConfig(TestCase):
    """Tests for execute_planned_transaction retry configuration."""

    def test_task_has_autoretry_for_exception(self):
        self.assertIn(Exception, execute_planned_transaction.autoretry_for)

    def test_task_has_max_retries(self):
        self.assertEqual(execute_planned_transaction.max_retries, 3)

    def test_task_has_retry_backoff(self):
        self.assertTrue(execute_planned_transaction.retry_backoff)
