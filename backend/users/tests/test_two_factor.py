"""Tests for 2FA management endpoints."""

import pyotp
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client, TestCase

from common.auth import create_access_token
from common.tests.factories import UserFactory
from users.two_factor import TwoFactorService
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory

User = get_user_model()


class _Base(TestCase):
    def setUp(self):
        cache.clear()
        self.workspace = WorkspaceFactory(name='Test WS')
        self.user = UserFactory(email='owner@example.com', current_workspace=self.workspace)
        self.user.set_password('testpass123')
        self.user.save()
        self.workspace.owner = self.user
        self.workspace.save()
        WorkspaceMemberFactory(workspace=self.workspace, user=self.user, role='owner')
        self.auth_token = create_access_token(self.user)

    def auth_headers(self):
        return {'HTTP_AUTHORIZATION': f'Bearer {self.auth_token}'}

    def _enable_2fa(self, user):
        setup = TwoFactorService.setup(user)
        secret = setup['secret_key']
        code = pyotp.TOTP(secret).now()
        result = TwoFactorService.verify_and_enable(user, code)
        return secret, result['recovery_codes']

    def _create_member(self, email, role='member', password='testpass123'):
        member_user = UserFactory(email=email, current_workspace=self.workspace)
        member_user.set_password(password)
        member_user.save()
        WorkspaceMemberFactory(workspace=self.workspace, user=member_user, role=role)
        return member_user


class TestTwoFASetup(_Base):
    def test_setup_returns_qr_code_and_secret(self):
        client = Client()
        response = client.post(
            '/api/users/me/2fa/setup',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['qr_code_svg'].startswith('data:image/svg+xml;base64,'))
        self.assertTrue(len(data['secret_key']) > 10)

    def test_verify_setup_with_valid_code(self):
        client = Client()
        setup = TwoFactorService.setup(self.user)
        secret = setup['secret_key']
        code = pyotp.TOTP(secret).now()

        response = client.post(
            '/api/users/me/2fa/verify-setup',
            data='{"code": "' + code + '"}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['recovery_codes']), 8)

    def test_verify_setup_with_invalid_code(self):
        client = Client()
        TwoFactorService.setup(self.user)

        response = client.post(
            '/api/users/me/2fa/verify-setup',
            data='{"code": "000000"}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 401)

    def test_verify_setup_without_prior_setup(self):
        client = Client()
        response = client.post(
            '/api/users/me/2fa/verify-setup',
            data='{"code": "000000"}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 404)

    def test_setup_when_already_enabled_fails(self):
        client = Client()
        self._enable_2fa(self.user)

        response = client.post(
            '/api/users/me/2fa/setup',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 400)


class TestTwoFADisable(_Base):
    def test_disable_with_correct_password(self):
        client = Client()
        self._enable_2fa(self.user)

        response = client.post(
            '/api/users/me/2fa/disable',
            data='{"password": "testpass123"}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 200)

        status = client.get(
            '/api/users/me/2fa',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(status.json()['enabled'], False)

    def test_disable_with_wrong_password(self):
        client = Client()
        self._enable_2fa(self.user)

        response = client.post(
            '/api/users/me/2fa/disable',
            data='{"password": "wrongpassword"}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 401)

    def test_disable_when_not_enabled(self):
        client = Client()
        response = client.post(
            '/api/users/me/2fa/disable',
            data='{"password": "testpass123"}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 404)


class TestTwoFAStatus(_Base):
    def test_status_when_not_configured(self):
        client = Client()
        response = client.get(
            '/api/users/me/2fa',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data['enabled'])
        self.assertEqual(data['remaining_recovery_codes'], 0)

    def test_status_when_enabled(self):
        client = Client()
        self._enable_2fa(self.user)

        response = client.get(
            '/api/users/me/2fa',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['enabled'])
        self.assertEqual(data['remaining_recovery_codes'], 8)

    def test_status_shows_remaining_codes(self):
        client = Client()
        secret, recovery_codes = self._enable_2fa(self.user)

        for code in recovery_codes[:3]:
            TwoFactorService.verify_code(self.user, code)

        response = client.get(
            '/api/users/me/2fa',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['enabled'])
        self.assertEqual(data['remaining_recovery_codes'], 5)


class TestTwoFARegenerateCodes(_Base):
    def test_regenerate_with_correct_password(self):
        client = Client()
        secret, old_codes = self._enable_2fa(self.user)

        response = client.post(
            '/api/users/me/2fa/regenerate-codes',
            data='{"password": "testpass123"}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 200)
        new_codes = response.json()['recovery_codes']
        self.assertEqual(len(new_codes), 8)
        self.assertNotEqual(new_codes, old_codes)

    def test_regenerate_with_wrong_password(self):
        client = Client()
        self._enable_2fa(self.user)

        response = client.post(
            '/api/users/me/2fa/regenerate-codes',
            data='{"password": "wrongpassword"}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 401)

    def test_regenerate_when_not_enabled(self):
        client = Client()
        response = client.post(
            '/api/users/me/2fa/regenerate-codes',
            data='{"password": "testpass123"}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 404)


class TestAdminReset2FA(_Base):
    def setUp(self):
        super().setUp()
        self.admin = self._create_member('admin@example.com', role='admin')
        self.admin_token = create_access_token(self.admin)
        self.member = self._create_member('member@example.com', role='member')

    def _reset_url(self, user_id):
        return f'/api/workspaces/{self.workspace.id}/members/{user_id}/reset-2fa'

    def test_admin_can_reset_member_2fa(self):
        client = Client()
        self._enable_2fa(self.member)

        response = client.post(
            self._reset_url(self.member.id),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.admin_token}',
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('message', response.json())

    def test_owner_can_reset_member_2fa(self):
        client = Client()
        self._enable_2fa(self.member)

        response = client.post(
            self._reset_url(self.member.id),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 200)

    def test_admin_cannot_reset_admin_2fa(self):
        client = Client()
        other_admin = self._create_member('other_admin@example.com', role='admin')
        self._enable_2fa(other_admin)

        response = client.post(
            self._reset_url(other_admin.id),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.admin_token}',
        )
        self.assertEqual(response.status_code, 403)

    def test_cannot_reset_own_2fa(self):
        client = Client()
        self._enable_2fa(self.admin)

        response = client.post(
            self._reset_url(self.admin.id),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.admin_token}',
        )
        self.assertEqual(response.status_code, 400)

    def test_cannot_reset_owner_2fa(self):
        client = Client()
        self._enable_2fa(self.user)

        response = client.post(
            self._reset_url(self.user.id),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.admin_token}',
        )
        self.assertEqual(response.status_code, 400)

    def test_viewer_cannot_reset_2fa(self):
        client = Client()
        viewer = self._create_member('viewer@example.com', role='viewer')
        viewer_token = create_access_token(viewer)
        self._enable_2fa(self.member)

        response = client.post(
            self._reset_url(self.member.id),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {viewer_token}',
        )
        self.assertEqual(response.status_code, 403)

    def test_reset_when_2fa_not_enabled(self):
        client = Client()

        response = client.post(
            self._reset_url(self.member.id),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.admin_token}',
        )
        self.assertEqual(response.status_code, 404)

    def test_reset_when_2fa_pending_setup(self):
        client = Client()
        TwoFactorService.setup(self.member)

        response = client.post(
            self._reset_url(self.member.id),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.admin_token}',
        )
        self.assertEqual(response.status_code, 404)


class TestTwoFAExport(_Base):
    def test_export_includes_2fa_when_not_configured(self):
        from users.services import UserService

        data = UserService.export_all_data(self.user)
        self.assertIn('two_factor', data)
        self.assertFalse(data['two_factor']['is_enabled'])
        self.assertIsNone(data['two_factor']['last_used_at'])
        self.assertIsNone(data['two_factor']['created_at'])

    def test_export_includes_2fa_when_enabled(self):
        from users.services import UserService

        self._enable_2fa(self.user)
        data = UserService.export_all_data(self.user)
        self.assertIn('two_factor', data)
        self.assertTrue(data['two_factor']['is_enabled'])
        self.assertIsNotNone(data['two_factor']['created_at'])
        self.assertNotIn('encrypted_secret', data['two_factor'])
        self.assertNotIn('hashed_recovery_codes', data['two_factor'])


class TestVerify2FAEndpoint(_Base):
    def test_verify_2fa_returns_404_when_2fa_disabled_mid_flow(self):
        client = Client()
        self._enable_2fa(self.user)

        login_response = client.post(
            '/api/auth/login',
            data='{"email": "owner@example.com", "password": "testpass123"}',
            content_type='application/json',
        )
        self.assertEqual(login_response.status_code, 200)
        temp_token = login_response.json()['temp_token']

        TwoFactorService.disable(self.user)

        response = client.post(
            '/api/auth/verify-2fa',
            data='{"temp_token": "' + temp_token + '", "code": "000000"}',
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn('not enabled', response.json()['detail'].lower())
