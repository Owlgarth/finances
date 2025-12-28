"""Tests for transactions API endpoints."""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from categories.models import Category
from common.tests.mixins import APIClientMixin, AuthMixin
from period_balances.models import PeriodBalance
from transactions.models import Transaction
from workspaces.models import Workspace, WorkspaceMember

User = get_user_model()


# =============================================================================
# Base Test Case
# =============================================================================


class TransactionsTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base test case for transactions tests with common setup."""

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

        # Create another period
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


# =============================================================================
# List Transactions Tests
# =============================================================================


class TestListTransactions(TransactionsTestCase):
    """Tests for listing transactions."""

    def test_list_transactions_with_period_id(self):
        """Test listing transactions filtered by budget period."""
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

        data = self.get(f'/backend/transactions?budget_period_id={self.period.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)

    def test_list_transactions_with_current_date(self):
        """Test listing transactions using current_date to find period."""
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

        data = self.get('/backend/transactions?current_date=2025-01-15', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)

    def test_list_transactions_with_type_filter(self):
        """Test listing transactions filtered by type."""
        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 15),
            description='Salary',
            category=None,
            amount=Decimal('5000.00'),
            currency='PLN',
            type='income',
            created_by=self.user,
        )

        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 16),
            description='Groceries',
            category=self.category1,
            amount=Decimal('250.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        data = self.get(f'/backend/transactions?budget_period_id={self.period.id}&type=expense', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['type'], 'expense')

    def test_list_transactions_with_search(self):
        """Test listing transactions with search term."""
        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 15),
            description='Grocery shopping at Walmart',
            category=self.category1,
            amount=Decimal('250.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 16),
            description='Bus ticket',
            category=self.category2,
            amount=Decimal('50.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        data = self.get(f'/backend/transactions?budget_period_id={self.period.id}&search=grocery', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)
        self.assertIn('Grocery', data[0]['description'])

    def test_list_transactions_with_amount_filters(self):
        """Test listing transactions with amount range filters."""
        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 15),
            description='Small expense',
            category=self.category1,
            amount=Decimal('50.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 16),
            description='Large expense',
            category=self.category2,
            amount=Decimal('500.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        data = self.get(f'/backend/transactions?budget_period_id={self.period.id}&amount_gte=100', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['amount'], '500.00')

    def test_list_transactions_without_auth_fails(self):
        """Test that listing transactions without authentication fails."""
        data = self.get(f'/backend/transactions?budget_period_id={self.period.id}')
        self.assertStatus(401)


# =============================================================================
# Get Transaction Tests
# =============================================================================


class TestGetTransaction(TransactionsTestCase):
    """Tests for getting a specific transaction."""

    def test_get_transaction_by_id(self):
        """Test getting a transaction by ID."""
        trans = Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 15),
            description='Grocery shopping',
            category=self.category1,
            amount=Decimal('250.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        data = self.get(f'/backend/transactions/{trans.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['id'], trans.id)
        self.assertEqual(data['description'], 'Grocery shopping')

    def test_get_transaction_not_found(self):
        """Test getting a non-existent transaction."""
        data = self.get('/backend/transactions/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_get_transaction_from_other_workspace_fails(self):
        """Test that getting a transaction from another workspace fails."""
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

        other_trans = Transaction.objects.create(
            budget_period=other_period,
            date=date(2025, 4, 15),
            description='Other transaction',
            amount=Decimal('100.00'),
            currency='PLN',
            type='expense',
            created_by=other_user,
        )

        data = self.get(f'/backend/transactions/{other_trans.id}', **self.auth_headers())
        self.assertStatus(404)


# =============================================================================
# Create Transaction Tests
# =============================================================================


class TestCreateTransaction(TransactionsTestCase):
    """Tests for creating transactions."""

    def test_create_expense_transaction_success(self):
        """Test creating an expense transaction."""
        payload = {
            'date': '2025-01-15',
            'description': 'Grocery shopping',
            'category_id': self.category1.id,
            'amount': '250.00',
            'currency': 'PLN',
            'type': 'expense',
            'budget_period_id': self.period.id,
        }
        data = self.post('/backend/transactions', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['description'], 'Grocery shopping')
        self.assertEqual(data['amount'], '250.00')

        # Verify balance was updated
        balance = PeriodBalance.objects.get(budget_period=self.period, currency='PLN')
        self.assertEqual(balance.total_expenses, Decimal('3250.00'))  # 3000 + 250

    def test_create_income_transaction_success(self):
        """Test creating an income transaction."""
        payload = {
            'date': '2025-01-15',
            'description': 'Salary',
            'category_id': None,
            'amount': '5000.00',
            'currency': 'PLN',
            'type': 'income',
            'budget_period_id': self.period.id,
        }
        data = self.post('/backend/transactions', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['type'], 'income')

        # Verify balance was updated
        balance = PeriodBalance.objects.get(budget_period=self.period, currency='PLN')
        self.assertEqual(balance.total_income, Decimal('13000.00'))  # 8000 + 5000

    def test_create_transaction_auto_assign_period(self):
        """Test creating a transaction with auto-assigned period."""
        payload = {
            'date': '2025-01-15',
            'description': 'Grocery shopping',
            'category_id': self.category1.id,
            'amount': '100.00',
            'currency': 'PLN',
            'type': 'expense',
            'budget_period_id': None,  # Auto-assign
        }
        data = self.post('/backend/transactions', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['budget_period_id'], self.period.id)

    def test_create_income_with_category_is_ignored(self):
        """Test that creating an income transaction with a category ignores the category."""
        payload = {
            'date': '2025-01-15',
            'description': 'Salary',
            'category_id': self.category1.id,
            'amount': '5000.00',
            'currency': 'PLN',
            'type': 'income',
            'budget_period_id': self.period.id,
        }
        data = self.post('/backend/transactions', payload, **self.auth_headers())
        self.assertStatus(201)
        # Category should be ignored (set to None) for income transactions
        self.assertIsNone(data['category_id'])

    def test_create_transaction_without_auth_fails(self):
        """Test that creating a transaction without authentication fails."""
        payload = {
            'date': '2025-01-15',
            'description': 'Grocery shopping',
            'category_id': self.category1.id,
            'amount': '250.00',
            'currency': 'PLN',
            'type': 'expense',
            'budget_period_id': self.period.id,
        }
        data = self.post('/backend/transactions', payload)
        self.assertStatus(401)


# =============================================================================
# Update Transaction Tests
# =============================================================================


class TestUpdateTransaction(TransactionsTestCase):
    """Tests for updating transactions."""

    def test_update_transaction_success(self):
        """Test updating a transaction."""
        trans = Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 15),
            description='Grocery shopping',
            category=self.category1,
            amount=Decimal('250.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        payload = {
            'date': '2025-01-15',
            'description': 'Grocery shopping - Updated',
            'category_id': self.category1.id,
            'amount': '300.00',
            'currency': 'PLN',
            'type': 'expense',
            'budget_period_id': self.period.id,
        }
        data = self.put(f'/backend/transactions/{trans.id}', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['description'], 'Grocery shopping - Updated')
        self.assertEqual(data['amount'], '300.00')

    def test_update_transaction_not_found(self):
        """Test updating a non-existent transaction."""
        payload = {
            'date': '2025-01-15',
            'description': 'Test',
            'amount': '100.00',
            'currency': 'PLN',
            'type': 'expense',
        }
        data = self.put('/backend/transactions/99999', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_update_transaction_balance_reverted_and_applied(self):
        """Test that updating a transaction reverts old balance and applies new one."""
        # Create transaction through API (which updates balance)
        payload = {
            'date': '2025-01-15',
            'description': 'Grocery shopping',
            'category_id': self.category1.id,
            'amount': '250.00',
            'currency': 'PLN',
            'type': 'expense',
            'budget_period_id': self.period.id,
        }
        data = self.post('/backend/transactions', payload, **self.auth_headers())
        trans_id = data['id']

        # Get balance after creation
        balance = PeriodBalance.objects.get(budget_period=self.period, currency='PLN')
        self.assertEqual(balance.total_expenses, Decimal('3250.00'))  # 3000 + 250

        payload = {
            'date': '2025-01-15',
            'description': 'Grocery shopping',
            'category_id': self.category1.id,
            'amount': '400.00',
            'currency': 'PLN',
            'type': 'expense',
            'budget_period_id': self.period.id,
        }
        self.put(f'/backend/transactions/{trans_id}', payload, **self.auth_headers())

        # Verify balance was updated correctly
        balance.refresh_from_db()
        self.assertEqual(balance.total_expenses, Decimal('3400.00'))  # 3000 + 400


# =============================================================================
# Delete Transaction Tests
# =============================================================================


class TestDeleteTransaction(TransactionsTestCase):
    """Tests for deleting transactions."""

    def test_delete_transaction_success(self):
        """Test deleting a transaction."""
        trans = Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 15),
            description='Grocery shopping',
            category=self.category1,
            amount=Decimal('250.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        trans_id = trans.id
        self.delete(f'/backend/transactions/{trans_id}', **self.auth_headers())
        self.assertStatus(204)

        # Verify transaction is deleted
        self.assertFalse(Transaction.objects.filter(id=trans_id).exists())

    def test_delete_transaction_not_found(self):
        """Test deleting a non-existent transaction."""
        self.delete('/backend/transactions/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_transaction_balance_reverted(self):
        """Test that deleting a transaction reverts the balance."""
        # Create transaction through API (which updates balance)
        payload = {
            'date': '2025-01-15',
            'description': 'Grocery shopping',
            'category_id': self.category1.id,
            'amount': '250.00',
            'currency': 'PLN',
            'type': 'expense',
            'budget_period_id': self.period.id,
        }
        data = self.post('/backend/transactions', payload, **self.auth_headers())
        trans_id = data['id']

        # Get balance after creation
        balance = PeriodBalance.objects.get(budget_period=self.period, currency='PLN')
        self.assertEqual(balance.total_expenses, Decimal('3250.00'))  # 3000 + 250

        self.delete(f'/backend/transactions/{trans_id}', **self.auth_headers())

        # Verify balance was reverted
        balance.refresh_from_db()
        self.assertEqual(balance.total_expenses, Decimal('3000.00'))  # Back to original


# =============================================================================
# Export Transactions Tests
# =============================================================================


class TestExportTransactions(TransactionsTestCase):
    """Tests for exporting transactions."""

    def test_export_transactions_success(self):
        """Test exporting transactions from a budget period."""
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

        response = self.client.get(
            f'/backend/transactions/export/?budget_period_id={self.period.id}',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertIn('attachment', response['Content-Disposition'])

    def test_export_transactions_with_type_filter(self):
        """Test exporting transactions filtered by type."""
        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 15),
            description='Salary',
            category=None,
            amount=Decimal('5000.00'),
            currency='PLN',
            type='income',
            created_by=self.user,
        )

        Transaction.objects.create(
            budget_period=self.period,
            date=date(2025, 1, 16),
            description='Groceries',
            category=self.category1,
            amount=Decimal('250.00'),
            currency='PLN',
            type='expense',
            created_by=self.user,
        )

        response = self.client.get(
            f'/backend/transactions/export/?budget_period_id={self.period.id}&type=expense',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 200)


# =============================================================================
# Import Transactions Tests
# =============================================================================


class TestImportTransactions(TransactionsTestCase):
    """Tests for importing transactions."""

    def post_file(self, path: str, file_data: dict, **kwargs) -> object:
        """Helper for POST requests with file upload."""
        response = self.client.post(path, **kwargs, data=file_data)
        self.response = response
        return response.json() if response.content else {}

    def test_import_transactions_success(self):
        """Test importing transactions from a JSON file."""
        import json

        transactions_data = json.dumps(
            [
                {
                    'date': '2025-01-15',
                    'description': 'Grocery shopping',
                    'category_name': 'Groceries',
                    'amount': '250.00',
                    'currency': 'PLN',
                    'type': 'expense',
                },
                {
                    'date': '2025-01-16',
                    'description': 'Salary',
                    'category_name': None,
                    'amount': '5000.00',
                    'currency': 'PLN',
                    'type': 'income',
                },
            ]
        )
        file = SimpleUploadedFile(
            'transactions.json',
            transactions_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/backend/transactions/import',
            {'file': file, 'budget_period_id': self.period.id},
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertIn('Successfully imported 2 new transactions', data['message'])

    def test_import_transactions_with_invalid_category_skips(self):
        """Test that importing transactions with invalid category names skips them."""
        import json

        transactions_data = json.dumps(
            [
                {
                    'date': '2025-01-15',
                    'description': 'Grocery shopping',
                    'category_name': 'NonExistent',
                    'amount': '250.00',
                    'currency': 'PLN',
                    'type': 'expense',
                },
            ]
        )
        file = SimpleUploadedFile(
            'transactions.json',
            transactions_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/backend/transactions/import',
            {'file': file, 'budget_period_id': self.period.id},
            **self.auth_headers(),
        )
        self.assertStatus(201)
        # Transaction should be imported without category
        self.assertEqual(Transaction.objects.filter(budget_period=self.period).count(), 1)

    def test_import_transactions_income_ignores_category(self):
        """Test that importing income transactions ignores category names."""
        import json

        transactions_data = json.dumps(
            [
                {
                    'date': '2025-01-15',
                    'description': 'Salary',
                    'category_name': 'SomeCategory',  # Should be ignored
                    'amount': '5000.00',
                    'currency': 'PLN',
                    'type': 'income',
                },
            ]
        )
        file = SimpleUploadedFile(
            'transactions.json',
            transactions_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/backend/transactions/import',
            {'file': file, 'budget_period_id': self.period.id},
            **self.auth_headers(),
        )
        self.assertStatus(201)

        # Verify income transaction has no category
        trans = Transaction.objects.filter(budget_period=self.period, type='income').first()
        self.assertIsNone(trans.category_id)

    def test_import_transactions_invalid_json_fails(self):
        """Test importing with invalid JSON file."""
        file = SimpleUploadedFile(
            'transactions.json',
            b'not valid json',
            content_type='application/json',
        )

        data = self.post_file(
            '/backend/transactions/import',
            {'file': file, 'budget_period_id': self.period.id},
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_import_transactions_invalid_format_fails(self):
        """Test importing with invalid data format."""
        import json

        transactions_data = json.dumps(
            [
                {
                    'date': '2025-01-15',
                    'description': 'Test',
                    'amount': '250.00',
                    'currency': 'PLN',
                    'type': 'invalid',  # Invalid type
                },
            ]
        )
        file = SimpleUploadedFile(
            'transactions.json',
            transactions_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/backend/transactions/import',
            {'file': file, 'budget_period_id': self.period.id},
            **self.auth_headers(),
        )
        self.assertStatus(400)
