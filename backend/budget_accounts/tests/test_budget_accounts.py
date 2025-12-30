"""Tests for budget_accounts API endpoints."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from common.tests.mixins import APIClientMixin, AuthMixin
from workspaces.models import WorkspaceMember

User = get_user_model()


# =============================================================================
# Base Test Class
# =============================================================================


class BudgetAccountTestCase(APIClientMixin, AuthMixin, TestCase):
    """Base test case for budget account tests with authenticated user."""

    def setUp(self):
        """Set up authenticated user."""
        APIClientMixin.setUp(self)
        AuthMixin.setUp(self)

    def create_budget_account(self, **kwargs):
        """Helper to create a budget account."""
        defaults = {
            'workspace': self.workspace,
            'name': 'Test Account',
            'description': 'Test description',
            'default_currency': 'PLN',
            'is_active': True,
            'display_order': 0,
            'created_by': self.user,
        }
        defaults.update(kwargs)
        return BudgetAccount.objects.create(**defaults)


# =============================================================================
# List Budget Accounts
# =============================================================================


class TestListBudgetAccounts(BudgetAccountTestCase):
    """Tests for GET /backend/budget-accounts."""

    def test_list_returns_accounts_for_workspace(self):
        """Test listing returns accounts for user's workspace."""
        self.create_budget_account(name='Account 1')
        self.create_budget_account(name='Account 2')

        data = self.get('/api/budget-accounts', **self.auth_headers())

        self.assertStatus(200)
        self.assertEqual(len(data), 3)  # 2 created + 1 from AuthMixin
        account_names = {acc['name'] for acc in data}
        self.assertIn('Account 1', account_names)
        self.assertIn('Account 2', account_names)
        self.assertIn('General', account_names)

    def test_list_active_only_by_default(self):
        """Test listing only returns active accounts by default."""
        self.create_budget_account(name='Active Account', is_active=True)
        self.create_budget_account(name='Inactive Account', is_active=False)

        data = self.get('/api/budget-accounts', **self.auth_headers())

        self.assertStatus(200)
        account_names = {acc['name'] for acc in data}
        self.assertIn('Active Account', account_names)
        self.assertNotIn('Inactive Account', account_names)

    def test_list_include_inactive_shows_all(self):
        """Test listing with include_inactive=true shows all accounts."""
        self.create_budget_account(name='Active Account', is_active=True)
        self.create_budget_account(name='Inactive Account', is_active=False)

        data = self.get('/api/budget-accounts?include_inactive=true', **self.auth_headers())

        self.assertStatus(200)
        account_names = {acc['name'] for acc in data}
        self.assertIn('Active Account', account_names)
        self.assertIn('Inactive Account', account_names)

    def test_list_ordered_by_display_order_then_name(self):
        """Test listing orders by display_order then name."""
        self.create_budget_account(name='Zebra', display_order=2)
        self.create_budget_account(name='Apple', display_order=1)
        self.create_budget_account(name='Banana', display_order=1)

        data = self.get('/api/budget-accounts', **self.auth_headers())

        self.assertStatus(200)
        names = [acc['name'] for acc in data]
        # Apple and Banana should come before Zebra (display_order 1 vs 2)
        # Apple before Banana alphabetically
        self.assertLess(names.index('Apple'), names.index('Zebra'))
        self.assertLess(names.index('Banana'), names.index('Zebra'))

    def test_list_requires_auth(self):
        """Test listing requires authentication."""
        self.get('/api/budget-accounts')
        self.assertStatus(401)


# =============================================================================
# Get Budget Account
# =============================================================================


class TestGetBudgetAccount(BudgetAccountTestCase):
    """Tests for GET /backend/budget-accounts/{id}."""

    def test_get_account_success(self):
        """Test getting a specific account."""
        account = self.create_budget_account(name='Test Account')

        data = self.get(f'/api/budget-accounts/{account.id}', **self.auth_headers())

        self.assertStatus(200)
        self.assertEqual(data['id'], account.id)
        self.assertEqual(data['name'], 'Test Account')
        self.assertEqual(data['description'], 'Test description')
        self.assertEqual(data['default_currency'], 'PLN')

    def test_get_account_not_found(self):
        """Test getting non-existent account returns 404."""
        fake_id = 999999
        self.get(f'/api/budget-accounts/{fake_id}', **self.auth_headers())
        self.assertStatus(404)

    def test_get_account_from_other_workspace(self):
        """Test getting account from another workspace returns 404."""
        from workspaces.models import Workspace

        # Create another workspace with account
        other_workspace = Workspace.objects.create(name='Other Workspace')
        other_user = User.objects.create_user(
            email='other@example.com',
            password='pass123',
            current_workspace=other_workspace,
        )
        other_account = BudgetAccount.objects.create(
            workspace=other_workspace,
            name='Other Account',
            created_by=other_user,
        )

        # Try to access with first user
        self.get(f'/api/budget-accounts/{other_account.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_get_account_requires_auth(self):
        """Test getting account requires authentication."""
        account = self.create_budget_account()
        self.get(f'/api/budget-accounts/{account.id}')
        self.assertStatus(401)


# =============================================================================
# Create Budget Account
# =============================================================================


class TestCreateBudgetAccount(BudgetAccountTestCase):
    """Tests for POST /backend/budget-accounts."""

    def test_create_account_success(self):
        """Test creating a budget account."""
        data = self.post(
            '/api/budget-accounts',
            {
                'name': 'New Account',
                'description': 'My new account',
                'default_currency': 'USD',
                'color': '#FF0000',
                'icon': '💰',
                'is_active': True,
                'display_order': 5,
            },
            **self.auth_headers(),
        )

        self.assertStatus(201)
        self.assertEqual(data['name'], 'New Account')
        self.assertEqual(data['description'], 'My new account')
        self.assertEqual(data['default_currency'], 'USD')
        self.assertEqual(data['color'], '#FF0000')
        self.assertEqual(data['icon'], '💰')

        # Verify in database
        account = BudgetAccount.objects.get(id=data['id'])
        self.assertEqual(account.created_by, self.user)
        self.assertEqual(account.updated_by, self.user)

    def test_create_account_with_minimal_data(self):
        """Test creating account with only required fields."""
        data = self.post(
            '/api/budget-accounts',
            {
                'name': 'Minimal Account',
            },
            **self.auth_headers(),
        )

        self.assertStatus(201)
        self.assertEqual(data['name'], 'Minimal Account')
        self.assertEqual(data['default_currency'], 'PLN')  # Default
        self.assertTrue(data['is_active'])  # Default
        self.assertEqual(data['display_order'], 0)  # Default

    def test_create_duplicate_name_returns_error(self):
        """Test creating account with duplicate name returns 400."""
        self.create_budget_account(name='Duplicate')

        data = self.post(
            '/api/budget-accounts',
            {
                'name': 'Duplicate',
            },
            **self.auth_headers(),
        )

        self.assertStatus(400)
        self.assertIn('already exists', data['error'].lower())

    def test_create_requires_owner_or_admin_role(self):
        """Test creating account requires owner or admin role."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        self.post(
            '/api/budget-accounts',
            {
                'name': 'Should Fail',
            },
            **self.auth_headers(),
        )

        self.assertStatus(403)

    def test_create_as_member_fails(self):
        """Test that member role cannot create accounts."""
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'member'
        member.save()

        self.post(
            '/api/budget-accounts',
            {
                'name': 'Should Fail',
            },
            **self.auth_headers(),
        )

        self.assertStatus(403)

    def test_create_as_admin_succeeds(self):
        """Test that admin role can create accounts."""
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'admin'
        member.save()

        data = self.post(
            '/api/budget-accounts',
            {
                'name': 'Admin Account',
            },
            **self.auth_headers(),
        )

        self.assertStatus(201)
        self.assertEqual(data['name'], 'Admin Account')

    def test_create_requires_auth(self):
        """Test creating account requires authentication."""
        self.post(
            '/api/budget-accounts',
            {
                'name': 'No Auth',
            },
        )
        self.assertStatus(401)


# =============================================================================
# Update Budget Account
# =============================================================================


class TestUpdateBudgetAccount(BudgetAccountTestCase):
    """Tests for PUT /backend/budget-accounts/{id}."""

    def test_update_account_success(self):
        """Test updating a budget account."""
        account = self.create_budget_account(name='Original Name')

        data = self.put(
            f'/api/budget-accounts/{account.id}',
            {
                'name': 'Updated Name',
                'description': 'Updated description',
                'color': '#00FF00',
            },
            **self.auth_headers(),
        )

        self.assertStatus(200)
        self.assertEqual(data['name'], 'Updated Name')
        self.assertEqual(data['description'], 'Updated description')
        self.assertEqual(data['color'], '#00FF00')

        # Verify in database
        account.refresh_from_db()
        self.assertEqual(account.name, 'Updated Name')
        self.assertEqual(account.updated_by, self.user)

    def test_update_partial_fields(self):
        """Test updating only some fields."""
        account = self.create_budget_account(
            name='Original',
            description='Original description',
            color='#FF0000',
        )

        data = self.put(
            f'/api/budget-accounts/{account.id}',
            {
                'name': 'New Name',
            },
            **self.auth_headers(),
        )

        self.assertStatus(200)
        self.assertEqual(data['name'], 'New Name')
        self.assertEqual(data['description'], 'Original description')  # Unchanged
        self.assertEqual(data['color'], '#FF0000')  # Unchanged

    def test_update_duplicate_name_returns_error(self):
        """Test updating to duplicate name returns error."""
        account1 = self.create_budget_account(name='Account 1')
        account2 = self.create_budget_account(name='Account 2')

        self.put(
            f'/api/budget-accounts/{account1.id}',
            {
                'name': 'Account 2',
            },
            **self.auth_headers(),
        )

        self.assertStatus(400)

    def test_update_account_not_found(self):
        """Test updating non-existent account returns 404."""
        fake_id = 999999
        self.put(
            f'/api/budget-accounts/{fake_id}',
            {
                'name': 'New Name',
            },
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_update_requires_owner_or_admin_role(self):
        """Test updating account requires owner or admin role."""
        account = self.create_budget_account()

        # Change to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        self.put(
            f'/api/budget-accounts/{account.id}',
            {
                'name': 'Should Fail',
            },
            **self.auth_headers(),
        )

        self.assertStatus(403)

    def test_update_as_admin_succeeds(self):
        """Test that admin role can update accounts."""
        account = self.create_budget_account()

        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'admin'
        member.save()

        data = self.put(
            f'/api/budget-accounts/{account.id}',
            {
                'name': 'Admin Update',
            },
            **self.auth_headers(),
        )

        self.assertStatus(200)
        self.assertEqual(data['name'], 'Admin Update')

    def test_update_requires_auth(self):
        """Test updating account requires authentication."""
        account = self.create_budget_account()
        self.put(
            f'/api/budget-accounts/{account.id}',
            {
                'name': 'No Auth',
            },
        )
        self.assertStatus(401)


# =============================================================================
# Delete Budget Account
# =============================================================================


class TestDeleteBudgetAccount(BudgetAccountTestCase):
    """Tests for DELETE /backend/budget-accounts/{id}."""

    def test_delete_account_success(self):
        """Test deleting a budget account."""
        account = self.create_budget_account(name='To Delete')

        self.delete(f'/api/budget-accounts/{account.id}', **self.auth_headers())

        self.assertStatus(204)

        # Verify deleted from database
        self.assertFalse(BudgetAccount.objects.filter(id=account.id).exists())

    def test_delete_account_not_found(self):
        """Test deleting non-existent account returns 404."""
        fake_id = 999999
        self.delete(f'/api/budget-accounts/{fake_id}', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_requires_owner_or_admin_role(self):
        """Test deleting account requires owner or admin role."""
        account = self.create_budget_account()

        # Change to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        self.delete(f'/api/budget-accounts/{account.id}', **self.auth_headers())
        self.assertStatus(403)

        # Account should still exist
        self.assertTrue(BudgetAccount.objects.filter(id=account.id).exists())

    def test_delete_as_admin_succeeds(self):
        """Test that admin role can delete accounts."""
        account = self.create_budget_account()

        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'admin'
        member.save()

        self.delete(f'/api/budget-accounts/{account.id}', **self.auth_headers())
        self.assertStatus(204)

    def test_delete_requires_auth(self):
        """Test deleting account requires authentication."""
        account = self.create_budget_account()
        self.delete(f'/api/budget-accounts/{account.id}')
        self.assertStatus(401)


# =============================================================================
# Archive Budget Account
# =============================================================================


class TestArchiveBudgetAccount(BudgetAccountTestCase):
    """Tests for PATCH /backend/budget-accounts/{id}/archive."""

    def test_archive_active_account(self):
        """Test archiving an active account."""
        account = self.create_budget_account(is_active=True)

        data = self.patch(f'/api/budget-accounts/{account.id}/archive', **self.auth_headers())

        self.assertStatus(200)
        self.assertFalse(data['is_active'])

        account.refresh_from_db()
        self.assertFalse(account.is_active)

    def test_unarchive_inactive_account(self):
        """Test unarchiving an inactive account."""
        account = self.create_budget_account(is_active=False)

        data = self.patch(f'/api/budget-accounts/{account.id}/archive', **self.auth_headers())

        self.assertStatus(200)
        self.assertTrue(data['is_active'])

        account.refresh_from_db()
        self.assertTrue(account.is_active)

    def test_archive_updates_updated_by(self):
        """Test archiving updates the updated_by field."""
        account = self.create_budget_account(is_active=True)
        original_updated_by = account.updated_by

        self.patch(f'/api/budget-accounts/{account.id}/archive', **self.auth_headers())

        account.refresh_from_db()
        self.assertEqual(account.updated_by, self.user)

    def test_archive_account_not_found(self):
        """Test archiving non-existent account returns 404."""
        fake_id = 999999
        self.patch(f'/api/budget-accounts/{fake_id}/archive', **self.auth_headers())
        self.assertStatus(404)

    def test_archive_requires_owner_or_admin_role(self):
        """Test archiving account requires owner or admin role."""
        account = self.create_budget_account(is_active=True)

        # Change to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        self.patch(f'/api/budget-accounts/{account.id}/archive', **self.auth_headers())
        self.assertStatus(403)

        # Account should still be active
        account.refresh_from_db()
        self.assertTrue(account.is_active)

    def test_archive_as_admin_succeeds(self):
        """Test that admin role can archive accounts."""
        account = self.create_budget_account(is_active=True)

        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'admin'
        member.save()

        data = self.patch(f'/api/budget-accounts/{account.id}/archive', **self.auth_headers())
        self.assertStatus(200)
        self.assertFalse(data['is_active'])

    def test_archive_requires_auth(self):
        """Test archiving account requires authentication."""
        account = self.create_budget_account()
        self.patch(f'/api/budget-accounts/{account.id}/archive')
        self.assertStatus(401)
