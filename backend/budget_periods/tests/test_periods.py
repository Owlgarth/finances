"""Tests for budget periods API endpoints."""

from datetime import date

from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.factories import BudgetPeriodFactory
from budget_periods.models import BudgetPeriod
from common.tests.mixins import APIClientMixin, AuthMixin
from period_balances.models import PeriodBalance
from workspaces.models import WorkspaceMember


class BudgetPeriodsTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base test case for budget periods tests with common setup."""

    def setUp(self):
        """Set up authenticated user and create additional budget account for testing."""
        super().setUp()
        self.currencies = {c.symbol: c for c in self.workspace.currencies.all()}
        # Create an additional budget account for testing
        self.secondary_account = BudgetAccount.objects.create(
            workspace=self.workspace,
            name='Secondary Account',
            description='Secondary budget account for testing',
            default_currency=self.currencies['USD'],
            is_active=True,
            display_order=1,
            created_by=self.user,
        )


# =============================================================================
# List Periods Tests
# =============================================================================


class TestListPeriods(BudgetPeriodsTestCase):
    """Tests for listing budget periods."""

    def test_list_empty_periods(self):
        """Test listing periods when none exist."""
        data = self.get('/api/budget-periods', **self.auth_headers())
        self.assertEqual(data, [])

    def test_list_periods_returns_all(self):
        """Test listing returns all periods in workspace."""
        # Create periods in the user's workspace
        BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Period 1',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            weeks=4,
            created_by=self.user,
        )
        BudgetPeriodFactory(
            budget_account=self.secondary_account,
            workspace=self.workspace,
            name='Period 2',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 28),
            weeks=4,
            created_by=self.user,
        )

        data = self.get('/api/budget-periods', **self.auth_headers())
        self.assertEqual(len(data), 2)

    def test_list_periods_ordered_by_start_date_desc(self):
        """Test periods are ordered by start_date descending."""
        BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='January',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )
        BudgetPeriodFactory(
            budget_account=self.secondary_account,
            workspace=self.workspace,
            name='February',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 28),
            created_by=self.user,
        )
        BudgetPeriodFactory(
            budget_account=self.secondary_account,
            workspace=self.workspace,
            name='March',
            start_date=date(2025, 3, 1),
            end_date=date(2025, 3, 31),
            created_by=self.user,
        )

        data = self.get('/api/budget-periods', **self.auth_headers())
        self.assertEqual(data[0]['name'], 'March')
        self.assertEqual(data[1]['name'], 'February')
        self.assertEqual(data[2]['name'], 'January')

    def test_list_requires_auth(self):
        """Test listing requires authentication."""
        self.get('/api/budget-periods')
        self.assertStatus(401)


# =============================================================================
# Get Current Period Tests
# =============================================================================


class TestGetCurrentPeriod(BudgetPeriodsTestCase):
    """Tests for getting current budget period."""

    def test_get_current_period_found(self):
        """Test getting current period when it exists."""
        BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        data = self.get('/api/budget-periods/current?current_date=2025-01-15', **self.auth_headers())
        self.assertEqual(data['name'], 'January 2025')
        self.assertStatus(200)

    def test_get_current_period_on_boundary(self):
        """Test getting period on start date boundary."""
        BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        data = self.get('/api/budget-periods/current?current_date=2025-01-01', **self.auth_headers())
        self.assertEqual(data['name'], 'January 2025')

    def test_get_current_period_not_found(self):
        """Test getting current period when none exists for the date."""
        self.get('/api/budget-periods/current?current_date=2025-06-15', **self.auth_headers())
        self.assertStatus(404)

    def test_get_current_period_requires_auth(self):
        """Test getting current period requires authentication."""
        self.get('/api/budget-periods/current?current_date=2025-01-15')
        self.assertStatus(401)


# =============================================================================
# Get Period Tests
# =============================================================================


class TestGetPeriod(BudgetPeriodsTestCase):
    """Tests for getting a specific budget period."""

    def test_get_period_by_id(self):
        """Test getting a period by ID."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        data = self.get(f'/api/budget-periods/{period.id}', **self.auth_headers())
        self.assertEqual(data['id'], period.id)
        self.assertEqual(data['name'], 'Test Period')

    def test_get_period_not_found(self):
        """Test getting a non-existent period."""
        self.get('/api/budget-periods/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_get_period_requires_auth(self):
        """Test getting a period requires authentication."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )
        self.get(f'/api/budget-periods/{period.id}')
        self.assertStatus(401)


# =============================================================================
# Create Period Tests
# =============================================================================


class TestCreatePeriod(BudgetPeriodsTestCase):
    """Tests for creating budget periods."""

    def test_create_period_success(self):
        """Test successful period creation."""
        account = self.workspace.budget_accounts.first()
        data = self.post(
            '/api/budget-periods',
            {
                'budget_account_id': account.id,
                'name': 'March 2025',
                'start_date': '2025-03-01',
                'end_date': '2025-03-31',
                'weeks': 4,
            },
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertEqual(data['name'], 'March 2025')
        self.assertEqual(data['budget_account_id'], account.id)

    def test_create_period_creates_balances(self):
        """Test that creating a period creates balances for all currencies."""
        account = self.workspace.budget_accounts.first()
        self.post(
            '/api/budget-periods',
            {
                'budget_account_id': account.id,
                'name': 'March 2025',
                'start_date': '2025-03-01',
                'end_date': '2025-03-31',
            },
            **self.auth_headers(),
        )

        period = BudgetPeriod.objects.get(name='March 2025')
        balances = PeriodBalance.objects.filter(budget_period=period)
        self.assertEqual(balances.count(), 4)

        currencies = {b.currency.symbol for b in balances}
        self.assertEqual(currencies, {'PLN', 'USD', 'EUR', 'UAH'})

    def test_create_period_with_invalid_account(self):
        """Test creating period with non-existent budget account."""
        self.post(
            '/api/budget-periods',
            {
                'budget_account_id': 99999,
                'name': 'March 2025',
                'start_date': '2025-03-01',
                'end_date': '2025-03-31',
            },
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_create_period_without_weeks(self):
        """Test creating period without weeks field."""
        account = self.workspace.budget_accounts.first()
        data = self.post(
            '/api/budget-periods',
            {
                'budget_account_id': account.id,
                'name': 'March 2025',
                'start_date': '2025-03-01',
                'end_date': '2025-03-31',
            },
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertIsNone(data['weeks'])

    def test_create_period_requires_auth(self):
        """Test creating period requires authentication."""
        account = self.workspace.budget_accounts.first()
        self.post(
            '/api/budget-periods',
            {
                'budget_account_id': account.id,
                'name': 'March 2025',
                'start_date': '2025-03-01',
                'end_date': '2025-03-31',
            },
        )
        self.assertStatus(401)

    def test_viewer_cannot_create_period(self):
        """Test that a viewer cannot create a period."""
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        account = self.workspace.budget_accounts.first()
        self.post(
            '/api/budget-periods',
            {
                'budget_account_id': account.id,
                'name': 'March 2025',
                'start_date': '2025-03-01',
                'end_date': '2025-03-31',
            },
            **self.auth_headers(),
        )
        self.assertStatus(403)

    def test_member_can_create_period(self):
        """Test that a member can create a period."""
        WorkspaceMember.objects.filter(user=self.user).update(role='member')
        account = self.workspace.budget_accounts.first()
        self.post(
            '/api/budget-periods',
            {
                'budget_account_id': account.id,
                'name': 'March 2025',
                'start_date': '2025-03-01',
                'end_date': '2025-03-31',
            },
            **self.auth_headers(),
        )
        self.assertStatus(201)


# =============================================================================
# Update Period Tests
# =============================================================================


class TestUpdatePeriod(BudgetPeriodsTestCase):
    """Tests for updating budget periods."""

    def test_update_period_name(self):
        """Test updating period name."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Old Name',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        data = self.put(
            f'/api/budget-periods/{period.id}',
            {
                'name': 'New Name',
            },
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['name'], 'New Name')

    def test_update_period_dates(self):
        """Test updating period dates."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        data = self.put(
            f'/api/budget-periods/{period.id}',
            {
                'start_date': '2025-02-01',
                'end_date': '2025-02-28',
            },
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['start_date'], '2025-02-01')
        self.assertEqual(data['end_date'], '2025-02-28')

    def test_update_period_change_account(self):
        """Test updating period to different budget account."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        data = self.put(
            f'/api/budget-periods/{period.id}',
            {
                'budget_account_id': self.secondary_account.id,
            },
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['budget_account_id'], self.secondary_account.id)

    def test_update_period_with_invalid_account(self):
        """Test updating period with non-existent budget account."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        self.put(
            f'/api/budget-periods/{period.id}',
            {
                'budget_account_id': 99999,
            },
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_update_period_not_found(self):
        """Test updating a non-existent period."""
        self.put(
            '/api/budget-periods/99999',
            {
                'name': 'New Name',
            },
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_update_period_requires_auth(self):
        """Test updating period requires authentication."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )
        self.put(f'/api/budget-periods/{period.id}', {'name': 'New Name'})
        self.assertStatus(401)

    def test_viewer_cannot_update_period(self):
        """Test that a viewer cannot update a period."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.put(f'/api/budget-periods/{period.id}', {'name': 'New Name'}, **self.auth_headers())
        self.assertStatus(403)


# =============================================================================
# Delete Period Tests
# =============================================================================


class TestDeletePeriod(BudgetPeriodsTestCase):
    """Tests for deleting budget periods."""

    def test_delete_period_success(self):
        """Test successful period deletion."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        self.delete(f'/api/budget-periods/{period.id}', **self.auth_headers())
        self.assertStatus(204)

        # Verify period is deleted
        self.assertFalse(BudgetPeriod.objects.filter(id=period.id).exists())

    def test_delete_period_not_found(self):
        """Test deleting a non-existent period."""
        self.delete('/api/budget-periods/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_period_requires_auth(self):
        """Test deleting period requires authentication."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )
        self.delete(f'/api/budget-periods/{period.id}')
        self.assertStatus(401)

    def test_viewer_cannot_delete_period(self):
        """Test that a viewer cannot delete a period."""
        period = BudgetPeriodFactory(
            budget_account=self.workspace.budget_accounts.first(),
            workspace=self.workspace,
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.delete(f'/api/budget-periods/{period.id}', **self.auth_headers())
        self.assertStatus(403)
