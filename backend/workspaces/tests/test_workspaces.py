"""Tests for workspaces and workspace_members API endpoints."""

from datetime import date

from django.test import TestCase

from budget_periods.factories import BudgetPeriodFactory
from budgets.factories import BudgetFactory
from categories.factories import CategoryFactory
from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.models import Workspace, WorkspaceMember

# =============================================================================
# Base Test Class
# =============================================================================


class WorkspaceTestCase(APIClientMixin, AuthMixin, TestCase):
    """Base test case for workspace tests with authenticated user and data."""

    def setUp(self):
        """Set up test data for workspace API tests."""
        APIClientMixin.setUp(self)
        AuthMixin.setUp(self)

        self.admin_user = UserFactory(
            email='admin@example.com',
            current_workspace=self.workspace,
        )
        WorkspaceMemberFactory(
            workspace=self.workspace,
            user=self.admin_user,
            role='admin',
        )

        self.member_user = UserFactory(
            email='member@example.com',
            current_workspace=self.workspace,
        )
        WorkspaceMemberFactory(
            workspace=self.workspace,
            user=self.member_user,
            role='member',
        )

        self.viewer_user = UserFactory(
            email='viewer@example.com',
            current_workspace=self.workspace,
        )
        WorkspaceMemberFactory(
            workspace=self.workspace,
            user=self.viewer_user,
            role='viewer',
        )

        self.other_workspace = WorkspaceFactory(name='Other Workspace')
        WorkspaceMemberFactory(
            workspace=self.other_workspace,
            user=self.user,
            role='admin',
        )

    def create_token_for_user(self, user):
        """Helper to create JWT token for a user."""
        from common.auth import create_access_token

        return create_access_token(user)


# =============================================================================
# List Workspaces Tests
# =============================================================================


class TestListWorkspaces(WorkspaceTestCase):
    """Tests for GET /backend/workspaces."""

    def test_list_returns_all_user_workspaces(self):
        """Test listing all workspaces the user has access to."""
        data = self.get('/api/workspaces', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)  # User is member of 2 workspaces

    def test_list_without_auth_returns_401(self):
        """Test that listing workspaces without authentication fails."""
        self.get('/api/workspaces')
        self.assertStatus(401)


# =============================================================================
# Get Current Workspace Tests
# =============================================================================


class TestGetCurrentWorkspace(WorkspaceTestCase):
    """Tests for GET /backend/workspaces/current."""

    def test_get_current_workspace_success(self):
        """Test getting current workspace details."""
        data = self.get('/api/workspaces/current', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['id'], self.workspace.id)
        self.assertEqual(data['name'], self.workspace_name)

    def test_get_current_workspace_includes_user_role(self):
        """GET /current should include user_role in the response."""
        data = self.get('/api/workspaces/current', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['user_role'], 'owner')

    def test_get_current_workspace_without_auth_fails(self):
        """Test that getting current workspace without authentication fails."""
        self.get('/api/workspaces/current')
        self.assertStatus(401)

    def test_get_current_workspace_returns_403_when_not_a_member(self):
        """A user with current_workspace_id set but no membership should get 403."""
        from common.auth import create_access_token

        user = UserFactory(current_workspace=self.workspace)
        token = create_access_token(user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.get('/api/workspaces/current', **headers)
        self.assertStatus(403)


# =============================================================================
# Update Current Workspace Tests
# =============================================================================


class TestUpdateCurrentWorkspace(WorkspaceTestCase):
    """Tests for PUT /backend/workspaces/current."""

    def test_update_workspace_as_owner_success(self):
        """Test updating workspace name as owner."""
        payload = {'name': 'Updated Workspace Name'}
        data = self.put('/api/workspaces/current', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Updated Workspace Name')

    def test_update_workspace_as_admin_success(self):
        """Test updating workspace name as admin."""
        self.admin_user.current_workspace = self.workspace
        self.admin_user.save()

        token = self.create_token_for_user(self.admin_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'name': 'Admin Updated Name'}
        data = self.put('/api/workspaces/current', payload, **headers)
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Admin Updated Name')

    def test_update_workspace_as_member_fails(self):
        """Test that member cannot update workspace."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'name': 'Should Not Work'}
        self.put('/api/workspaces/current', payload, **headers)
        self.assertStatus(403)

    def test_update_workspace_response_includes_user_role(self):
        """PUT /current should include user_role in the response."""
        payload = {'name': 'Updated Name'}
        data = self.put('/api/workspaces/current', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['user_role'], 'owner')

    def test_update_workspace_without_auth_fails(self):
        """Test that updating workspace without authentication fails."""
        payload = {'name': 'Should Not Work'}
        self.put('/api/workspaces/current', payload)
        self.assertStatus(401)


# =============================================================================
# Switch Workspace Tests
# =============================================================================


class TestSwitchWorkspace(WorkspaceTestCase):
    """Tests for POST /backend/workspaces/{workspace_id}/switch."""

    def test_switch_workspace_success(self):
        """Test switching to another workspace."""
        data = self.post(f'/api/workspaces/{self.other_workspace.id}/switch', {}, **self.auth_headers())
        self.assertStatus(200)
        self.assertIn('message', data)

        # Verify user's current workspace was updated
        self.user.refresh_from_db()
        self.assertEqual(self.user.current_workspace_id, self.other_workspace.id)

    def test_switch_to_workspace_without_access_fails(self):
        """Test that switching to workspace without access fails."""
        # Create a workspace the user is not a member of
        forbidden_workspace = WorkspaceFactory(name='Forbidden Workspace')

        self.post(f'/api/workspaces/{forbidden_workspace.id}/switch', {}, **self.auth_headers())
        self.assertStatus(404)

    def test_switch_workspace_without_auth_fails(self):
        """Test that switching workspace without authentication fails."""
        self.post(f'/api/workspaces/{self.other_workspace.id}/switch', {})
        self.assertStatus(401)


# =============================================================================
# List Workspace Members Tests
# =============================================================================


class TestListWorkspaceMembers(WorkspaceTestCase):
    """Tests for GET /backend/workspaces/{workspace_id}/members."""

    def test_list_members_success(self):
        """Test listing all members in workspace."""
        data = self.get(f'/api/workspaces/{self.workspace.id}/members', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 4)  # owner, admin, member, viewer

    def test_list_members_ordered_by_role(self):
        """Test that members are ordered by role (alphabetically, then email)."""
        data = self.get(f'/api/workspaces/{self.workspace.id}/members', **self.auth_headers())
        self.assertStatus(200)
        # Ordering is alphabetical descending on role name (viewer > owner > member > admin)
        roles = [m['role'] for m in data]
        # Should be in descending alphabetical order
        self.assertEqual(roles, sorted(roles, reverse=True))

    def test_list_members_without_access_fails(self):
        """Test that listing members without workspace access fails."""
        # Create a user who is not a member of the workspace
        non_member = UserFactory(current_workspace=None)
        token = self.create_token_for_user(non_member)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.get(f'/api/workspaces/{self.workspace.id}/members', **headers)
        self.assertStatus(404)

    def test_list_members_without_auth_fails(self):
        """Test that listing members without authentication fails."""
        self.get(f'/api/workspaces/{self.workspace.id}/members')
        self.assertStatus(401)


# =============================================================================
# Add Member to Workspace Tests
# =============================================================================


class TestAddMemberToWorkspace(WorkspaceTestCase):
    """Tests for POST /backend/workspaces/{workspace_id}/members/add."""

    def test_add_new_user_as_member(self):
        """Test adding a completely new user to workspace."""
        initial_member_count = WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count()

        payload = {
            'email': 'newuser@example.com',
            'password': 'newpass123',
            'full_name': 'New User',
            'role': 'member',
        }
        data = self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())

        self.assertStatus(201)
        self.assertTrue(data['is_new_user'])
        self.assertIn('user_id', data)

        # Verify membership was created
        self.assertEqual(
            WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count(),
            initial_member_count + 1,
        )

    def test_add_existing_user_as_member(self):
        """Test adding an existing user to workspace."""
        UserFactory(email='existing@example.com')

        initial_member_count = WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count()

        payload = {
            'email': 'existing@example.com',
            'password': 'ignored123',
            'full_name': 'Existing User',
            'role': 'viewer',
        }
        data = self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())

        self.assertStatus(201)
        self.assertFalse(data['is_new_user'])

        # Verify membership was created
        self.assertEqual(
            WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count(),
            initial_member_count + 1,
        )

    def test_add_already_member_fails(self):
        """Test that adding a user who is already a member fails."""
        payload = {
            'email': 'admin@example.com',
            'password': 'password123',
            'full_name': 'Admin User',
            'role': 'member',
        }
        self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_add_member_as_admin_succeeds(self):
        """Test that admin can add members."""
        self.admin_user.current_workspace = self.workspace
        self.admin_user.save()

        token = self.create_token_for_user(self.admin_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {
            'email': 'byadmin@example.com',
            'password': 'pass1234',  # Must be at least 8 characters
            'role': 'member',
        }
        self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload, **headers)
        self.assertStatus(201)

    def test_add_member_as_member_fails(self):
        """Test that regular member cannot add new members."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {
            'email': 'shouldfail@example.com',
            'password': 'pass1234',  # Must be at least 8 characters
            'role': 'viewer',
        }
        self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload, **headers)
        self.assertStatus(403)

    def test_add_existing_user_without_password_succeeds(self):
        """Existing user can be added without providing a password."""
        UserFactory(email='nopwd@example.com')
        payload = {'email': 'nopwd@example.com', 'role': 'viewer'}
        data = self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertFalse(data['is_new_user'])

    def test_add_existing_user_does_not_change_their_current_workspace(self):
        """Adding an existing user to a workspace does not change their current_workspace."""
        existing = UserFactory(email='e@example.com')
        original_ws = WorkspaceFactory(name='Original')
        existing.current_workspace = original_ws
        existing.save()

        payload = {'email': 'e@example.com', 'role': 'viewer'}
        self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())
        self.assertStatus(201)

        existing.refresh_from_db()
        self.assertEqual(existing.current_workspace, original_ws)

    def test_add_new_user_without_password_fails(self):
        """New user cannot be created without a password."""
        payload = {'email': 'brand_new@example.com', 'role': 'member'}
        data = self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())
        self.assertStatus(400)
        self.assertIn('Password', data['detail'])

    def test_add_member_without_auth_fails(self):
        """Test that adding member without authentication fails."""
        payload = {
            'email': 'test@example.com',
            'password': 'password123',
            'role': 'viewer',
        }
        self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload)
        self.assertStatus(401)

    def test_add_new_user_with_short_password_fails(self):
        """New user with password shorter than 8 chars should return 422."""
        payload = {
            'email': 'short_pwd@example.com',
            'password': 'abc',
            'role': 'member',
        }
        self.post(f'/api/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())
        self.assertStatus(422)


# =============================================================================
# Update Member Role Tests
# =============================================================================


class TestUpdateMemberRole(WorkspaceTestCase):
    """Tests for PUT /backend/workspaces/{workspace_id}/members/{member_user_id}/role."""

    def test_update_role_as_owner_success(self):
        """Test updating member role as owner."""
        payload = {'role': 'viewer'}
        data = self.put(
            f'/api/workspaces/{self.workspace.id}/members/{self.member_user.id}/role', payload, **self.auth_headers()
        )
        self.assertStatus(200)
        self.assertEqual(data['new_role'], 'viewer')

    def test_update_own_role_fails(self):
        """Test that updating your own role fails."""
        payload = {'role': 'admin'}
        self.put(f'/api/workspaces/{self.workspace.id}/members/{self.user.id}/role', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_update_owner_role_fails(self):
        """Test that changing owner role fails."""
        payload = {'role': 'admin'}
        self.put(f'/api/workspaces/{self.workspace.id}/members/{self.user.id}/role', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_admin_cannot_update_other_admin(self):
        """Test that admin cannot update another admin's role."""
        # Promote member_user to admin
        member = WorkspaceMember.objects.get(
            workspace_id=self.workspace.id,
            user_id=self.member_user.id,
        )
        member.role = 'admin'
        member.save()

        self.admin_user.current_workspace = self.workspace
        self.admin_user.save()

        token = self.create_token_for_user(self.admin_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'role': 'member'}
        self.put(f'/api/workspaces/{self.workspace.id}/members/{self.member_user.id}/role', payload, **headers)
        self.assertStatus(403)

    def test_update_role_as_member_fails(self):
        """Test that regular member cannot update roles."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'role': 'viewer'}
        self.put(f'/api/workspaces/{self.workspace.id}/members/{self.viewer_user.id}/role', payload, **headers)
        self.assertStatus(403)


# =============================================================================
# Remove Member from Workspace Tests
# =============================================================================


class TestRemoveMemberFromWorkspace(WorkspaceTestCase):
    """Tests for DELETE /backend/workspaces/{workspace_id}/members/{member_user_id}."""

    def test_remove_member_as_owner_success(self):
        """Test removing a member as owner."""
        initial_count = WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count()

        self.delete(f'/api/workspaces/{self.workspace.id}/members/{self.viewer_user.id}', **self.auth_headers())
        self.assertStatus(204)

        self.assertEqual(
            WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count(),
            initial_count - 1,
        )

    def test_remove_member_clears_current_workspace(self):
        """Test that removing a member clears their current_workspace_id if it points to this workspace."""
        self.viewer_user.current_workspace = self.workspace
        self.viewer_user.save()

        self.delete(f'/api/workspaces/{self.workspace.id}/members/{self.viewer_user.id}', **self.auth_headers())
        self.assertStatus(204)

        self.viewer_user.refresh_from_db()
        self.assertIsNone(self.viewer_user.current_workspace_id)

    def test_remove_member_switches_to_other_workspace(self):
        """Test that removed member is switched to another workspace if available."""
        other_ws = WorkspaceFactory(name='Other WS')
        WorkspaceMemberFactory(workspace=other_ws, user=self.viewer_user, role='member')

        self.viewer_user.current_workspace = self.workspace
        self.viewer_user.save()

        self.delete(f'/api/workspaces/{self.workspace.id}/members/{self.viewer_user.id}', **self.auth_headers())
        self.assertStatus(204)

        self.viewer_user.refresh_from_db()
        self.assertEqual(self.viewer_user.current_workspace_id, other_ws.id)

    def test_remove_member_preserves_current_workspace_if_different(self):
        """Test that removing a member doesn't change their current_workspace if it points elsewhere."""
        other_ws = WorkspaceFactory(name='Other WS')
        WorkspaceMemberFactory(workspace=other_ws, user=self.viewer_user, role='member')

        self.viewer_user.current_workspace = other_ws
        self.viewer_user.save()

        self.delete(f'/api/workspaces/{self.workspace.id}/members/{self.viewer_user.id}', **self.auth_headers())
        self.assertStatus(204)

        self.viewer_user.refresh_from_db()
        self.assertEqual(self.viewer_user.current_workspace_id, other_ws.id)

    def test_remove_yourself_fails(self):
        """Test that removing yourself fails."""
        self.delete(f'/api/workspaces/{self.workspace.id}/members/{self.user.id}', **self.auth_headers())
        self.assertStatus(400)

    def test_remove_owner_fails(self):
        """Test that removing owner fails."""
        self.delete(f'/api/workspaces/{self.workspace.id}/members/{self.user.id}', **self.auth_headers())
        self.assertStatus(400)

    def test_admin_cannot_remove_other_admin(self):
        """Test that admin cannot remove another admin."""
        # Promote member_user to admin
        member = WorkspaceMember.objects.get(
            workspace_id=self.workspace.id,
            user_id=self.member_user.id,
        )
        member.role = 'admin'
        member.save()

        self.admin_user.current_workspace = self.workspace
        self.admin_user.save()

        token = self.create_token_for_user(self.admin_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.delete(f'/api/workspaces/{self.workspace.id}/members/{self.member_user.id}', **headers)
        self.assertStatus(403)

    def test_remove_member_as_member_fails(self):
        """Test that regular member cannot remove other members."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.delete(f'/api/workspaces/{self.workspace.id}/members/{self.viewer_user.id}', **headers)
        self.assertStatus(403)


# =============================================================================
# Leave Workspace Tests
# =============================================================================


class TestLeaveWorkspace(WorkspaceTestCase):
    """Tests for POST /backend/workspaces/{workspace_id}/members/leave."""

    def test_leave_workspace_as_member_success(self):
        """Test leaving workspace as member."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        initial_count = WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count()

        self.post(f'/api/workspaces/{self.workspace.id}/members/leave', {}, **headers)
        self.assertStatus(200)

        self.assertEqual(
            WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count(),
            initial_count - 1,
        )

        self.member_user.refresh_from_db()
        self.assertIsNone(self.member_user.current_workspace_id)

    def test_leave_only_workspace_as_member_sets_current_workspace_to_none(self):
        """Member can leave their only workspace; current_workspace becomes None."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.post(f'/api/workspaces/{self.workspace.id}/members/leave', {}, **headers)
        self.assertStatus(200)

        self.member_user.refresh_from_db()
        self.assertIsNone(self.member_user.current_workspace_id)

    def test_leave_workspace_as_owner_fails(self):
        """Test that owner cannot leave workspace."""
        self.post(f'/api/workspaces/{self.workspace.id}/members/leave', {}, **self.auth_headers())
        self.assertStatus(400)

    def test_leave_workspace_without_auth_fails(self):
        """Test that leaving workspace without authentication fails."""
        self.post(f'/api/workspaces/{self.workspace.id}/members/leave', {})
        self.assertStatus(401)


# =============================================================================
# Reset Member Password Tests
# =============================================================================


class TestResetMemberPassword(WorkspaceTestCase):
    """Tests for PUT /backend/workspaces/{workspace_id}/members/{user_id}/reset-password."""

    def test_reset_password_as_owner_success(self):
        """Test resetting member password as owner."""
        payload = {'new_password': 'newpassword123'}
        data = self.put(
            f'/api/workspaces/{self.workspace.id}/members/{self.member_user.id}/reset-password',
            payload,
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertIn('message', data)

        # Verify password was actually changed
        self.member_user.refresh_from_db()
        self.assertTrue(self.member_user.check_password('newpassword123'))

    def test_reset_own_password_fails(self):
        """Test that resetting your own password fails."""
        payload = {'new_password': 'newpassword123'}
        self.put(
            f'/api/workspaces/{self.workspace.id}/members/{self.user.id}/reset-password', payload, **self.auth_headers()
        )
        self.assertStatus(400)

    def test_reset_owner_password_fails(self):
        """Test that resetting owner's password fails."""
        payload = {'new_password': 'newpassword123'}
        self.put(
            f'/api/workspaces/{self.workspace.id}/members/{self.user.id}/reset-password', payload, **self.auth_headers()
        )
        self.assertStatus(400)

    def test_admin_cannot_reset_other_admin_password(self):
        """Test that admin cannot reset another admin's password."""
        # Make the target user an admin
        member = WorkspaceMember.objects.get(
            workspace_id=self.workspace.id,
            user_id=self.member_user.id,
        )
        member.role = 'admin'
        member.save()

        self.admin_user.current_workspace = self.workspace
        self.admin_user.save()

        token = self.create_token_for_user(self.admin_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'new_password': 'newpassword123'}
        self.put(
            f'/api/workspaces/{self.workspace.id}/members/{self.member_user.id}/reset-password', payload, **headers
        )
        self.assertStatus(403)

    def test_reset_password_as_member_fails(self):
        """Test that regular member cannot reset passwords."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'new_password': 'newpassword123'}
        self.put(
            f'/api/workspaces/{self.workspace.id}/members/{self.viewer_user.id}/reset-password', payload, **headers
        )
        self.assertStatus(403)


# =============================================================================
# Create Workspace Tests
# =============================================================================


class TestCreateWorkspace(APIClientMixin, TestCase):
    """Tests for POST /api/workspaces/."""

    def setUp(self):
        """Set up test data."""
        APIClientMixin.setUp(self)
        self.user = UserFactory()
        from common.auth import create_access_token

        self.auth_token = create_access_token(self.user)

    def auth_headers(self):
        """Get auth headers for authenticated requests."""
        return {'HTTP_AUTHORIZATION': f'Bearer {self.auth_token}'}

    def test_create_workspace_returns_201(self):
        """Test that creating workspace returns 201 with WorkspaceOut."""
        payload = {'name': 'New Workspace'}
        data = self.post('/api/workspaces/', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['name'], 'New Workspace')
        self.assertEqual(data['user_role'], 'owner')
        self.assertIn('id', data)

    def test_create_workspace_sets_current_workspace(self):
        """Test that creating workspace sets user.current_workspace."""
        payload = {'name': 'New Workspace'}
        self.post('/api/workspaces/', payload, **self.auth_headers())
        self.assertStatus(201)

        self.user.refresh_from_db()
        self.assertEqual(self.user.current_workspace.name, 'New Workspace')

    def test_create_workspace_without_auth_fails(self):
        """Test that creating workspace without authentication fails."""
        payload = {'name': 'New Workspace'}
        self.post('/api/workspaces/', payload)
        self.assertStatus(401)

    def test_create_workspace_with_blank_name_fails(self):
        """Test that creating a workspace with blank name returns 422."""
        payload = {'name': '   '}
        self.post('/api/workspaces/', payload, **self.auth_headers())
        self.assertStatus(422)

    def test_create_workspace_with_empty_name_fails(self):
        """Test that creating a workspace with empty name returns 422."""
        payload = {'name': ''}
        self.post('/api/workspaces/', payload, **self.auth_headers())
        self.assertStatus(422)


# =============================================================================
# Delete Workspace Tests
# =============================================================================


class TestDeleteWorkspace(APIClientMixin, AuthMixin, TestCase):
    """Tests for DELETE /api/workspaces/{workspace_id}."""

    def setUp(self):
        """Set up test data."""
        APIClientMixin.setUp(self)
        AuthMixin.setUp(self)

        from workspaces.services import WorkspaceService

        self.second_workspace = WorkspaceService.create_workspace(
            user=self.user, name='Second Workspace', create_demo=False
        )

    def test_delete_workspace_returns_204(self):
        """Test that deleting workspace returns 204."""
        ws_id = self.second_workspace.id
        self.delete(f'/api/workspaces/{ws_id}', **self.auth_headers())
        self.assertStatus(204)

    def test_delete_workspace_as_owner_succeeds(self):
        """Test that owner can delete workspace."""
        ws_id = self.second_workspace.id
        self.delete(f'/api/workspaces/{ws_id}', **self.auth_headers())
        self.assertStatus(204)

        self.assertFalse(Workspace.objects.filter(id=ws_id).exists())

    def test_delete_workspace_as_non_owner_fails(self):
        """Test that non-owner cannot delete workspace."""
        non_owner = UserFactory(current_workspace=self.second_workspace)
        WorkspaceMemberFactory(
            workspace=self.second_workspace,
            user=non_owner,
            role='admin',
        )

        from common.auth import create_access_token

        token = create_access_token(non_owner)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.delete(f'/api/workspaces/{self.second_workspace.id}', **headers)
        self.assertStatus(403)

    def test_delete_nonexistent_workspace_returns_404(self):
        """Test that deleting nonexistent workspace returns 404."""
        self.delete('/api/workspaces/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_non_member_returns_404(self):
        """Test that deleting a workspace where user is not a member returns 404."""
        from common.auth import create_access_token

        non_member = UserFactory()
        token = create_access_token(non_member)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.delete(f'/api/workspaces/{self.second_workspace.id}', **headers)
        self.assertStatus(404)

    def test_delete_workspace_without_auth_fails(self):
        """Test that deleting workspace without authentication fails."""
        self.delete(f'/api/workspaces/{self.second_workspace.id}')
        self.assertStatus(401)

    def test_delete_only_workspace_returns_204(self):
        """Test that deleting the user's only workspace returns 204 and sets current_workspace to None."""
        single_ws_user = UserFactory(current_workspace=self.workspace)
        WorkspaceMemberFactory(
            workspace=self.workspace,
            user=single_ws_user,
            role='owner',
        )

        from common.auth import create_access_token

        token = create_access_token(single_ws_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.delete(f'/api/workspaces/{self.workspace.id}', **headers)
        self.assertStatus(204)

        single_ws_user.refresh_from_db()
        self.assertIsNone(single_ws_user.current_workspace_id)

    def test_delete_workspace_where_member_has_no_other_workspace_returns_204(self):
        """Test that deleting a workspace where a member has no other workspace returns 204 and sets current_workspace to None."""
        sole_member = UserFactory(current_workspace=self.second_workspace)
        WorkspaceMemberFactory(workspace=self.second_workspace, user=sole_member, role='member')

        self.delete(f'/api/workspaces/{self.second_workspace.id}', **self.auth_headers())
        self.assertStatus(204)

        sole_member.refresh_from_db()
        self.assertIsNone(sole_member.current_workspace_id)


# =============================================================================
# Leave Workspace Edge Case Tests
# =============================================================================


class TestLeaveWorkspaceCurrentWorkspace(WorkspaceTestCase):
    """Tests for leave workspace affecting current_workspace."""

    def test_leave_current_workspace_switches_to_next(self):
        """Test that leaving current workspace switches to another available one."""
        ws_to_leave = WorkspaceFactory(name='To Leave')
        WorkspaceMemberFactory(workspace=ws_to_leave, user=self.member_user, role='member')

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.member_user.current_workspace = ws_to_leave
        self.member_user.save()

        self.post(f'/api/workspaces/{ws_to_leave.id}/members/leave', {}, **headers)
        self.assertStatus(200)

        self.member_user.refresh_from_db()
        self.assertIsNotNone(self.member_user.current_workspace)
        self.assertNotEqual(self.member_user.current_workspace_id, ws_to_leave.id)


class TestCurrencyEndpoints(WorkspaceTestCase):
    """Tests for currency CRUD API endpoints."""

    def test_list_currencies_success(self):
        """Test listing currencies returns 200 for workspace member."""
        data = self.get('/api/workspaces/currencies', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 4)

    def test_list_currencies_without_auth_returns_401(self):
        """Test listing currencies without authentication returns 401."""
        self.get('/api/workspaces/currencies')
        self.assertStatus(401)

    def test_create_currency_success(self):
        """Test creating currency as owner returns 201."""
        payload = {'symbol': 'GBP', 'name': 'British Pound'}
        data = self.post('/api/workspaces/currencies', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['symbol'], 'GBP')
        self.assertEqual(data['name'], 'British Pound')

    def test_create_duplicate_currency_returns_400(self):
        """Test creating duplicate currency symbol returns 400."""
        payload = {'symbol': 'PLN', 'name': 'Polish Zloty'}
        self.post('/api/workspaces/currencies', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_create_currency_as_member_returns_403(self):
        """Test that member cannot create currencies."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'symbol': 'GBP', 'name': 'British Pound'}
        self.post('/api/workspaces/currencies', payload, **headers)
        self.assertStatus(403)

    def test_create_currency_as_viewer_returns_403(self):
        """Test that viewer cannot create currencies."""
        self.viewer_user.current_workspace = self.workspace
        self.viewer_user.save()

        token = self.create_token_for_user(self.viewer_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'symbol': 'GBP', 'name': 'British Pound'}
        self.post('/api/workspaces/currencies', payload, **headers)
        self.assertStatus(403)

    def test_delete_currency_success(self):
        """Test deleting currency as owner returns 204."""
        from workspaces.models import Currency

        gbp = Currency.objects.create(workspace=self.workspace, symbol='GBP', name='British Pound')
        self.delete(f'/api/workspaces/currencies/{gbp.id}', **self.auth_headers())
        self.assertStatus(204)

    def test_delete_currency_wrong_workspace_returns_404(self):
        """Test deleting currency from other workspace returns 404."""
        other_ws = WorkspaceFactory(name='Other')
        from workspaces.models import Currency

        other_currency = Currency.objects.create(workspace=other_ws, symbol='GBP', name='British Pound')
        self.delete(f'/api/workspaces/currencies/{other_currency.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_currency_as_member_returns_403(self):
        """Test that member cannot delete currencies."""
        from workspaces.models import Currency

        gbp = Currency.objects.create(workspace=self.workspace, symbol='GBP', name='British Pound')

        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.delete(f'/api/workspaces/currencies/{gbp.id}', **headers)
        self.assertStatus(403)

    def test_delete_currency_as_viewer_returns_403(self):
        """Test that viewer cannot delete currencies."""
        from workspaces.models import Currency

        gbp = Currency.objects.create(workspace=self.workspace, symbol='GBP', name='British Pound')

        self.viewer_user.current_workspace = self.workspace
        self.viewer_user.save()

        token = self.create_token_for_user(self.viewer_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.delete(f'/api/workspaces/currencies/{gbp.id}', **headers)
        self.assertStatus(403)


class TestWorkspaceJWTAuth400(APIClientMixin, TestCase):
    """Tests for WorkspaceJWTAuth returning 400 when no workspace is active."""

    def setUp(self):
        """Set up test data."""
        APIClientMixin.setUp(self)

    def test_workspace_scoped_endpoint_returns_400_without_active_workspace(self):
        """A valid JWT with no current_workspace_id should get 400 on workspace-scoped endpoints."""
        from common.auth import create_access_token
        from common.tests.factories import UserFactory

        user = UserFactory(current_workspace=None)
        token = create_access_token(user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
        self.get('/api/workspaces/current', **headers)
        self.assertStatus(400)

    def test_workspace_scoped_endpoints_return_400_without_active_workspace(self):
        """Multiple workspace-scoped endpoints should return 400 when user has no current_workspace."""
        from common.auth import create_access_token
        from common.tests.factories import UserFactory

        user = UserFactory(current_workspace=None)
        token = create_access_token(user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        endpoints = [
            '/api/workspaces/current',
            '/api/budget-accounts',
            '/api/workspaces/currencies',
            '/api/transactions',
            '/api/categories',
        ]

        for endpoint in endpoints:
            with self.subTest(endpoint=endpoint):
                self.get(endpoint, **headers)
                self.assertStatus(400)

    def test_write_endpoints_return_400_without_active_workspace(self):
        """Write endpoints should also return 400 (not 403) when no workspace is active."""
        from common.auth import create_access_token
        from common.tests.factories import UserFactory

        user = UserFactory(current_workspace=None)
        token = create_access_token(user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.post(
            '/api/transactions',
            {
                'date': '2025-01-15',
                'description': 'x',
                'amount': '10',
                'currency': 'PLN',
                'type': 'expense',
            },
            **headers,
        )
        self.assertStatus(400)

        self.delete('/api/budget-accounts/1', **headers)
        self.assertStatus(400)


class TestWorkspaceJWTAuthMembership(APIClientMixin, TestCase):
    """Tests for WorkspaceJWTAuth verifying workspace membership."""

    def setUp(self):
        """Set up test data."""
        APIClientMixin.setUp(self)

    def test_workspace_scoped_endpoint_returns_403_for_non_member(self):
        """A user with current_workspace_id pointing to a workspace they are not a member of gets 403."""
        from common.auth import create_access_token
        from common.tests.factories import UserFactory

        workspace = WorkspaceFactory(name='Test Workspace')

        user = UserFactory(current_workspace=workspace)
        token = create_access_token(user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.get('/api/budget-accounts', **headers)
        self.assertStatus(403)

    def test_workspace_scoped_endpoint_returns_200_for_valid_member(self):
        """A valid member of the workspace gets 200 on workspace-scoped endpoints."""
        from common.auth import create_access_token
        from common.tests.factories import UserFactory

        workspace = WorkspaceFactory(name='Test Workspace')

        user = UserFactory(current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=user, role='member')
        token = create_access_token(user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        self.get('/api/budget-accounts', **headers)
        self.assertStatus(200)


class TestViewerCannotWrite(APIClientMixin, TestCase):
    """Tests verifying viewer role is rejected on write endpoints."""

    def setUp(self):
        from budget_accounts.models import BudgetAccount
        from common.auth import create_access_token
        from workspaces.models import Currency

        APIClientMixin.setUp(self)

        self.workspace = WorkspaceFactory(name='Test Workspace')
        self.viewer_user = UserFactory(
            email='viewer@example.com',
            current_workspace=self.workspace,
        )
        WorkspaceMemberFactory(
            workspace=self.workspace,
            user=self.viewer_user,
            role='viewer',
        )

        self.auth_token = create_access_token(self.viewer_user)

        self.pln = Currency.objects.get(workspace=self.workspace, symbol='PLN')
        self.account = BudgetAccount.objects.create(
            workspace=self.workspace,
            name='General',
            default_currency=self.pln,
            is_active=True,
            display_order=0,
            created_by=self.viewer_user,
            updated_by=self.viewer_user,
        )
        self.period = BudgetPeriodFactory(
            budget_account=self.account,
            workspace=self.workspace,
            name='Jan 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=self.viewer_user,
        )
        self.category = CategoryFactory(
            budget_period=self.period,
            workspace=self.workspace,
            name='Groceries',
            created_by=self.viewer_user,
        )

    def auth_headers(self):
        return {'HTTP_AUTHORIZATION': f'Bearer {self.auth_token}'}

    def test_viewer_cannot_create_budget_account(self):
        payload = {'name': 'New Account', 'default_currency_id': self.pln.id}
        self.post('/api/budget-accounts', payload, **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_cannot_update_budget_account(self):
        payload = {'name': 'Updated Name'}
        self.put(f'/api/budget-accounts/{self.account.id}', payload, **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_cannot_delete_budget_account(self):
        self.delete(f'/api/budget-accounts/{self.account.id}', **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_cannot_create_transaction(self):
        payload = {
            'date': '2025-01-15',
            'description': 'Test',
            'amount': '100.00',
            'currency': 'PLN',
            'type': 'expense',
            'budget_period_id': self.period.id,
        }
        self.post('/api/transactions', payload, **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_cannot_update_category(self):
        payload = {'name': 'Updated Category'}
        self.put(f'/api/categories/{self.category.id}', payload, **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_cannot_delete_category(self):
        self.delete(f'/api/categories/{self.category.id}', **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_cannot_create_budget(self):
        budget = BudgetFactory(
            budget_period=self.period,
            workspace=self.workspace,
            category=self.category,
            currency=self.pln,
            amount=100,
            created_by=self.viewer_user,
            updated_by=self.viewer_user,
        )
        payload = {
            'budget_period_id': self.period.id,
            'category_id': self.category.id,
            'currency': 'PLN',
            'amount': '200.00',
        }
        self.post('/api/budgets', payload, **self.auth_headers())
        self.assertStatus(403)
        budget.delete()

    def test_viewer_cannot_delete_budget(self):
        budget = BudgetFactory(
            budget_period=self.period,
            workspace=self.workspace,
            category=self.category,
            currency=self.pln,
            amount=100,
            created_by=self.viewer_user,
            updated_by=self.viewer_user,
        )
        self.delete(f'/api/budgets/{budget.id}', **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_can_read_budget_accounts(self):
        self.get('/api/budget-accounts', **self.auth_headers())
        self.assertStatus(200)

    def test_viewer_can_read_transactions(self):
        self.get(f'/api/transactions?budget_period_id={self.period.id}', **self.auth_headers())
        self.assertStatus(200)
