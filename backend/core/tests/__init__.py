"""Core tests module.

This module contains tests for the core app, organized by domain:

- base.py: AuthTestCase base class with common setup for auth tests
- test_auth.py: Authentication endpoint tests (register, login, protected endpoints, demo mode)
- test_users.py: User profile management tests (update, password change)
- test_workspaces.py: Workspace isolation and access control tests
- test_mixins.py: Tests validating the test mixins themselves

Shared test utilities (APIClientMixin, AuthMixin) are now in common/tests/mixins.py
for reuse across all apps.
"""
