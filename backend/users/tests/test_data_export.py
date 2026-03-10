"""Tests for GDPR data export (Right to Access & Portability)."""

import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from common.tests.mixins import AuthMixin
from users.models import UserConsent

User = get_user_model()


class DataExportTests(AuthMixin, TestCase):
    """Tests for GDPR data export endpoint."""

    def test_export_returns_json_file(self):
        """Export should return JSON with correct Content-Type and Content-Disposition headers."""
        response = self.client.get('/api/users/me/export', **self.auth_headers())

        self.assertEqual(response.status_code, 200)
        self.assertIn('application/json', response['Content-Type'])
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertIn('monie_data_export', response['Content-Disposition'])

    def test_export_contains_profile_data(self):
        """Export should contain user profile information."""
        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertEqual(data['profile']['email'], self.user.email)
        self.assertEqual(data['profile']['full_name'], self.user.full_name)
        self.assertIn('created_at', data['profile'])

    def test_export_contains_workspace_data(self):
        """Export should contain workspace data for the user's workspaces."""
        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertIn('workspaces', data)
        workspace_names = [ws['workspace_name'] for ws in data['workspaces']]
        self.assertIn(self.workspace.name, workspace_names)

    def test_export_contains_consent_records(self):
        """Export should include all consent records."""
        UserConsent.objects.create(user=self.user, consent_type='terms_of_service', version='1.0')
        UserConsent.objects.create(user=self.user, consent_type='privacy_policy', version='1.0')

        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertEqual(len(data['consents']), 2)
        consent_types = {c['consent_type'] for c in data['consents']}
        self.assertEqual(consent_types, {'terms_of_service', 'privacy_policy'})

    def test_export_has_valid_structure(self):
        """Export should have all required top-level keys."""
        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        required_keys = {'export_version', 'exported_at', 'profile', 'preferences', 'consents', 'workspaces'}
        self.assertEqual(set(data.keys()), required_keys)

    def test_export_excludes_other_users_data(self):
        """Export should not contain data from other users."""
        other_user = User.objects.create_user(email='other@test.com', password='pass12345')

        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertEqual(data['profile']['email'], self.user.email)
        self.assertNotEqual(data['profile']['email'], other_user.email)

    def test_export_handles_user_with_no_preferences(self):
        """Export with no preferences should return null for preferences field."""
        # Delete preferences if they exist
        try:
            self.user.preferences.delete()
        except Exception:
            pass

        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertIsNone(data['preferences'])

    def test_export_rate_limited(self):
        """Export endpoint should be rate limited to 3 requests per hour."""
        # Make 3 successful requests
        for _ in range(3):
            response = self.client.get('/api/users/me/export', **self.auth_headers())
            self.assertEqual(response.status_code, 200)

        # 4th request should be rate limited
        response = self.client.get('/api/users/me/export', **self.auth_headers())
        self.assertEqual(response.status_code, 429)
