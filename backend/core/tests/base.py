"""Base test case for core tests."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from common.tests.mixins import APIClientMixin

User = get_user_model()


class AuthTestCase(APIClientMixin, TestCase):
    """Base test case for auth tests with common setup."""

    @staticmethod
    def create_user(email='test@example.com', password='testpass123', full_name='Test User'):
        """Helper to create a test user."""
        return User.objects.create_user(
            email=email,
            password=password,
            full_name=full_name,
        )

    def register_and_login(self, email='test@example.com', password='testpass123', workspace_name='Test Workspace'):
        """Helper to register a user and return their token."""
        register_data = {
            'email': email,
            'password': password,
            'workspace_name': workspace_name,
        }
        self.post('/backend/auth/register', register_data)
        self.assertStatus(201)

        # Login to get token
        login_data = {'email': email, 'password': password}
        return self.post('/backend/auth/login', login_data)['access_token']

    @staticmethod
    def auth_headers(token: str) -> dict:
        """Helper to get auth headers."""
        return {'HTTP_AUTHORIZATION': f'Bearer {token}'}
