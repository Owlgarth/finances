"""Tests for test utilities and mixins."""

from django.test import TestCase

from common.tests.mixins import APIClientMixin, AuthMixin


class TestAuthMixin(AuthMixin, APIClientMixin, TestCase):
    """Example tests using AuthMixin for authenticated requests."""

    def test_auth_mixin_provides_user(self):
        """Test that AuthMixin provides a user instance."""
        self.assertIsNotNone(self.user)
        self.assertEqual(self.user.email, 'test@example.com')

    def test_auth_mixin_provides_token(self):
        """Test that AuthMixin provides a JWT token."""
        self.assertIsNotNone(self.auth_token)
        self.assertIsInstance(self.auth_token, str)
        # JWT should have 3 parts separated by dots
        self.assertEqual(len(self.auth_token.split('.')), 3)

    def test_auth_mixin_provides_workspace(self):
        """Test that AuthMixin provides a workspace."""
        self.assertIsNotNone(self.workspace)
        self.assertEqual(self.workspace.name, 'Test Workspace')

    def test_auth_mixin_headers_work(self):
        """Test that auth_headers() produces valid headers."""
        data = self.get('/api/users/me', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['email'], 'test@example.com')

    def test_auth_mixin_get_auth(self):
        """Test that get_auth() returns the user."""
        user = self.get_auth()
        self.assertEqual(user, self.user)

    def test_auth_mixin_get_workspace(self):
        """Test that get_workspace() returns the workspace."""
        workspace = self.get_workspace()
        self.assertEqual(workspace, self.workspace)

    def test_auth_mixin_custom_attributes(self):
        """Test AuthMixin with custom user attributes."""
        # This would be used by overriding class attributes in a subclass
        self.assertEqual(self.user_full_name, 'Test User')
        self.assertEqual(self.user_password, 'testpass123')


class TestAuthMixinWithCustomAttrs(AuthMixin, APIClientMixin, TestCase):
    """Example tests using AuthMixin with custom attributes."""

    user_email = 'custom@example.com'
    user_full_name = 'Custom User'
    workspace_name = 'Custom Workspace'

    def test_custom_email(self):
        """Test that custom email is used."""
        self.assertEqual(self.user.email, 'custom@example.com')

    def test_custom_full_name(self):
        """Test that custom full name is used."""
        self.assertEqual(self.user.full_name, 'Custom User')

    def test_custom_workspace_name(self):
        """Test that custom workspace name is used."""
        self.assertEqual(self.workspace.name, 'Custom Workspace')
