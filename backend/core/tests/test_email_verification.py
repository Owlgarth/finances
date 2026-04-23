"""Tests for email verification and welcome email flow."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.db import transaction
from django.test import override_settings

from common.tokens import generate_verification_token
from core.tests.base import AuthTestCase

User = get_user_model()


def _immediate_on_commit(func, *args, **kwargs):
    func()


class TestVerifyEmail(AuthTestCase):
    def test_verify_email_success(self):
        user = self.create_user(email='verify@example.com', password='testpass123')
        user.email_verified = False
        user.save(update_fields=['email_verified'])

        token = generate_verification_token(user.id)

        data = self.post('/api/auth/verify-email', {'token': token})
        self.assertStatus(200)
        self.assertEqual(data['message'], 'Email verified successfully')

        user.refresh_from_db()
        self.assertTrue(user.email_verified)

    def test_verify_email_already_verified(self):
        user = self.create_user(email='already@example.com', password='testpass123')
        user.email_verified = True
        user.save(update_fields=['email_verified'])

        token = generate_verification_token(user.id)

        data = self.post('/api/auth/verify-email', {'token': token})
        self.assertStatus(400)
        self.assertIn('already verified', data['detail'].lower())

    def test_verify_email_invalid_token(self):
        data = self.post('/api/auth/verify-email', {'token': 'invalid-token'})
        self.assertStatus(400)
        self.assertIn('invalid', data['detail'].lower())

    def test_verify_email_expired_token(self):
        user = self.create_user(email='expired@example.com', password='testpass123')
        user.email_verified = False
        user.save(update_fields=['email_verified'])

        token = generate_verification_token(user.id)

        with patch('common.tokens.TimestampSigner.unsign', side_effect=Exception('expired')):
            self.post('/api/auth/verify-email', {'token': token})
        self.assertStatus(400)


class TestResendVerification(AuthTestCase):
    def test_resend_verification_sends_email(self):
        user = self.create_user(email='resend@example.com', password='testpass123')
        user.email_verified = False
        user.save(update_fields=['email_verified'])

        data = self.post('/api/auth/resend-verification', {'email': 'resend@example.com'})
        self.assertStatus(200)
        self.assertIn('verification email has been sent', data['message'].lower())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['resend@example.com'])
        self.assertIn('Verify your email', mail.outbox[0].subject)

    def test_resend_verification_returns_same_message_for_unknown_email(self):
        data = self.post('/api/auth/resend-verification', {'email': 'nonexistent@example.com'})
        self.assertStatus(200)
        self.assertIn('verification email has been sent', data['message'].lower())

        data2 = self.post('/api/auth/resend-verification', {'email': 'anotherunknown@example.com'})
        self.assertStatus(200)

        self.assertEqual(data['message'], data2['message'])

    def test_resend_verification_rate_limited(self):
        from django.core.cache import cache

        cache.clear()

        user = self.create_user(email='rate@example.com', password='testpass123')
        user.email_verified = False
        user.save(update_fields=['email_verified'])

        for _ in range(3):
            self.post('/api/auth/resend-verification', {'email': 'rate@example.com'})
            self.assertStatus(200)

        self.post('/api/auth/resend-verification', {'email': 'rate@example.com'})
        self.assertStatus(429)


@override_settings(DEMO_MODE=False)
class TestRegistrationEmails(AuthTestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_registration_sends_verification_and_welcome(self, mock_on_commit):
        self.post(
            '/api/auth/register',
            {
                'email': 'newreg@example.com',
                'password': 'securepassword123',
                'full_name': 'New Reg',
                'workspace_name': 'Reg Workspace',
                'accepted_terms_version': '1.0',
                'accepted_privacy_version': '1.0',
            },
        )
        self.assertStatus(201)

        self.assertEqual(len(mail.outbox), 2)
        subjects = [msg.subject for msg in mail.outbox]
        self.assertIn('Verify your email — Denarly', subjects)
        self.assertIn('Welcome to Denarly!', subjects)

        user = User.objects.get(email='newreg@example.com')
        self.assertFalse(user.email_verified)
