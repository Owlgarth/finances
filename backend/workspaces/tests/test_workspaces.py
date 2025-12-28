"""Tests for workspaces and workspace_members API endpoints."""

# Import User model at module level for use in tests
from django.contrib.auth import get_user_model
from django.test import TestCase

from common.tests.mixins import APIClientMixin, AuthMixin
from workspaces.models import Workspace, WorkspaceMember

User = get_user_model()


# =============================================================================
# Base Test Class
# =============================================================================


class WorkspaceTestCase(APIClientMixin, AuthMixin, TestCase):
    """Base test case for workspace tests with authenticated user and data."""

    def setUp(self):
        """Set up test data for workspace API tests."""
        APIClientMixin.setUp(self)
        AuthMixin.setUp(self)

        # Create additional users for testing
        self.admin_user = User.objects.create_user(
            email='admin@example.com',
            password='adminpass123',
            full_name='Admin User',
            current_workspace=self.workspace,
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.admin_user,
            role='admin',
        )

        self.member_user = User.objects.create_user(
            email='member@example.com',
            password='memberpass123',
            full_name='Member User',
            current_workspace=self.workspace,
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.member_user,
            role='member',
        )

        self.viewer_user = User.objects.create_user(
            email='viewer@example.com',
            password='viewerpass123',
            full_name='Viewer User',
            current_workspace=self.workspace,
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.viewer_user,
            role='viewer',
        )

        # Create another workspace for testing
        self.other_workspace = Workspace.objects.create(name='Other Workspace')
        WorkspaceMember.objects.create(
            workspace=self.other_workspace,
            user=self.user,
            role='admin',
        )


# =============================================================================
# List Workspaces Tests
# =============================================================================


class TestListWorkspaces(WorkspaceTestCase):
    """Tests for GET /backend/workspaces."""

    def test_list_returns_all_user_workspaces(self):
        """Test listing all workspaces the user has access to."""
        data = self.get('/backend/workspaces', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)  # User is member of 2 workspaces

    def test_list_without_auth_returns_401(self):
        """Test that listing workspaces without authentication fails."""
        data = self.get('/backend/workspaces')
        self.assertStatus(401)


# =============================================================================
# Get Current Workspace Tests
# =============================================================================


class TestGetCurrentWorkspace(WorkspaceTestCase):
    """Tests for GET /backend/workspaces/current."""

    def test_get_current_workspace_success(self):
        """Test getting current workspace details."""
        data = self.get('/backend/workspaces/current', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['id'], self.workspace.id)
        self.assertEqual(data['name'], self.workspace_name)

    def test_get_current_workspace_without_auth_fails(self):
        """Test that getting current workspace without authentication fails."""
        data = self.get('/backend/workspaces/current')
        self.assertStatus(401)


# =============================================================================
# Update Current Workspace Tests
# =============================================================================


class TestUpdateCurrentWorkspace(WorkspaceTestCase):
    """Tests for PUT /backend/workspaces/current."""

    def test_update_workspace_as_owner_success(self):
        """Test updating workspace name as owner."""
        payload = {'name': 'Updated Workspace Name'}
        data = self.put('/backend/workspaces/current', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Updated Workspace Name')

    def test_update_workspace_as_admin_success(self):
        """Test updating workspace name as admin."""
        self.admin_user.current_workspace = self.workspace
        self.admin_user.save()

        token = self.create_token_for_user(self.admin_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'name': 'Admin Updated Name'}
        data = self.put('/backend/workspaces/current', payload, **headers)
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Admin Updated Name')

    def test_update_workspace_as_member_fails(self):
        """Test that member cannot update workspace."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'name': 'Should Not Work'}
        data = self.put('/backend/workspaces/current', payload, **headers)
        self.assertStatus(403)

    def test_update_workspace_without_auth_fails(self):
        """Test that updating workspace without authentication fails."""
        payload = {'name': 'Should Not Work'}
        data = self.put('/backend/workspaces/current', payload)
        self.assertStatus(401)

    def create_token_for_user(self, user):
        """Helper to create JWT token for a user."""
        from common.auth import create_access_token

        return create_access_token(user)


# =============================================================================
# Switch Workspace Tests
# =============================================================================


class TestSwitchWorkspace(WorkspaceTestCase):
    """Tests for POST /backend/workspaces/{workspace_id}/switch."""

    def test_switch_workspace_success(self):
        """Test switching to another workspace."""
        data = self.post(f'/backend/workspaces/{self.other_workspace.id}/switch', {}, **self.auth_headers())
        self.assertStatus(200)
        self.assertIn('message', data)

        # Verify user's current workspace was updated
        self.user.refresh_from_db()
        self.assertEqual(self.user.current_workspace_id, self.other_workspace.id)

    def test_switch_to_workspace_without_access_fails(self):
        """Test that switching to workspace without access fails."""
        # Create a workspace the user is not a member of
        forbidden_workspace = Workspace.objects.create(name='Forbidden Workspace')

        data = self.post(f'/backend/workspaces/{forbidden_workspace.id}/switch', {}, **self.auth_headers())
        self.assertStatus(403)

    def test_switch_workspace_without_auth_fails(self):
        """Test that switching workspace without authentication fails."""
        data = self.post(f'/backend/workspaces/{self.other_workspace.id}/switch', {})
        self.assertStatus(401)


# =============================================================================
# List Workspace Members Tests
# =============================================================================


class TestListWorkspaceMembers(WorkspaceTestCase):
    """Tests for GET /backend/workspaces/{workspace_id}/members."""

    def test_list_members_success(self):
        """Test listing all members in workspace."""
        data = self.get(f'/backend/workspaces/{self.workspace.id}/members', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 4)  # owner, admin, member, viewer

    def test_list_members_ordered_by_role(self):
        """Test that members are ordered by role (alphabetically, then email)."""
        data = self.get(f'/backend/workspaces/{self.workspace.id}/members', **self.auth_headers())
        self.assertStatus(200)
        # Ordering is alphabetical descending on role name (viewer > owner > member > admin)
        roles = [m['role'] for m in data]
        # Should be in descending alphabetical order
        self.assertEqual(roles, sorted(roles, reverse=True))

    def test_list_members_without_access_fails(self):
        """Test that listing members without workspace access fails."""
        # Create a user who is not a member of the workspace
        non_member = User.objects.create_user(
            email='nonmember@example.com',
            password='pass123',
            current_workspace=None,
        )
        token = self.create_token_for_user(non_member)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        data = self.get(f'/backend/workspaces/{self.workspace.id}/members', **headers)
        self.assertStatus(403)

    def test_list_members_without_auth_fails(self):
        """Test that listing members without authentication fails."""
        data = self.get(f'/backend/workspaces/{self.workspace.id}/members')
        self.assertStatus(401)

    def create_token_for_user(self, user):
        """Helper to create JWT token for a user."""
        from common.auth import create_access_token

        return create_access_token(user)


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
        data = self.post(f'/backend/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())

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
        existing_user = User.objects.create_user(
            email='existing@example.com',
            password='pass123',
        )

        initial_member_count = WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count()

        payload = {
            'email': 'existing@example.com',
            'password': 'ignored123',
            'full_name': 'Existing User',
            'role': 'viewer',
        }
        data = self.post(f'/backend/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())

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
        data = self.post(f'/backend/workspaces/{self.workspace.id}/members/add', payload, **self.auth_headers())
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
        data = self.post(f'/backend/workspaces/{self.workspace.id}/members/add', payload, **headers)
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
        data = self.post(f'/backend/workspaces/{self.workspace.id}/members/add', payload, **headers)
        self.assertStatus(403)

    def test_add_member_without_auth_fails(self):
        """Test that adding member without authentication fails."""
        payload = {
            'email': 'test@example.com',
            'password': 'password123',
            'role': 'viewer',
        }
        data = self.post(f'/backend/workspaces/{self.workspace.id}/members/add', payload)
        self.assertStatus(401)

    def create_token_for_user(self, user):
        """Helper to create JWT token for a user."""
        from common.auth import create_access_token

        return create_access_token(user)


# =============================================================================
# Update Member Role Tests
# =============================================================================


class TestUpdateMemberRole(WorkspaceTestCase):
    """Tests for PUT /backend/workspaces/{workspace_id}/members/{member_user_id}/role."""

    def test_update_role_as_owner_success(self):
        """Test updating member role as owner."""
        payload = {'role': 'viewer'}
        data = self.put(
            f'/backend/workspaces/{self.workspace.id}/members/{self.member_user.id}/role', payload, **self.auth_headers()
        )
        self.assertStatus(200)
        self.assertEqual(data['new_role'], 'viewer')

    def test_update_own_role_fails(self):
        """Test that updating your own role fails."""
        payload = {'role': 'admin'}
        data = self.put(
            f'/backend/workspaces/{self.workspace.id}/members/{self.user.id}/role', payload, **self.auth_headers()
        )
        self.assertStatus(400)

    def test_update_owner_role_fails(self):
        """Test that changing owner role fails."""
        payload = {'role': 'admin'}
        data = self.put(
            f'/backend/workspaces/{self.workspace.id}/members/{self.user.id}/role', payload, **self.auth_headers()
        )
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
        data = self.put(f'/backend/workspaces/{self.workspace.id}/members/{self.member_user.id}/role', payload, **headers)
        self.assertStatus(403)

    def test_update_role_as_member_fails(self):
        """Test that regular member cannot update roles."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'role': 'viewer'}
        data = self.put(f'/backend/workspaces/{self.workspace.id}/members/{self.viewer_user.id}/role', payload, **headers)
        self.assertStatus(403)

    def create_token_for_user(self, user):
        """Helper to create JWT token for a user."""
        from common.auth import create_access_token

        return create_access_token(user)


# =============================================================================
# Remove Member from Workspace Tests
# =============================================================================


class TestRemoveMemberFromWorkspace(WorkspaceTestCase):
    """Tests for DELETE /backend/workspaces/{workspace_id}/members/{member_user_id}."""

    def test_remove_member_as_owner_success(self):
        """Test removing a member as owner."""
        initial_count = WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count()

        self.delete(f'/backend/workspaces/{self.workspace.id}/members/{self.viewer_user.id}', **self.auth_headers())
        self.assertStatus(204)

        # Verify member was removed
        self.assertEqual(
            WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count(),
            initial_count - 1,
        )

    def test_remove_yourself_fails(self):
        """Test that removing yourself fails."""
        data = self.delete(f'/backend/workspaces/{self.workspace.id}/members/{self.user.id}', **self.auth_headers())
        self.assertStatus(400)

    def test_remove_owner_fails(self):
        """Test that removing owner fails."""
        data = self.delete(f'/backend/workspaces/{self.workspace.id}/members/{self.user.id}', **self.auth_headers())
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

        data = self.delete(f'/backend/workspaces/{self.workspace.id}/members/{self.member_user.id}', **headers)
        self.assertStatus(403)

    def test_remove_member_as_member_fails(self):
        """Test that regular member cannot remove other members."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        data = self.delete(f'/backend/workspaces/{self.workspace.id}/members/{self.viewer_user.id}', **headers)
        self.assertStatus(403)

    def create_token_for_user(self, user):
        """Helper to create JWT token for a user."""
        from common.auth import create_access_token

        return create_access_token(user)


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

        data = self.post(f'/backend/workspaces/{self.workspace.id}/members/leave', {}, **headers)
        self.assertStatus(200)

        # Verify membership was removed
        self.assertEqual(
            WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count(),
            initial_count - 1,
        )

        # Verify user's current workspace was unset
        self.member_user.refresh_from_db()
        self.assertIsNone(self.member_user.current_workspace_id)

    def test_leave_workspace_as_owner_fails(self):
        """Test that owner cannot leave workspace."""
        data = self.post(f'/backend/workspaces/{self.workspace.id}/members/leave', {}, **self.auth_headers())
        self.assertStatus(400)

    def test_leave_workspace_without_auth_fails(self):
        """Test that leaving workspace without authentication fails."""
        data = self.post(f'/backend/workspaces/{self.workspace.id}/members/leave', {})
        self.assertStatus(401)

    def create_token_for_user(self, user):
        """Helper to create JWT token for a user."""
        from common.auth import create_access_token

        return create_access_token(user)


# =============================================================================
# Reset Member Password Tests
# =============================================================================


class TestResetMemberPassword(WorkspaceTestCase):
    """Tests for PUT /backend/workspaces/{workspace_id}/members/{user_id}/reset-password."""

    def test_reset_password_as_owner_success(self):
        """Test resetting member password as owner."""
        payload = {'new_password': 'newpassword123'}
        data = self.put(
            f'/backend/workspaces/{self.workspace.id}/members/{self.member_user.id}/reset-password',
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
        data = self.put(
            f'/backend/workspaces/{self.workspace.id}/members/{self.user.id}/reset-password', payload, **self.auth_headers()
        )
        self.assertStatus(400)

    def test_reset_owner_password_fails(self):
        """Test that resetting owner's password fails."""
        payload = {'new_password': 'newpassword123'}
        data = self.put(
            f'/backend/workspaces/{self.workspace.id}/members/{self.user.id}/reset-password', payload, **self.auth_headers()
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
        data = self.put(
            f'/backend/workspaces/{self.workspace.id}/members/{self.member_user.id}/reset-password', payload, **headers
        )
        self.assertStatus(403)

    def test_reset_password_as_member_fails(self):
        """Test that regular member cannot reset passwords."""
        self.member_user.current_workspace = self.workspace
        self.member_user.save()

        token = self.create_token_for_user(self.member_user)
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

        payload = {'new_password': 'newpassword123'}
        data = self.put(
            f'/backend/workspaces/{self.workspace.id}/members/{self.viewer_user.id}/reset-password', payload, **headers
        )
        self.assertStatus(403)

    def create_token_for_user(self, user):
        """Helper to create JWT token for a user."""
        from common.auth import create_access_token

        return create_access_token(user)
