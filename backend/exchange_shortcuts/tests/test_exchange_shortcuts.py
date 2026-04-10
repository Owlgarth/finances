"""Tests for exchange_shortcuts API endpoints."""

from django.test import TestCase, override_settings

from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from exchange_shortcuts.factories import ExchangeShortcutFactory
from exchange_shortcuts.models import ExchangeShortcut
from workspaces.factories import WorkspaceFactory
from workspaces.models import WorkspaceMember

# =============================================================================
# List Exchange Shortcuts Tests
# =============================================================================


class TestListShortcuts(AuthMixin, APIClientMixin, TestCase):
    """Tests for GET /api/exchange-shortcuts."""

    def test_returns_empty_list_when_no_shortcuts(self):
        """List returns empty array when no shortcuts exist."""
        data = self.get('/api/exchange-shortcuts', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, [])

    def test_returns_shortcuts_for_workspace(self):
        """List returns shortcuts belonging to the current workspace."""
        ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )
        ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='USD',
            to_currency='PLN',
        )

        data = self.get('/api/exchange-shortcuts', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)

        pairs = {(s['from_currency'], s['to_currency']) for s in data}
        self.assertIn(('PLN', 'USD'), pairs)
        self.assertIn(('USD', 'PLN'), pairs)

    def test_does_not_return_other_workspace_shortcuts(self):
        """List does not return shortcuts from another workspace."""
        # Create shortcut in the auth workspace
        ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )

        # Create shortcut in a different workspace
        other_workspace = WorkspaceFactory(name='Other Workspace')
        ExchangeShortcutFactory(
            workspace=other_workspace,
            from_currency='EUR',
            to_currency='USD',
        )

        data = self.get('/api/exchange-shortcuts', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['from_currency'], 'PLN')
        self.assertEqual(data[0]['to_currency'], 'USD')


# =============================================================================
# Create Exchange Shortcut Tests
# =============================================================================


class TestCreateShortcut(AuthMixin, APIClientMixin, TestCase):
    """Tests for POST /api/exchange-shortcuts."""

    user_role = 'member'

    def test_create_shortcut_succeeds(self):
        """Create shortcut with valid data returns 201."""
        data = self.post(
            '/api/exchange-shortcuts',
            {'from_currency': 'PLN', 'to_currency': 'USD'},
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertEqual(data['from_currency'], 'PLN')
        self.assertEqual(data['to_currency'], 'USD')
        self.assertIn('id', data)
        self.assertIn('created_at', data)

        # Verify in database
        self.assertTrue(
            ExchangeShortcut.objects.filter(
                workspace=self.workspace,
                from_currency='PLN',
                to_currency='USD',
            ).exists()
        )

    def test_rejects_same_currency(self):
        """Create rejects when from_currency equals to_currency."""
        self.post(
            '/api/exchange-shortcuts',
            {'from_currency': 'PLN', 'to_currency': 'PLN'},
            **self.auth_headers(),
        )
        self.assertStatus(422)  # Pydantic validation error

    def test_rejects_duplicate_pair(self):
        """Create rejects when the same currency pair already exists."""
        ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )

        data = self.post(
            '/api/exchange-shortcuts',
            {'from_currency': 'PLN', 'to_currency': 'USD'},
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(data['detail'], 'This currency pair shortcut already exists')

    def test_rejects_currency_not_in_workspace(self):
        """Create rejects a currency that doesn't exist in the workspace."""
        data = self.post(
            '/api/exchange-shortcuts',
            {'from_currency': 'GBP', 'to_currency': 'PLN'},
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(data['detail'], 'Currency GBP not found in workspace')

    @override_settings(EXCHANGE_SHORTCUTS_MAX_PER_WORKSPACE=2)
    def test_rejects_exceeding_limit(self):
        """Create rejects when workspace already has the maximum number of shortcuts."""
        ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )
        ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='USD',
            to_currency='PLN',
        )

        self.post(
            '/api/exchange-shortcuts',
            {'from_currency': 'PLN', 'to_currency': 'USD'},
            **self.auth_headers(),
        )
        # Both directions exist, so this is a duplicate — 400 either way
        self.assertStatus(400)

    @override_settings(EXCHANGE_SHORTCUTS_MAX_PER_WORKSPACE=1)
    def test_rejects_exceeding_limit_with_distinct_pair(self):
        """Create rejects when exceeding the limit with a new, non-duplicate pair."""
        ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )

        data = self.post(
            '/api/exchange-shortcuts',
            {'from_currency': 'USD', 'to_currency': 'PLN'},
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(data['detail'], 'Exchange shortcut limit reached for this workspace')

    def test_viewer_cannot_create(self):
        """Create returns 403 for viewer role."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        self.post(
            '/api/exchange-shortcuts',
            {'from_currency': 'PLN', 'to_currency': 'USD'},
            **self.auth_headers(),
        )
        self.assertStatus(403)


# =============================================================================
# Update Exchange Shortcut Tests
# =============================================================================


class TestUpdateShortcut(AuthMixin, APIClientMixin, TestCase):
    """Tests for PUT /api/exchange-shortcuts/{id}."""

    user_role = 'member'

    def test_update_shortcut_succeeds(self):
        """Update shortcut with valid data returns 200."""
        shortcut = ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )

        data = self.put(
            f'/api/exchange-shortcuts/{shortcut.id}',
            {'from_currency': 'USD', 'to_currency': 'PLN'},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['from_currency'], 'USD')
        self.assertEqual(data['to_currency'], 'PLN')

        # Verify in database
        shortcut.refresh_from_db()
        self.assertEqual(shortcut.from_currency, 'USD')
        self.assertEqual(shortcut.to_currency, 'PLN')

    def test_update_rejects_duplicate_pair_excluding_self(self):
        """Update rejects when another shortcut already has the target pair."""
        shortcut1 = ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )
        ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='USD',
            to_currency='PLN',
        )

        # Try to update shortcut1 to have the same pair as shortcut2
        data = self.put(
            f'/api/exchange-shortcuts/{shortcut1.id}',
            {'from_currency': 'USD', 'to_currency': 'PLN'},
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(data['detail'], 'This currency pair shortcut already exists')

    def test_update_same_pair_succeeds(self):
        """Update succeeds when setting the same pair (no-op for duplicate check)."""
        shortcut = ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )

        data = self.put(
            f'/api/exchange-shortcuts/{shortcut.id}',
            {'from_currency': 'PLN', 'to_currency': 'USD'},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['from_currency'], 'PLN')
        self.assertEqual(data['to_currency'], 'USD')

    def test_update_rejects_same_currency(self):
        """Update rejects when from_currency equals to_currency."""
        shortcut = ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )

        self.put(
            f'/api/exchange-shortcuts/{shortcut.id}',
            {'from_currency': 'PLN', 'to_currency': 'PLN'},
            **self.auth_headers(),
        )
        self.assertStatus(422)  # Pydantic validation error


# =============================================================================
# Delete Exchange Shortcut Tests
# =============================================================================


class TestDeleteShortcut(AuthMixin, APIClientMixin, TestCase):
    """Tests for DELETE /api/exchange-shortcuts/{id}."""

    user_role = 'member'

    def test_delete_shortcut_succeeds(self):
        """Delete shortcut returns 204 and removes from database."""
        shortcut = ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )
        shortcut_id = shortcut.id

        self.delete(f'/api/exchange-shortcuts/{shortcut_id}', **self.auth_headers())
        self.assertStatus(204)

        # Verify deleted from database
        self.assertFalse(ExchangeShortcut.objects.filter(id=shortcut_id).exists())

    def test_delete_nonexistent_returns_404(self):
        """Delete returns 404 for non-existent shortcut ID."""
        self.delete('/api/exchange-shortcuts/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_viewer_cannot_delete(self):
        """Delete returns 403 for viewer role."""
        shortcut = ExchangeShortcutFactory(
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            from_currency='PLN',
            to_currency='USD',
        )

        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        self.delete(f'/api/exchange-shortcuts/{shortcut.id}', **self.auth_headers())
        self.assertStatus(403)


# =============================================================================
# Cross-Workspace Isolation Tests
# =============================================================================


class TestShortcutCrossWorkspace(AuthMixin, APIClientMixin, TestCase):
    """Tests verifying shortcuts from other workspaces are not accessible."""

    user_role = 'member'

    def setUp(self):
        super().setUp()
        self.other_workspace = WorkspaceFactory(name='Other Workspace')
        self.other_user = UserFactory(
            email='other@example.com', full_name='Other User', current_workspace=self.other_workspace
        )
        WorkspaceMember.objects.create(workspace=self.other_workspace, user=self.other_user, role='owner')
        self.other_workspace.owner = self.other_user
        self.other_workspace.save()

        self.other_shortcut = ExchangeShortcutFactory(
            workspace=self.other_workspace,
            created_by=self.other_user,
            updated_by=self.other_user,
            from_currency='PLN',
            to_currency='USD',
        )

    def test_get_other_workspace_shortcut_returns_404(self):
        """List does not include shortcuts from other workspaces (empty result, not error)."""
        # GET is a list endpoint, so it returns only this workspace's shortcuts
        data = self.get('/api/exchange-shortcuts', **self.auth_headers())
        self.assertStatus(200)
        # The other workspace's shortcut should not appear
        ids = [s['id'] for s in data]
        self.assertNotIn(self.other_shortcut.id, ids)

    def test_update_other_workspace_shortcut_returns_404(self):
        """Update returns 404 for shortcut belonging to another workspace."""
        self.put(
            f'/api/exchange-shortcuts/{self.other_shortcut.id}',
            {'from_currency': 'USD', 'to_currency': 'PLN'},
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_delete_other_workspace_shortcut_returns_404(self):
        """Delete returns 404 for shortcut belonging to another workspace."""
        self.delete(f'/api/exchange-shortcuts/{self.other_shortcut.id}', **self.auth_headers())
        self.assertStatus(404)

        # Verify the shortcut still exists in the other workspace
        self.assertTrue(ExchangeShortcut.objects.filter(id=self.other_shortcut.id).exists())
