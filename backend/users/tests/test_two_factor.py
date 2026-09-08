"""Tests for 2FA management endpoints."""

from unittest import mock

import pyotp
from django.core import mail
from django.test import TestCase

from common.auth import create_access_token
from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from users.two_factor import TwoFactorService
from workspaces.factories import WorkspaceMemberFactory


class _Base(AuthMixin, APIClientMixin, TestCase):
    user_email = 'owner@example.com'
    user_password = 'testpass123'
    workspace_name = 'Test WS'

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
        data = self.post('/api/users/me/2fa/setup', {}, **self.auth_headers())
        self.assertStatus(200)
        self.assertTrue(data['qr_code_svg'].startswith('data:image/svg+xml;base64,'))
        self.assertTrue(len(data['secret_key']) > 10)

    def test_verify_setup_with_valid_code(self):
        setup = TwoFactorService.setup(self.user)
        secret = setup['secret_key']
        code = pyotp.TOTP(secret).now()

        data = self.post('/api/users/me/2fa/verify-setup', {'code': code}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['recovery_codes']), 8)

    def test_verify_setup_with_invalid_code(self):
        TwoFactorService.setup(self.user)

        self.post('/api/users/me/2fa/verify-setup', {'code': '000000'}, **self.auth_headers())
        self.assertStatus(401)

    def test_verify_setup_without_prior_setup(self):
        self.post('/api/users/me/2fa/verify-setup', {'code': '000000'}, **self.auth_headers())
        self.assertStatus(404)

    def test_setup_when_already_enabled_fails(self):
        self._enable_2fa(self.user)

        self.post('/api/users/me/2fa/setup', {}, **self.auth_headers())
        self.assertStatus(400)


class TestTwoFADisable(_Base):
    def test_disable_with_correct_password(self):
        self._enable_2fa(self.user)

        self.post('/api/users/me/2fa/disable', {'password': self.user_password}, **self.auth_headers())
        self.assertStatus(200)

        status = self.get('/api/users/me/2fa', **self.auth_headers())
        self.assertEqual(status['enabled'], False)

    def test_disable_with_wrong_password(self):
        self._enable_2fa(self.user)

        self.post('/api/users/me/2fa/disable', {'password': 'wrongpassword'}, **self.auth_headers())
        self.assertStatus(401)

    def test_disable_when_not_enabled(self):
        self.post('/api/users/me/2fa/disable', {'password': self.user_password}, **self.auth_headers())
        self.assertStatus(404)


class TestTwoFAStatus(_Base):
    def test_status_when_not_configured(self):
        data = self.get('/api/users/me/2fa', **self.auth_headers())
        self.assertStatus(200)
        self.assertFalse(data['enabled'])
        self.assertEqual(data['remaining_recovery_codes'], 0)

    def test_status_when_enabled(self):
        self._enable_2fa(self.user)

        data = self.get('/api/users/me/2fa', **self.auth_headers())
        self.assertStatus(200)
        self.assertTrue(data['enabled'])
        self.assertEqual(data['remaining_recovery_codes'], 8)

    def test_status_shows_remaining_codes(self):
        secret, recovery_codes = self._enable_2fa(self.user)

        for code in recovery_codes[:3]:
            TwoFactorService.verify_code(self.user, code)

        data = self.get('/api/users/me/2fa', **self.auth_headers())
        self.assertStatus(200)
        self.assertTrue(data['enabled'])
        self.assertEqual(data['remaining_recovery_codes'], 5)


class TestTwoFARegenerateCodes(_Base):
    def test_regenerate_with_correct_password(self):
        secret, old_codes = self._enable_2fa(self.user)

        data = self.post('/api/users/me/2fa/regenerate-codes', {'password': self.user_password}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['recovery_codes']), 8)
        self.assertNotEqual(data['recovery_codes'], old_codes)

    def test_regenerate_with_wrong_password(self):
        self._enable_2fa(self.user)

        self.post('/api/users/me/2fa/regenerate-codes', {'password': 'wrongpassword'}, **self.auth_headers())
        self.assertStatus(401)

    def test_regenerate_when_not_enabled(self):
        self.post('/api/users/me/2fa/regenerate-codes', {'password': self.user_password}, **self.auth_headers())
        self.assertStatus(404)


class TestAdminReset2FA(_Base):
    def setUp(self):
        super().setUp()
        self.admin = self._create_member('admin@example.com', role='admin')
        self.admin_token = create_access_token(self.admin)
        self.member = self._create_member('member@example.com', role='member')

    def _reset_url(self, user_id):
        return f'/api/workspaces/{self.workspace.id}/members/{user_id}/reset-2fa'

    def test_admin_can_reset_member_2fa(self):
        self._enable_2fa(self.member)

        data = self.post(self._reset_url(self.member.id), {}, HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')
        self.assertStatus(200)
        self.assertIn('message', data)

        # Exactly one notification goes to the TARGET user (not the admin)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['member@example.com'])
        self.assertEqual(email.subject, 'Your two-factor authentication was reset — Owlgarth Finances')
        self.assertIn('Test WS', email.body)

    def test_owner_can_reset_member_2fa(self):
        self._enable_2fa(self.member)

        self.post(self._reset_url(self.member.id), {}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['member@example.com'])

    def test_admin_cannot_reset_admin_2fa(self):
        other_admin = self._create_member('other_admin@example.com', role='admin')
        self._enable_2fa(other_admin)

        self.post(self._reset_url(other_admin.id), {}, HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')
        self.assertStatus(403)
        self.assertEqual(len(mail.outbox), 0)

    def test_cannot_reset_own_2fa(self):
        self._enable_2fa(self.admin)

        self.post(self._reset_url(self.admin.id), {}, HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')
        self.assertStatus(400)
        self.assertEqual(len(mail.outbox), 0)

    def test_cannot_reset_owner_2fa(self):
        self._enable_2fa(self.user)

        self.post(self._reset_url(self.user.id), {}, HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')
        self.assertStatus(400)
        self.assertEqual(len(mail.outbox), 0)

    def test_viewer_cannot_reset_2fa(self):
        viewer = self._create_member('viewer@example.com', role='viewer')
        viewer_token = create_access_token(viewer)
        self._enable_2fa(self.member)

        self.post(self._reset_url(self.member.id), {}, HTTP_AUTHORIZATION=f'Bearer {viewer_token}')
        self.assertStatus(403)
        self.assertEqual(len(mail.outbox), 0)

    def test_reset_when_member_not_found(self):
        self.post(self._reset_url(999999), {}, HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')
        self.assertStatus(404)
        self.assertEqual(len(mail.outbox), 0)

    def test_reset_when_2fa_not_enabled(self):
        self.post(self._reset_url(self.member.id), {}, HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')
        self.assertStatus(404)
        self.assertEqual(len(mail.outbox), 0)

    def test_reset_when_2fa_pending_setup(self):
        TwoFactorService.setup(self.member)

        self.post(self._reset_url(self.member.id), {}, HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')
        self.assertStatus(404)
        self.assertEqual(len(mail.outbox), 0)


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
        self._enable_2fa(self.user)

        login_data = self.post('/api/auth/login', {'email': self.user_email, 'password': self.user_password})
        self.assertStatus(200)
        temp_token = login_data['temp_token']

        TwoFactorService.disable(self.user, self.user_password)

        data = self.post('/api/auth/verify-2fa', {'temp_token': temp_token, 'code': '000000'})
        self.assertStatus(404)
        self.assertIn('not enabled', data['detail'].lower())


class TestTOTPReplayGuard(_Base):
    """TOTP codes are single-use per timestep — a replayed code is rejected."""

    def test_reused_totp_code_rejected(self):
        secret, _ = self._enable_2fa(self.user)
        totp = pyotp.TOTP(secret)
        now_ts = 1_700_000_000
        code = totp.at(now_ts)

        with mock.patch('users.two_factor.time.time', return_value=now_ts):
            self.assertTrue(TwoFactorService.verify_code(self.user, code))
            self.assertFalse(TwoFactorService.verify_code(self.user, code))

        self.user.two_factor.refresh_from_db()
        self.assertEqual(self.user.two_factor.last_used_timestep, now_ts // 30)
        # A rejected replay must not burn recovery codes either
        self.assertEqual(len(self.user.two_factor.backup_codes), 8)

    def test_later_timestep_code_accepted_after_previous_used(self):
        secret, _ = self._enable_2fa(self.user)
        totp = pyotp.TOTP(secret)
        now_ts = 1_700_000_000

        with mock.patch('users.two_factor.time.time', return_value=now_ts):
            self.assertTrue(TwoFactorService.verify_code(self.user, totp.at(now_ts)))
        next_ts = now_ts + 30
        with mock.patch('users.two_factor.time.time', return_value=next_ts):
            self.assertTrue(TwoFactorService.verify_code(self.user, totp.at(next_ts)))

        self.user.two_factor.refresh_from_db()
        self.assertEqual(self.user.two_factor.last_used_timestep, next_ts // 30)

    def test_previous_window_code_rejected_as_replay(self):
        secret, _ = self._enable_2fa(self.user)
        totp = pyotp.TOTP(secret)
        now_ts = 1_700_000_000
        old_code = totp.at(now_ts)

        with mock.patch('users.two_factor.time.time', return_value=now_ts):
            self.assertTrue(TwoFactorService.verify_code(self.user, old_code))
        # Server moved into the next window: old_code still matches via the -1
        # offset of the validity window, but its timestep is not newer.
        with mock.patch('users.two_factor.time.time', return_value=now_ts + 30):
            self.assertFalse(TwoFactorService.verify_code(self.user, old_code))
