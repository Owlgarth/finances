"""Tests for workspace isolation and access control."""

from django.contrib.auth import get_user_model

from workspaces.models import WorkspaceMember

from .base import AuthTestCase


class TestWorkspaceAccess(AuthTestCase):
    """Tests for workspace isolation and access control."""

    def test_users_see_only_own_workspaces(self):
        """Test that users see only their own budget accounts."""
        user1_token = self.register_and_login('user1@example.com', 'password123', 'Workspace 1')
        user2_token = self.register_and_login('user2@example.com', 'password123', 'Workspace 2')

        user1_data = self.get('/backend/auth/me', **self.auth_headers(user1_token))
        user2_data = self.get('/backend/auth/me', **self.auth_headers(user2_token))

        self.assertNotEqual(user1_data['current_workspace_id'], user2_data['current_workspace_id'])

    def test_user_workspace_member_role(self):
        """Test that registered user has owner role in their workspace."""

        self.register_and_login('owner_test@example.com', 'password123', 'Owner Workspace')

        user = get_user_model().objects.get(email='owner_test@example.com')
        member = WorkspaceMember.objects.get(workspace=user.current_workspace, user=user)

        self.assertEqual(member.role, 'owner')
