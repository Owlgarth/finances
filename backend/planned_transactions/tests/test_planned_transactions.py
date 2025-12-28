"""Tests for planned_transactions API endpoints."""

from datetime import date
from decimal import Decimal

# Import User model at module level for use in tests
from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from categories.models import Category
from common.tests.mixins import APIClientMixin, AuthMixin
from period_balances.models import PeriodBalance
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction
from workspaces.models import Workspace, WorkspaceMember

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

        # Get or create the general budget account
        self.account = BudgetAccount.objects.filter(workspace=self.workspace, name='General').first()

        # Create budget periods
        self.period1 = BudgetPeriod.objects.create(
            budget_account=self.account,
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            weeks=5,
            created_by=self.user,
        )

        self.period2 = BudgetPeriod.objects.create(
            budget_account=self.account,
            name='February 2025',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 28),
            weeks=4,
            created_by=self.user,
        )

        # Create categories
        self.category1 = Category.objects.create(
            budget_period=self.period1,
            name='Groceries',
            created_by=self.user,
        )

        self.category2 = Category.objects.create(
            budget_period=self.period1,
            name='Rent',
            created_by=self.user,
        )

        # Create period balances for testing
        PeriodBalance.objects.create(
            budget_period=self.period1,
            currency='USD',
            opening_balance=Decimal('1000.00'),
            total_income=0,
            total_expenses=0,
            exchanges_in=0,
            exchanges_out=0,
            closing_balance=Decimal('1000.00'),
        )
        PeriodBalance.objects.create(
            budget_period=self.period1,
            currency='EUR',
            opening_balance=Decimal('500.00'),
            total_income=0,
            total_expenses=0,
            exchanges_in=0,
            exchanges_out=0,
            closing_balance=Decimal('500.00'),
        )

        # Create some test planned transactions
        self.planned1 = PlannedTransaction.objects.create(
            budget_period=self.period1,
            name='Monthly Rent',
            amount=Decimal('1200.00'),
            currency='USD',
            category=self.category2,
            planned_date=date(2025, 1, 5),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )

        self.planned2 = PlannedTransaction.objects.create(
            budget_period=self.period1,
            name='Grocery Shopping',
            amount=Decimal('150.00'),
            currency='USD',
            category=self.category1,
            planned_date=date(2025, 1, 15),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )

        self.planned3 = PlannedTransaction.objects.create(
            budget_period=self.period2,
            name='February Rent',
            amount=Decimal('1200.00'),
            currency='USD',
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
        data = self.get('/backend/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 3)  # All 3 planned transactions created in setUp

    def test_list_filtered_by_period(self):
        """Test listing planned transactions filtered by budget period."""
        data = self.get(f'/backend/planned-transactions?budget_period_id={self.period1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)  # Only planned transactions in period1

        data = self.get(f'/backend/planned-transactions?budget_period_id={self.period2.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)  # Only planned transaction in period2

    def test_list_filtered_by_status(self):
        """Test listing planned transactions filtered by status."""
        # Update one transaction to 'done' status
        self.planned1.status = 'done'
        self.planned1.save()

        data = self.get('/backend/planned-transactions?status=pending', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)  # Only pending transactions

        data = self.get('/backend/planned-transactions?status=done', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)  # Only done transactions

    def test_list_ordered_by_planned_date(self):
        """Test that planned transactions are ordered by planned_date."""
        data = self.get('/backend/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        # Check dates are in ascending order
        dates = [pt['planned_date'] for pt in data]
        self.assertEqual(dates, sorted(dates))

    def test_list_without_auth_returns_401(self):
        """Test that listing planned transactions without authentication fails."""
        data = self.get('/backend/planned-transactions')
        self.assertStatus(401)


# =============================================================================
# Get Planned Transaction Tests
# =============================================================================


class TestGetPlannedTransaction(PlannedTransactionTestCase):
    """Tests for GET /backend/planned-transactions/{id}."""

    def test_get_planned_success(self):
        """Test getting a specific planned transaction."""
        data = self.get(f'/backend/planned-transactions/{self.planned1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['id'], self.planned1.id)
        self.assertEqual(data['name'], 'Monthly Rent')
        self.assertEqual(str(data['amount']), '1200.00')

    def test_get_planned_not_found(self):
        """Test getting non-existent planned transaction returns 404."""
        data = self.get('/backend/planned-transactions/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_get_planned_without_auth_fails(self):
        """Test that getting a planned transaction without authentication fails."""
        data = self.get(f'/backend/planned-transactions/{self.planned1.id}')
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
        data = self.post('/backend/planned-transactions', payload, **self.auth_headers())

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
        data = self.post('/backend/planned-transactions', payload, **self.auth_headers())

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
        data = self.post('/backend/planned-transactions', payload, **self.auth_headers())

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
        data = self.post('/backend/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_create_planned_with_invalid_category_fails(self):
        """Test that creating with category from different period fails."""
        # Create a category in period2
        category_period2 = Category.objects.create(
            budget_period=self.period2,
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
        data = self.post('/backend/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_create_planned_with_zero_amount_fails(self):
        """Test that creating planned transaction with zero amount fails."""
        payload = {
            'name': 'Zero Bill',
            'amount': '0.00',  # Zero amount
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        data = self.post('/backend/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(422)  # Pydantic validation error

    def test_create_planned_without_auth_fails(self):
        """Test that creating planned transaction without authentication fails."""
        payload = {
            'name': 'Test Bill',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        data = self.post('/backend/planned-transactions', payload)
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
        data = self.post('/backend/planned-transactions', payload, **self.auth_headers())
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
        data = self.post('/backend/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(201)


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
        data = self.put(f'/backend/planned-transactions/{self.planned1.id}', payload, **self.auth_headers())

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
        data = self.put('/backend/planned-transactions/99999', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_update_planned_without_auth_fails(self):
        """Test that updating planned transaction without authentication fails."""
        payload = {
            'name': 'Test',
            'amount': '100.00',
            'currency': 'USD',
            'planned_date': '2025-01-20',
        }
        data = self.put(f'/backend/planned-transactions/{self.planned1.id}', payload)
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
        data = self.put(f'/backend/planned-transactions/{self.planned1.id}', payload, **self.auth_headers())
        self.assertStatus(403)

    def test_update_status_to_done(self):
        """Test updating status to done."""
        payload = {
            'name': 'Monthly Rent',
            'amount': '1200.00',
            'currency': 'USD',
            'planned_date': '2025-01-05',
            'status': 'done',
        }
        data = self.put(f'/backend/planned-transactions/{self.planned1.id}', payload, **self.auth_headers())

        self.assertStatus(200)
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

        self.delete(f'/backend/planned-transactions/{planned_id}', **self.auth_headers())
        self.assertStatus(204)

        # Verify planned transaction is deleted
        self.assertFalse(PlannedTransaction.objects.filter(id=planned_id).exists())
        self.assertEqual(PlannedTransaction.objects.count(), initial_count - 1)

    def test_delete_planned_not_found(self):
        """Test deleting non-existent planned transaction returns 404."""
        data = self.delete('/backend/planned-transactions/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_planned_without_auth_fails(self):
        """Test that deleting planned transaction without authentication fails."""
        data = self.delete(f'/backend/planned-transactions/{self.planned1.id}')
        self.assertStatus(401)

    def test_delete_as_viewer_fails(self):
        """Test that viewer role cannot delete planned transactions."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        data = self.delete(f'/backend/planned-transactions/{self.planned1.id}', **self.auth_headers())
        self.assertStatus(403)


# =============================================================================
# Execute Planned Transaction Tests
# =============================================================================


class TestExecutePlannedTransaction(PlannedTransactionTestCase):
    """Tests for POST /backend/planned-transactions/{id}/execute."""

    def test_execute_planned_success(self):
        """Test executing a planned transaction creates an actual transaction."""
        initial_transaction_count = Transaction.objects.count()
        initial_expenses = PeriodBalance.objects.get(budget_period=self.period1, currency='USD').total_expenses

        data = self.post(
            f'/backend/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05', {}, **self.auth_headers()
        )

        self.assertStatus(200)
        self.assertEqual(data['status'], 'done')
        self.assertEqual(data['payment_date'], '2025-01-05')
        self.assertIsNotNone(data['transaction_id'])

        # Verify transaction was created
        self.assertEqual(Transaction.objects.count(), initial_transaction_count + 1)

        # Verify balance was updated
        balance = PeriodBalance.objects.get(budget_period=self.period1, currency='USD')
        self.assertEqual(balance.total_expenses, initial_expenses + Decimal('1200.00'))

    def test_execute_planned_twice_fails(self):
        """Test that executing an already executed planned transaction fails."""
        # Execute once
        self.post(
            f'/backend/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05', {}, **self.auth_headers()
        )

        # Try to execute again
        data = self.post(
            f'/backend/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-06', {}, **self.auth_headers()
        )
        self.assertStatus(400)

    def test_execute_planned_with_invalid_payment_date_fails(self):
        """Test executing with payment date outside any period fails."""
        # Payment date in March, but we only have Jan and Feb periods
        data = self.post(
            f'/backend/planned-transactions/{self.planned1.id}/execute?payment_date=2025-03-15', {}, **self.auth_headers()
        )
        self.assertStatus(400)

    def test_execute_planned_not_found(self):
        """Test executing non-existent planned transaction returns 404."""
        data = self.post('/backend/planned-transactions/99999/execute?payment_date=2025-01-05', {}, **self.auth_headers())
        self.assertStatus(404)

    def test_execute_without_auth_fails(self):
        """Test that executing without authentication fails."""
        data = self.post(f'/backend/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05', {})
        self.assertStatus(401)

    def test_execute_as_viewer_fails(self):
        """Test that viewer role cannot execute planned transactions."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        data = self.post(
            f'/backend/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05', {}, **self.auth_headers()
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
            f'/backend/planned-transactions/export/?budget_period_id={self.period1.id}',
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
            f'/backend/planned-transactions/export/?budget_period_id={self.period1.id}&status=done',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 200)

        import json

        data = json.loads(response.content)
        self.assertEqual(len(data), 1)  # Only 1 done transaction

    def test_export_planned_from_other_workspace_fails(self):
        """Test exporting planned transactions from another workspace returns 404."""
        # Create another workspace
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
            created_by=other_user,
        )

        other_period = BudgetPeriod.objects.create(
            budget_account=other_account,
            name='Other Period',
            start_date=date(2025, 4, 1),
            end_date=date(2025, 4, 30),
            created_by=other_user,
        )

        # Try to export with first user
        response = self.client.get(
            f'/backend/planned-transactions/export/?budget_period_id={other_period.id}',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 404)

    def test_export_planned_without_auth_fails(self):
        """Test exporting without authentication fails."""
        response = self.client.get(
            f'/backend/planned-transactions/export/?budget_period_id={self.period1.id}',
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
                    f'/backend/planned-transactions/import?budget_period_id={self.period1.id}',
                    data={'file': file},
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
                    f'/backend/planned-transactions/import?budget_period_id={self.period1.id}',
                    data={'file': file},
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
                    f'/backend/planned-transactions/import?budget_period_id={self.period1.id}',
                    data={'file': file},
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
                    f'/backend/planned-transactions/import?budget_period_id={self.period1.id}',
                    data={'file': file},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 400)

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
                    f'/backend/planned-transactions/import?budget_period_id={self.period1.id}',
                    data={'file': file},
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
                    f'/backend/planned-transactions/import?budget_period_id={self.period1.id}',
                    data={'file': file},
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
                    f'/backend/planned-transactions/import?budget_period_id={self.period1.id}',
                    data={'file': file},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 403)
