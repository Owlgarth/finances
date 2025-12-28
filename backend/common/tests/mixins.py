"""Shared test mixins for API testing.

This module provides reusable mixins for API testing that can be used
across all Django apps in the project.
"""

import json

from django.contrib.auth import get_user_model
from django.test import Client

from budget_accounts.models import BudgetAccount
from common.auth import create_access_token
from workspaces.models import Workspace, WorkspaceMember

User = get_user_model()


class APIClientMixin:
    """Mixin providing HTTP helper methods for API testing."""

    def setUp(self):
        """Set up test client."""
        self.client = Client()

    def post(self, path: str, data: dict, **kwargs) -> object:
        """Helper for POST requests with JSON."""
        response = self.client.post(
            path,
            data=json.dumps(data),
            content_type='application/json',
            **kwargs,
        )
        self.response = response
        # Handle both JSON and HTML responses (HTML for CSRF/403 errors)
        if response.status_code == 401 or response.status_code == 403:
            return {}
        if response.content and 'application/json' in response.get('Content-Type', ''):
            return response.json()
        return {}

    def get(self, path: str, **kwargs) -> object:
        """Helper for GET requests."""
        response = self.client.get(path, **kwargs)
        self.response = response
        return response.json() if response.content else {}

    def patch(self, path: str, data: dict | None = None, **kwargs) -> object:
        """Helper for PATCH requests with JSON."""
        response = self.client.patch(
            path,
            data=json.dumps(data) if data is not None else None,
            content_type='application/json',
            **kwargs,
        )
        self.response = response
        return response.json() if response.content else {}

    def put(self, path: str, data: dict, **kwargs) -> object:
        """Helper for PUT requests with JSON."""
        response = self.client.put(
            path,
            data=json.dumps(data),
            content_type='application/json',
            **kwargs,
        )
        self.response = response
        return response.json() if response.content else {}

    def delete(self, path: str, **kwargs) -> None:
        """Helper for DELETE requests."""
        response = self.client.delete(path, **kwargs)
        self.response = response

    def assertStatus(self, code: int):
        """Assert the last response has the given status code."""
        self.assertEqual(self.response.status_code, code)


class AuthMixin:
    """
    Mixin that provides an authenticated user for testing.

    Creates a user with workspace and generates JWT token.
    Use this mixin in test classes that need authenticated requests.

    Example:
        class MyTestCase(AuthMixin, APIClientMixin, TestCase):
            def test_something(self):
                # self.user is available
                # self.auth_token is available
                # self.get('/backend/endpoint', **self.auth_headers())
    """

    # Default user attributes - override in subclasses as needed
    user_email = 'test@example.com'
    user_password = 'testpass123'
    user_full_name = 'Test User'
    workspace_name = 'Test Workspace'

    # Set to True to create demo fixtures (default: False for faster tests)
    with_demo_fixtures = False

    def setUp(self):
        """Set up authenticated user."""
        # Create workspace
        self.workspace = Workspace.objects.create(name=self.workspace_name)

        # Create user
        self.user = User.objects.create_user(
            email=self.user_email,
            password=self.user_password,
            full_name=self.user_full_name,
            current_workspace=self.workspace,
        )

        # Update workspace owner
        self.workspace.owner = self.user
        self.workspace.save()

        # Create workspace membership with owner role
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.user,
            role='owner',
        )

        # Create default budget account
        BudgetAccount.objects.create(
            workspace=self.workspace,
            name='General',
            description='General budget account',
            default_currency='PLN',
            is_active=True,
            display_order=0,
            created_by=self.user,
        )

        # Optionally create demo fixtures
        if self.with_demo_fixtures:
            from core.demo_fixtures import create_demo_fixtures

            create_demo_fixtures(
                workspace_id=self.workspace.id,
                user_id=self.user.id,
            )

        # Generate JWT token
        self.auth_token = create_access_token(self.user)

    def auth_headers(self) -> dict:
        """Get auth headers for authenticated requests."""
        return {'HTTP_AUTHORIZATION': f'Bearer {self.auth_token}'}

    def get_auth(self) -> User:
        """Get the authenticated user (alias for self.user)."""
        return self.user

    def get_workspace(self) -> Workspace:
        """Get the user's workspace (alias for self.workspace)."""
        return self.workspace
