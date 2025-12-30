"""Tests for budget periods API endpoints."""

from datetime import date

from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from budgets.models import Budget
from categories.models import Category
from common.tests.mixins import APIClientMixin, AuthMixin
from period_balances.models import PeriodBalance
from planned_transactions.models import PlannedTransaction


class BudgetPeriodsTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base test case for budget periods tests with common setup."""

    def setUp(self):
        """Set up authenticated user and create additional budget account for testing."""
        super().setUp()
        # Create an additional budget account for testing
        self.secondary_account = BudgetAccount.objects.create(
            workspace=self.workspace,
            name='Secondary Account',
            description='Secondary budget account for testing',
            default_currency='USD',
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
        BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='Period 1',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            weeks=4,
            created_by=self.user,
        )
        BudgetPeriod.objects.create(
            budget_account=self.secondary_account,
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
        BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='January',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )
        BudgetPeriod.objects.create(
            budget_account=self.secondary_account,
            name='February',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 28),
            created_by=self.user,
        )
        BudgetPeriod.objects.create(
            budget_account=self.secondary_account,
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
        BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
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
        BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        data = self.get('/api/budget-periods/current?current_date=2025-01-01', **self.auth_headers())
        self.assertEqual(data['name'], 'January 2025')

    def test_get_current_period_not_found(self):
        """Test getting current period when none exists for the date."""
        data = self.get('/api/budget-periods/current?current_date=2025-06-15', **self.auth_headers())
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
        period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
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
        data = self.get('/api/budget-periods/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_get_period_requires_auth(self):
        """Test getting a period requires authentication."""
        period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
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

        currencies = {b.currency for b in balances}
        self.assertEqual(currencies, {'PLN', 'USD', 'EUR', 'UAH'})

    def test_create_period_with_invalid_account(self):
        """Test creating period with non-existent budget account."""
        data = self.post(
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


# =============================================================================
# Update Period Tests
# =============================================================================


class TestUpdatePeriod(BudgetPeriodsTestCase):
    """Tests for updating budget periods."""

    def test_update_period_name(self):
        """Test updating period name."""
        period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
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
        period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
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
        period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
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
        period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )

        data = self.put(
            f'/api/budget-periods/{period.id}',
            {
                'budget_account_id': 99999,
            },
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_update_period_not_found(self):
        """Test updating a non-existent period."""
        data = self.put(
            '/api/budget-periods/99999',
            {
                'name': 'New Name',
            },
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_update_period_requires_auth(self):
        """Test updating period requires authentication."""
        period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )
        self.put(f'/api/budget-periods/{period.id}', {'name': 'New Name'})
        self.assertStatus(401)


# =============================================================================
# Delete Period Tests
# =============================================================================


class TestDeletePeriod(BudgetPeriodsTestCase):
    """Tests for deleting budget periods."""

    def test_delete_period_success(self):
        """Test successful period deletion."""
        period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
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
        period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='Test Period',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.user,
        )
        self.delete(f'/api/budget-periods/{period.id}')
        self.assertStatus(401)


# =============================================================================
# Copy Period Tests
# =============================================================================


class TestCopyPeriod(BudgetPeriodsTestCase):
    """Tests for copying budget periods."""

    def setUp(self):
        """Set up test data for copy tests."""
        super().setUp()
        # Create source period with categories, budgets, and planned transactions
        self.source_period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            weeks=4,
            created_by=self.user,
        )

        # Create categories
        self.cat1 = Category.objects.create(
            budget_period=self.source_period,
            name='Groceries',
            created_by=self.user,
        )
        self.cat2 = Category.objects.create(
            budget_period=self.source_period,
            name='Rent',
            created_by=self.user,
        )

        # Create budgets
        Budget.objects.create(
            budget_period=self.source_period,
            category=self.cat1,
            currency='PLN',
            amount=1500,
        )
        Budget.objects.create(
            budget_period=self.source_period,
            category=self.cat2,
            currency='PLN',
            amount=2000,
        )

        # Create planned transactions
        PlannedTransaction.objects.create(
            budget_period=self.source_period,
            name='Monthly Rent',
            amount=2000,
            currency='PLN',
            category=self.cat2,
            planned_date=date(2025, 1, 5),
            status='pending',
        )
        PlannedTransaction.objects.create(
            budget_period=self.source_period,
            name='Weekly Groceries',
            amount=400,
            currency='PLN',
            category=self.cat1,
            planned_date=date(2025, 1, 10),
            status='pending',
        )

    def test_copy_period_success(self):
        """Test successful period copy."""
        data = self.post(
            f'/api/budget-periods/{self.source_period.id}/copy',
            {
                'name': 'February 2025',
                'start_date': '2025-02-01',
                'end_date': '2025-02-28',
                'weeks': 4,
            },
            **self.auth_headers(),
        )

        self.assertStatus(201)
        self.assertEqual(data['name'], 'February 2025')
        self.assertEqual(data['budget_account_id'], self.source_period.budget_account_id)

    def test_copy_period_creates_new_categories(self):
        """Test that copying creates new categories."""
        self.post(
            f'/api/budget-periods/{self.source_period.id}/copy',
            {
                'name': 'February 2025',
                'start_date': '2025-02-01',
                'end_date': '2025-02-28',
            },
            **self.auth_headers(),
        )

        new_period = BudgetPeriod.objects.get(name='February 2025')
        self.assertEqual(new_period.categories.count(), 2)

        category_names = {c.name for c in new_period.categories.all()}
        self.assertEqual(category_names, {'Groceries', 'Rent'})

    def test_copy_period_creates_new_budgets(self):
        """Test that copying creates new budgets."""
        self.post(
            f'/api/budget-periods/{self.source_period.id}/copy',
            {
                'name': 'February 2025',
                'start_date': '2025-02-01',
                'end_date': '2025-02-28',
            },
            **self.auth_headers(),
        )

        new_period = BudgetPeriod.objects.get(name='February 2025')
        self.assertEqual(new_period.budgets.count(), 2)

    def test_copy_period_adjusts_planned_dates(self):
        """Test that copying adjusts planned transaction dates."""
        self.post(
            f'/api/budget-periods/{self.source_period.id}/copy',
            {
                'name': 'February 2025',
                'start_date': '2025-02-01',
                'end_date': '2025-02-28',
            },
            **self.auth_headers(),
        )

        new_period = BudgetPeriod.objects.get(name='February 2025')
        planned = new_period.planned_transactions.filter(name='Monthly Rent').first()
        self.assertEqual(planned.planned_date, date(2025, 2, 5))

        planned = new_period.planned_transactions.filter(name='Weekly Groceries').first()
        self.assertEqual(planned.planned_date, date(2025, 2, 10))

    def test_copy_period_sets_planned_status_to_pending(self):
        """Test that copied planned transactions have pending status."""
        # Update source transaction status
        source_planned = self.source_period.planned_transactions.first()
        source_planned.status = 'done'
        source_planned.save()

        self.post(
            f'/api/budget-periods/{self.source_period.id}/copy',
            {
                'name': 'February 2025',
                'start_date': '2025-02-01',
                'end_date': '2025-02-28',
            },
            **self.auth_headers(),
        )

        new_period = BudgetPeriod.objects.get(name='February 2025')
        for planned in new_period.planned_transactions.all():
            self.assertEqual(planned.status, 'pending')

    def test_copy_period_creates_balances(self):
        """Test that copying creates period balances."""
        self.post(
            f'/api/budget-periods/{self.source_period.id}/copy',
            {
                'name': 'February 2025',
                'start_date': '2025-02-01',
                'end_date': '2025-02-28',
            },
            **self.auth_headers(),
        )

        new_period = BudgetPeriod.objects.get(name='February 2025')
        balances = PeriodBalance.objects.filter(budget_period=new_period)
        self.assertEqual(balances.count(), 4)

    def test_copy_period_not_found(self):
        """Test copying a non-existent period."""
        data = self.post(
            '/api/budget-periods/99999/copy',
            {
                'name': 'February 2025',
                'start_date': '2025-02-01',
                'end_date': '2025-02-28',
            },
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_copy_period_requires_auth(self):
        """Test copying period requires authentication."""
        self.post(
            f'/api/budget-periods/{self.source_period.id}/copy',
            {
                'name': 'February 2025',
                'start_date': '2025-02-01',
                'end_date': '2025-02-28',
            },
        )
        self.assertStatus(401)
