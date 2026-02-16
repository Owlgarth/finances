"""Tests for categories API endpoints."""

import json
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from categories.models import Category
from common.tests.mixins import APIClientMixin, AuthMixin
from workspaces.models import WorkspaceMember

User = get_user_model()


# =============================================================================
# Base Test Case
# =============================================================================


class CategoriesTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base test case for categories tests with common setup."""

    def setUp(self):
        """Set up authenticated user and create test data."""
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


# =============================================================================
# List Categories Tests
# =============================================================================


class TestListCategories(CategoriesTestCase):
    """Tests for listing categories."""

    def test_list_categories_with_period_id(self):
        """Test listing categories filtered by budget period."""
        data = self.get(f'/api/categories?budget_period_id={self.period1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)
        category_names = {c['name'] for c in data}
        self.assertEqual(category_names, {'Groceries', 'Transport'})

    def test_list_categories_with_current_date(self):
        """Test listing categories using current_date to find period."""
        data = self.get('/api/categories?current_date=2025-01-15', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)
        category_names = {c['name'] for c in data}
        self.assertEqual(category_names, {'Groceries', 'Transport'})

    def test_list_categories_with_current_date_no_period(self):
        """Test listing categories with date that has no period."""
        data = self.get('/api/categories?current_date=2025-05-15', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, [])

    def test_list_categories_without_filters_fails(self):
        """Test that listing without budget_period_id or current_date fails."""
        data = self.get('/api/categories', **self.auth_headers())
        self.assertStatus(400)

    def test_list_categories_from_other_workspace_fails(self):
        """Test that listing categories from another workspace fails."""
        # Create another workspace with period and category
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

        Category.objects.create(
            budget_period=other_period,
            name='Other Category',
            created_by=other_user,
        )

        # Try to access with current user
        data = self.get(f'/api/categories?budget_period_id={other_period.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_list_categories_without_auth_fails(self):
        """Test that listing categories without authentication fails."""
        data = self.get(f'/api/categories?budget_period_id={self.period1.id}')
        self.assertStatus(401)


# =============================================================================
# Get Category Tests
# =============================================================================


class TestGetCategory(CategoriesTestCase):
    """Tests for getting a specific category."""

    def test_get_category_by_id(self):
        """Test getting a category by ID."""
        data = self.get(f'/api/categories/{self.category1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['id'], self.category1.id)
        self.assertEqual(data['name'], 'Groceries')

    def test_get_category_not_found(self):
        """Test getting a non-existent category."""
        data = self.get('/api/categories/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_get_category_from_other_workspace_fails(self):
        """Test that getting a category from another workspace fails."""
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

        data = self.get(f'/api/categories/{other_category.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_get_category_requires_auth(self):
        """Test that getting a category requires authentication."""
        data = self.get(f'/api/categories/{self.category1.id}')
        self.assertStatus(401)


# =============================================================================
# Create Category Tests
# =============================================================================


class TestCreateCategory(CategoriesTestCase):
    """Tests for creating categories."""

    def test_create_category_success(self):
        """Test creating a new category."""
        payload = {
            'name': 'Healthcare',
            'budget_period_id': self.period1.id,
        }
        data = self.post('/api/categories', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['name'], 'Healthcare')
        self.assertEqual(data['budget_period_id'], self.period1.id)

        # Verify category was created in database
        self.assertTrue(
            Category.objects.filter(
                budget_period=self.period1,
                name='Healthcare',
            ).exists()
        )

    def test_create_category_in_different_period(self):
        """Test creating a category in a different period."""
        payload = {
            'name': 'Dining Out',
            'budget_period_id': self.period2.id,
        }
        data = self.post('/api/categories', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['name'], 'Dining Out')

    def test_create_category_duplicate_name_in_period_fails(self):
        """Test that creating a category with duplicate name in period fails."""
        payload = {
            'name': 'Groceries',  # Already exists in period1
            'budget_period_id': self.period1.id,
        }
        data = self.post('/api/categories', payload, **self.auth_headers())
        # Should get a 400 error for duplicate name
        self.assertStatus(400)
        self.assertIn('already exists', data['detail'])

    def test_create_category_with_period_from_other_workspace_fails(self):
        """Test that creating a category with a period from another workspace fails."""
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

        payload = {
            'name': 'Some Category',
            'budget_period_id': other_period.id,
        }
        data = self.post('/api/categories', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_create_category_without_auth_fails(self):
        """Test that creating a category without authentication fails."""
        payload = {
            'name': 'Healthcare',
            'budget_period_id': self.period1.id,
        }
        data = self.post('/api/categories', payload)
        self.assertStatus(401)

    def test_viewer_cannot_create_category(self):
        """Test that a viewer cannot create a category."""
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        payload = {
            'name': 'Healthcare',
            'budget_period_id': self.period1.id,
        }
        data = self.post('/api/categories', payload, **self.auth_headers())
        self.assertStatus(403)

    def test_member_can_create_category(self):
        """Test that a member can create a category."""
        WorkspaceMember.objects.filter(user=self.user).update(role='member')
        payload = {
            'name': 'Healthcare',
            'budget_period_id': self.period1.id,
        }
        data = self.post('/api/categories', payload, **self.auth_headers())
        self.assertStatus(201)


# =============================================================================
# Update Category Tests
# =============================================================================


class TestUpdateCategory(CategoriesTestCase):
    """Tests for updating categories."""

    def test_update_category_name(self):
        """Test updating a category name."""
        payload = {
            'name': 'Food & Groceries',
        }
        data = self.put(f'/api/categories/{self.category1.id}', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Food & Groceries')

        # Verify in database
        self.category1.refresh_from_db()
        self.assertEqual(self.category1.name, 'Food & Groceries')

    def test_update_category_not_found(self):
        """Test updating a non-existent category."""
        payload = {'name': 'New Name'}
        data = self.put('/api/categories/99999', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_update_category_from_other_workspace_fails(self):
        """Test that updating a category from another workspace fails."""
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

        payload = {'name': 'Changed Name'}
        data = self.put(f'/api/categories/{other_category.id}', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_update_category_without_auth_fails(self):
        """Test that updating a category without authentication fails."""
        payload = {'name': 'New Name'}
        data = self.put(f'/api/categories/{self.category1.id}', payload)
        self.assertStatus(401)

    def test_viewer_cannot_update_category(self):
        """Test that a viewer cannot update a category."""
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        payload = {'name': 'New Name'}
        data = self.put(f'/api/categories/{self.category1.id}', payload, **self.auth_headers())
        self.assertStatus(403)


# =============================================================================
# Delete Category Tests
# =============================================================================


class TestDeleteCategory(CategoriesTestCase):
    """Tests for deleting categories."""

    def test_delete_category_success(self):
        """Test deleting a category."""
        category_id = self.category1.id
        self.delete(f'/api/categories/{category_id}', **self.auth_headers())
        self.assertStatus(204)

        # Verify category is deleted
        self.assertFalse(Category.objects.filter(id=category_id).exists())

    def test_delete_category_not_found(self):
        """Test deleting a non-existent category."""
        self.delete('/api/categories/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_category_from_other_workspace_fails(self):
        """Test that deleting a category from another workspace fails."""
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

        self.delete(f'/api/categories/{other_category.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_category_without_auth_fails(self):
        """Test that deleting a category without authentication fails."""
        self.delete(f'/api/categories/{self.category1.id}')
        self.assertStatus(401)

    def test_viewer_cannot_delete_category(self):
        """Test that a viewer cannot delete a category."""
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.delete(f'/api/categories/{self.category1.id}', **self.auth_headers())
        self.assertStatus(403)


# =============================================================================
# Export Categories Tests
# =============================================================================


class TestExportCategories(CategoriesTestCase):
    """Tests for exporting categories."""

    def test_export_categories_success(self):
        """Test exporting categories from a budget period."""
        data = self.get(f'/api/categories/export/?budget_period_id={self.period1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)
        self.assertIn('Groceries', data)
        self.assertIn('Transport', data)

    def test_export_categories_empty_period(self):
        """Test exporting categories from a period with no categories."""
        empty_period = BudgetPeriod.objects.create(
            budget_account=self.workspace.budget_accounts.first(),
            name='Empty Period',
            start_date=date(2025, 5, 1),
            end_date=date(2025, 5, 31),
            created_by=self.user,
        )

        data = self.get(f'/api/categories/export/?budget_period_id={empty_period.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, [])

    def test_export_categories_from_other_workspace_fails(self):
        """Test that exporting categories from another workspace fails."""
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

        Category.objects.create(
            budget_period=other_period,
            name='Other Category',
            created_by=other_user,
        )

        data = self.get(f'/api/categories/export/?budget_period_id={other_period.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_export_categories_without_auth_fails(self):
        """Test that exporting categories without authentication fails."""
        data = self.get(f'/api/categories/export/?budget_period_id={self.period1.id}')
        self.assertStatus(401)


# =============================================================================
# Import Categories Tests
# =============================================================================


class TestImportCategories(CategoriesTestCase):
    """Tests for importing categories."""

    def post_file(self, path: str, file_data: dict, **kwargs) -> object:
        """Helper for POST requests with file upload."""
        response = self.client.post(path, **kwargs, data=file_data)
        self.response = response
        return response.json() if response.content else {}

    def test_import_categories_success(self):
        """Test importing categories from a JSON file."""
        categories_data = json.dumps(['Dining Out', 'Healthcare', 'Insurance'])
        file = SimpleUploadedFile(
            'categories.json',
            categories_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': self.period2.id},
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertIn('Successfully imported 3 new categories', data['message'])

        # Verify categories were created
        self.assertEqual(Category.objects.filter(budget_period=self.period2).count(), 4)  # 1 existing + 3 new
        self.assertTrue(Category.objects.filter(budget_period=self.period2, name='Dining Out').exists())

    def test_import_categories_skips_duplicates(self):
        """Test that importing skips duplicate category names."""
        categories_data = json.dumps(['Groceries', 'Transport', 'New Category'])
        file = SimpleUploadedFile(
            'categories.json',
            categories_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': self.period1.id},
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertIn('Successfully imported 1 new categories', data['message'])

        # Verify only new category was created
        self.assertEqual(Category.objects.filter(budget_period=self.period1).count(), 3)  # 2 existing + 1 new
        self.assertTrue(Category.objects.filter(budget_period=self.period1, name='New Category').exists())

    def test_import_categories_all_duplicates(self):
        """Test importing when all categories already exist."""
        categories_data = json.dumps(['Groceries', 'Transport'])
        file = SimpleUploadedFile(
            'categories.json',
            categories_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': self.period1.id},
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertEqual(data['message'], 'No new categories to import.')

    def test_import_categories_invalid_json(self):
        """Test importing with invalid JSON file."""
        file = SimpleUploadedFile(
            'categories.json',
            b'not valid json',
            content_type='application/json',
        )

        data = self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': self.period1.id},
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_import_categories_invalid_format(self):
        """Test importing with invalid format (not a list of strings)."""
        categories_data = json.dumps({'not': 'a list'})
        file = SimpleUploadedFile(
            'categories.json',
            categories_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': self.period1.id},
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_import_categories_invalid_file_type(self):
        """Test importing with non-JSON file."""
        file = SimpleUploadedFile(
            'categories.txt',
            b'some text content',
            content_type='text/plain',
        )

        data = self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': self.period1.id},
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_import_categories_from_other_workspace_fails(self):
        """Test that importing categories to another workspace's period fails."""
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

        categories_data = json.dumps(['New Category'])
        file = SimpleUploadedFile(
            'categories.json',
            categories_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': other_period.id},
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_import_categories_without_auth_fails(self):
        """Test that importing categories without authentication fails."""
        categories_data = json.dumps(['New Category'])
        file = SimpleUploadedFile(
            'categories.json',
            categories_data.encode('utf-8'),
            content_type='application/json',
        )

        self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': self.period1.id},
        )
        self.assertStatus(401)

    def test_viewer_cannot_import_categories(self):
        """Test that a viewer cannot import categories."""
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        categories_data = json.dumps(['New Category'])
        file = SimpleUploadedFile(
            'categories.json',
            categories_data.encode('utf-8'),
            content_type='application/json',
        )

        self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': self.period1.id},
            **self.auth_headers(),
        )
        self.assertStatus(403)

    def test_import_categories_duplicates_within_file(self):
        """Test that importing handles duplicates within the file itself."""
        categories_data = json.dumps(['New1', 'New2', 'New1', 'New2'])
        file = SimpleUploadedFile(
            'categories.json',
            categories_data.encode('utf-8'),
            content_type='application/json',
        )

        data = self.post_file(
            '/api/categories/import',
            {'file': file, 'budget_period_id': self.period2.id},
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertIn('Successfully imported 2 new categories', data['message'])

        # Verify only 2 unique categories were created
        self.assertEqual(Category.objects.filter(budget_period=self.period2).count(), 3)  # 1 existing + 2 new
