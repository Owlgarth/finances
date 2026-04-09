"""Tests for password reset and password changed email flow."""

from unittest.mock import patch

from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.db import transaction
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from core.tests.base import AuthTestCase
from workspaces.factories import WorkspaceMemberFactory


def _immediate_on_commit(func, *args, **kwargs):
    func()


class TestForgotPassword(AuthTestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_forgot_password_sends_email(self, mock_on_commit):
        self.create_user(email='forgot@example.com', password='testpass123')

        data = self.post('/api/auth/forgot-password', {'email': 'forgot@example.com'})
        self.assertStatus(200)
        self.assertIn('reset link has been sent', data['message'].lower())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['forgot@example.com'])
        self.assertIn('Reset your password', mail.outbox[0].subject)

    def test_forgot_password_unknown_email_returns_200(self):
        data = self.post('/api/auth/forgot-password', {'email': 'nonexistent@example.com'})
        self.assertStatus(200)
        self.assertIn('reset link has been sent', data['message'].lower())
        self.assertEqual(len(mail.outbox), 0)

    def test_forgot_password_rate_limited(self):
        from django.core.cache import cache

        cache.clear()

        self.create_user(email='ratelimit@example.com', password='testpass123')

        for _ in range(3):
            self.post('/api/auth/forgot-password', {'email': 'ratelimit@example.com'})
            self.assertStatus(200)

        self.post('/api/auth/forgot-password', {'email': 'ratelimit@example.com'})
        self.assertStatus(429)


class TestResetPassword(AuthTestCase):
    def _generate_reset_payload(self, user, new_password='newpassword123'):
        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        return {'uidb64': uidb64, 'token': token, 'new_password': new_password}

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_reset_password_success(self, mock_on_commit):
        user = self.create_user(email='reset@example.com', password='oldpassword123')
        payload = self._generate_reset_payload(user)

        data = self.post('/api/auth/reset-password', payload)
        self.assertStatus(200)
        self.assertEqual(data['message'], 'Password has been reset successfully')

        user.refresh_from_db()
        self.assertTrue(user.check_password('newpassword123'))

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('password was changed', mail.outbox[0].subject.lower())

    def test_reset_password_invalid_uid(self):
        self.post(
            '/api/auth/reset-password',
            {
                'uidb64': 'invalid',
                'token': 'invalid',
                'new_password': 'newpassword123',
            },
        )
        self.assertStatus(400)

    def test_reset_password_invalid_token(self):
        user = self.create_user(email='badtoken@example.com', password='oldpassword123')
        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))

        self.post(
            '/api/auth/reset-password',
            {
                'uidb64': uidb64,
                'token': 'invalid-token',
                'new_password': 'newpassword123',
            },
        )
        self.assertStatus(400)

    def test_reset_password_token_single_use(self):
        user = self.create_user(email='reuse@example.com', password='oldpassword123')
        payload = self._generate_reset_payload(user)

        self.post('/api/auth/reset-password', payload)
        self.assertStatus(200)

        self.post('/api/auth/reset-password', payload)
        self.assertStatus(400)


class TestPasswordChangedNotification(AuthTestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_change_password_sends_notification(self, mock_on_commit):
        token = self.register_and_login('selfchange@example.com', 'oldpassword123', 'Self Change')

        self.put(
            '/api/users/me/password',
            {'current_password': 'oldpassword123', 'new_password': 'newpassword456'},
            **self.auth_headers(token),
        )
        self.assertStatus(200)

        password_changed_emails = [m for m in mail.outbox if 'password was changed' in m.subject.lower()]
        self.assertEqual(len(password_changed_emails), 1)
        self.assertEqual(password_changed_emails[0].to, ['selfchange@example.com'])


class TestAdminResetPasswordNotification(AuthMixin, APIClientMixin, TestCase):
    user_role = 'owner'

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command('seed_legal_documents', verbosity=0)

    def test_admin_reset_password_sends_notification(self):
        member = UserFactory(
            email='member@example.com',
            full_name='Member User',
            current_workspace=self.workspace,
        )
        member.set_password('memberpass123')
        member.save()
        WorkspaceMemberFactory(
            workspace=self.workspace,
            user=member,
            role='member',
        )

        with patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit):
            self.put(
                f'/api/workspaces/{self.workspace.id}/members/{member.id}/reset-password',
                {'new_password': 'adminreset123'},
                **self.auth_headers(),
            )
            self.assertStatus(200)

        password_changed_emails = [m for m in mail.outbox if 'password was changed' in m.subject.lower()]
        self.assertEqual(len(password_changed_emails), 1)
        self.assertEqual(password_changed_emails[0].to, ['member@example.com'])

        html_body = password_changed_emails[0].alternatives[0][0] if password_changed_emails[0].alternatives else ''
        self.assertIn('administrator', html_body)
