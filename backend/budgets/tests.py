"""Tests for budgets API."""

from datetime import date
from decimal import Decimal

# Import User model at module level for use in tests
from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from budgets.models import Budget
from categories.models import Category
from common.tests.mixins import APIClientMixin, AuthMixin

User = get_user_model()


class BudgetsAPITestCase(AuthMixin, APIClientMixin, TestCase):
    """Test cases for budgets API endpoints."""

    def setUp(self):
        """Set up test data for budgets API tests."""
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

        # Create categories
        self.category1 = Category.objects.create(
            budget_period=self.period1,
            name='Groceries',
            created_by=self.user,
        )

        self.category2 = Category.objects.create(
            budget_period=self.period1,
            name='Transport',
            created_by=self.user,
        )

        self.category3 = Category.objects.create(
            budget_period=self.period2,
            name='Entertainment',
            created_by=self.user,
        )

        # Create some test budgets
        self.budget1 = Budget.objects.create(
            budget_period=self.period1,
            category=self.category1,
            currency='PLN',
            amount=Decimal('1500.00'),
            created_by=self.user,
            updated_by=self.user,
        )

        self.budget2 = Budget.objects.create(
            budget_period=self.period1,
            category=self.category2,
            currency='PLN',
            amount=Decimal('500.00'),
            created_by=self.user,
            updated_by=self.user,
        )

        self.budget3 = Budget.objects.create(
            budget_period=self.period2,
            category=self.category3,
            currency='EUR',
            amount=Decimal('200.00'),
            created_by=self.user,
            updated_by=self.user,
        )

    # =============================================================================
    # List Budgets Tests
    # =============================================================================

    def test_list_budgets_returns_all_budgets_in_workspace(self):
        """Test listing all budgets in the workspace."""
        data = self.get('/backend/budgets', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 3)  # All 3 budgets created in setUp

    def test_list_budgets_filtered_by_period(self):
        """Test listing budgets filtered by budget period."""
        data = self.get('/backend/budgets?budget_period_id=' + str(self.period1.id), **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)  # Only budgets in period1

        data = self.get('/backend/budgets?budget_period_id=' + str(self.period2.id), **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)  # Only budget in period2

    def test_list_budgets_filtered_by_period_no_results(self):
        """Test listing budgets with a period that has no budgets."""
        data = self.get('/backend/budgets?budget_period_id=' + str(self.other_period.id), **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 0)

    def test_list_budgets_without_auth_returns_401(self):
        """Test that listing budgets without authentication fails."""
        data = self.get('/backend/budgets')
        self.assertStatus(401)

    # =============================================================================
    # Create Budget Tests
    # =============================================================================

    def test_create_budget_success(self):
        """Test creating a new budget."""
        payload = {
            'budget_period_id': self.period1.id,
            'category_id': self.category1.id,
            'currency': 'USD',
            'amount': '300.00',
        }
        data = self.post('/backend/budgets', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['currency'], 'USD')
        self.assertEqual(data['amount'], '300.00')
        self.assertEqual(data['category']['id'], self.category1.id)

        # Verify budget was created in database
        self.assertTrue(
            Budget.objects.filter(
                budget_period=self.period1,
                category=self.category1,
                currency='USD',
                amount=Decimal('300.00'),
            ).exists()
        )

    def test_create_budget_different_currencies_same_category(self):
        """Test creating budgets with different currencies for same category."""
        payload1 = {
            'budget_period_id': self.period1.id,
            'category_id': self.category1.id,
            'currency': 'EUR',
            'amount': '500.00',
        }
        data1 = self.post('/backend/budgets', payload1, **self.auth_headers())
        self.assertStatus(201)

        payload2 = {
            'budget_period_id': self.period1.id,
            'category_id': self.category1.id,
            'currency': 'USD',
            'amount': '300.00',
        }
        data2 = self.post('/backend/budgets', payload2, **self.auth_headers())
        self.assertStatus(201)

        # Both should exist
        self.assertEqual(
            Budget.objects.filter(
                budget_period=self.period1,
                category=self.category1,
            ).count(),
            3,  # 1 from setUp + 2 new ones
        )

    def test_create_budget_with_period_from_other_workspace_fails(self):
        """Test that creating a budget with a period from another workspace fails."""
        # Create another workspace with a period
        from workspaces.models import Workspace, WorkspaceMember

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

        other_category = Category.objects.create(
            budget_period=other_period,
            name='Other Category',
            created_by=other_user,
        )

        payload = {
            'budget_period_id': other_period.id,
            'category_id': other_category.id,
            'currency': 'PLN',
            'amount': '100.00',
        }
        data = self.post('/backend/budgets', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_create_budget_with_category_from_different_period_fails(self):
        """Test that creating a budget with a category from different period fails."""
        payload = {
            'budget_period_id': self.period2.id,
            'category_id': self.category1.id,  # category1 belongs to period1
            'currency': 'PLN',
            'amount': '100.00',
        }
        data = self.post('/backend/budgets', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_create_budget_with_zero_amount_fails(self):
        """Test that creating a budget with zero amount fails."""
        payload = {
            'budget_period_id': self.period1.id,
            'category_id': self.category1.id,
            'currency': 'PLN',
            'amount': '-50.00',  # Negative amount
        }
        data = self.post('/backend/budgets', payload, **self.auth_headers())
        self.assertStatus(422)  # Pydantic validation error

    def test_create_budget_without_auth_fails(self):
        """Test that creating a budget without authentication fails."""
        payload = {
            'budget_period_id': self.period1.id,
            'category_id': self.category1.id,
            'currency': 'PLN',
            'amount': '100.00',
        }
        data = self.post('/backend/budgets', payload)
        self.assertStatus(401)

    # =============================================================================
    # Update Budget Tests
    # =============================================================================

    def test_update_budget_success(self):
        """Test updating an existing budget."""
        payload = {
            'budget_period_id': self.period1.id,
            'category_id': self.category1.id,
            'currency': 'EUR',
            'amount': '750.00',
        }
        data = self.put(f'/backend/budgets/{self.budget1.id}', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['amount'], '750.00')
        self.assertEqual(data['currency'], 'PLN')

        # Verify in database
        self.budget1.refresh_from_db()
        self.assertEqual(self.budget1.amount, Decimal('750.00'))
        self.assertEqual(self.budget1.currency, 'PLN')

    def test_update_budget_partial_update(self):
        """Test updating only some fields of a budget."""
        payload = {
            'amount': '2000.00',
        }
        data = self.put(f'/backend/budgets/{self.budget1.id}', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['amount'], '2000.00')
        # Other fields should remain unchanged
        self.assertEqual(data['currency'], self.budget1.currency)
        self.assertEqual(data['category']['id'], self.budget1.category_id)

    def test_update_budget_not_found(self):
        """Test updating a budget that doesn't exist."""
        payload = {'amount': '500.00'}
        data = self.put('/backend/budgets/99999', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_update_budget_without_auth_fails(self):
        """Test that updating a budget without authentication fails."""
        payload = {'amount': '500.00'}
        data = self.put(f'/backend/budgets/{self.budget1.id}', payload)
        self.assertStatus(401)

    # =============================================================================
    # Delete Budget Tests
    # =============================================================================

    def test_delete_budget_success(self):
        """Test deleting a budget."""
        budget_id = self.budget1.id
        self.delete(f'/backend/budgets/{budget_id}', **self.auth_headers())
        self.assertStatus(204)

        # Verify budget is deleted
        self.assertFalse(Budget.objects.filter(id=budget_id).exists())

    def test_delete_budget_not_found(self):
        """Test deleting a budget that doesn't exist."""
        data = self.delete('/backend/budgets/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_budget_without_auth_fails(self):
        """Test that deleting a budget without authentication fails."""
        data = self.delete(f'/backend/budgets/{self.budget1.id}')
        self.assertStatus(401)

    # =============================================================================
    # Helper Methods
    # =============================================================================

    def delete(self, path: str, **kwargs):
        """Helper for DELETE requests."""
        response = self.client.delete(path, **kwargs)
        self.response = response
        return response.json() if response.content and response.status_code != 204 else {}
