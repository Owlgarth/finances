"""Tests for GDPR consent management."""

from django.test import TestCase

from common.tests.mixins import AuthMixin
from users.models import ConsentType, UserConsent


class ConsentTests(AuthMixin, TestCase):
    """Tests for GDPR consent management."""

    def test_register_creates_both_consents(self):
        """Registration should create consent records for TOS and privacy policy."""
        response = self.client.post(
            '/api/auth/register',
            {
                'email': 'newuser@test.com',
                'password': 'testpass123',
                'workspace_name': 'Test',
                'accepted_terms_version': '1.0',
                'accepted_privacy_version': '1.0',
            },
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)

        from django.contrib.auth import get_user_model

        user = get_user_model().objects.get(email='newuser@test.com')
        consents = UserConsent.objects.filter(user=user, withdrawn_at__isnull=True)
        consent_types = set(consents.values_list('consent_type', flat=True))
        self.assertEqual(consent_types, {ConsentType.TERMS_OF_SERVICE, ConsentType.PRIVACY_POLICY})

    def test_register_without_consent_fields_rejected(self):
        """Registration without consent fields should return 422."""
        response = self.client.post(
            '/api/auth/register',
            {
                'email': 'newuser@test.com',
                'password': 'testpass123',
                'workspace_name': 'Test',
            },
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 422)

    def test_list_active_consents(self):
        """GET /users/me/consents should return active consents only."""
        UserConsent.objects.create(user=self.user, consent_type='terms_of_service', version='1.0')
        UserConsent.objects.create(user=self.user, consent_type='privacy_policy', version='1.0')

        response = self.client.get('/api/users/me/consents', **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 2)

    def test_withdraw_consent(self):
        """DELETE /users/me/consents/{type} should set withdrawn_at."""
        UserConsent.objects.create(user=self.user, consent_type='terms_of_service', version='1.0')

        response = self.client.delete('/api/users/me/consents/terms_of_service', **self.auth_headers())
        self.assertEqual(response.status_code, 200)

        consent = UserConsent.objects.get(user=self.user, consent_type='terms_of_service')
        self.assertIsNotNone(consent.withdrawn_at)

    def test_withdraw_nonexistent_consent_returns_404(self):
        """Withdrawing consent that doesn't exist should return 404."""
        response = self.client.delete('/api/users/me/consents/terms_of_service', **self.auth_headers())
        self.assertEqual(response.status_code, 404)

    def test_grant_consent_invalid_type_returns_422(self):
        """Granting consent with invalid type should return 422 (schema validation)."""
        response = self.client.post(
            '/api/users/me/consents',
            {
                'consent_type': 'invalid_type',
                'version': '1.0',
            },
            content_type='application/json',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 422)

    def test_consent_status_up_to_date(self):
        """GET /me/consent-status returns needs_reconsent=False when consents are current."""
        UserConsent.objects.create(user=self.user, consent_type='terms_of_service', version='1.0')
        UserConsent.objects.create(user=self.user, consent_type='privacy_policy', version='1.0')

        response = self.client.get('/api/users/me/consent-status', **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['terms_current'])
        self.assertTrue(data['privacy_current'])
        self.assertFalse(data['needs_reconsent'])

    def test_consent_status_outdated(self):
        """GET /me/consent-status returns needs_reconsent=True when consent version is old."""
        UserConsent.objects.create(user=self.user, consent_type='terms_of_service', version='0.9')
        UserConsent.objects.create(user=self.user, consent_type='privacy_policy', version='1.0')

        response = self.client.get('/api/users/me/consent-status', **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data['terms_current'])
        self.assertTrue(data['privacy_current'])
        self.assertTrue(data['needs_reconsent'])

    def test_consent_status_missing(self):
        """GET /me/consent-status returns needs_reconsent=True when no consent exists."""
        response = self.client.get('/api/users/me/consent-status', **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data['terms_current'])
        self.assertFalse(data['privacy_current'])
        self.assertTrue(data['needs_reconsent'])

    def test_withdraw_invalid_consent_type_returns_422(self):
        """Withdrawing an invalid consent type should return 422."""
        response = self.client.delete('/api/users/me/consents/invalid_type', **self.auth_headers())
        self.assertEqual(response.status_code, 422)

    def test_grant_consent_records_ip_address(self):
        """Granting consent should record the client's IP address."""
        response = self.client.post(
            '/api/users/me/consents',
            {
                'consent_type': 'terms_of_service',
                'version': '1.0',
            },
            content_type='application/json',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 201)

        consent = UserConsent.objects.get(user=self.user, consent_type='terms_of_service')
        self.assertIsNotNone(consent.ip_address)

    def test_consent_status_uses_latest_version_when_duplicates_exist(self):
        """When multiple active consents exist for the same type, use the latest."""
        from datetime import timedelta

        from django.utils import timezone

        now = timezone.now()
        # Older consent — v0.9
        UserConsent.objects.create(
            user=self.user,
            consent_type='terms_of_service',
            version='0.9',
        )
        # Newer consent — v1.0 (the current version)
        newer = UserConsent.objects.create(
            user=self.user,
            consent_type='terms_of_service',
            version='1.0',
        )
        # Manually set granted_at so newer is definitely later
        UserConsent.objects.filter(id=newer.id).update(granted_at=now + timedelta(seconds=1))

        UserConsent.objects.create(user=self.user, consent_type='privacy_policy', version='1.0')

        response = self.client.get('/api/users/me/consent-status', **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['terms_current'])  # should pick v1.0, not v0.9
        self.assertFalse(data['needs_reconsent'])
