"""Tests for email change flow."""

from unittest.mock import patch

from django.core import mail
from django.db import transaction

from common.auth import create_access_token
from common.tests.factories import UserFactory
from common.tokens import generate_email_change_token
from core.tests.base import AuthTestCase


def _immediate_on_commit(func, *args, **kwargs):
    func()


class TestRequestEmailChange(AuthTestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_request_email_change_sends_verification(self, mock_on_commit):
        token = self.register_and_login('change@example.com', 'testpass123', 'Change User')
        mail.outbox.clear()

        data = self.post(
            '/api/auth/request-email-change',
            {'password': 'testpass123', 'new_email': 'newemail@example.com'},
            **self.auth_headers(token),
        )
        self.assertStatus(200)
        self.assertIn('verification email sent', data['message'].lower())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['newemail@example.com'])
        self.assertIn('Confirm your new email', mail.outbox[0].subject)

    def test_request_email_change_wrong_password(self):
        token = self.register_and_login('wrongpw@example.com', 'testpass123', 'Wrong PW')

        self.post(
            '/api/auth/request-email-change',
            {'password': 'wrongpassword', 'new_email': 'new@example.com'},
            **self.auth_headers(token),
        )
        self.assertStatus(401)
        self.assertIn('invalid', self.response.json()['detail'].lower())

    def test_request_email_change_same_email(self):
        token = self.register_and_login('same@example.com', 'testpass123', 'Same Email')

        data = self.post(
            '/api/auth/request-email-change',
            {'password': 'testpass123', 'new_email': 'same@example.com'},
            **self.auth_headers(token),
        )
        self.assertStatus(400)
        self.assertIn('different', data['detail'].lower())

    def test_request_email_change_email_in_use(self):
        self.create_user(email='taken@example.com', password='testpass123')
        token = self.register_and_login('changer@example.com', 'testpass123', 'Changer')

        data = self.post(
            '/api/auth/request-email-change',
            {'password': 'testpass123', 'new_email': 'taken@example.com'},
            **self.auth_headers(token),
        )
        self.assertStatus(400)
        self.assertIn('already in use', data['detail'].lower())

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_request_email_change_uppercase_normalized(self, mock_on_commit):
        user = UserFactory(email='original@example.com', full_name='Upper User')
        user.set_password('testpass123')
        user.save()
        token = create_access_token(user)
        mail.outbox.clear()

        self.post(
            '/api/auth/request-email-change',
            {'password': 'testpass123', 'new_email': 'UPPER@Example.COM'},
            **self.auth_headers(token),
        )
        self.assertStatus(200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['upper@example.com'])

        user.refresh_from_db()
        self.assertEqual(user.pending_email, 'upper@example.com')

        change_token = generate_email_change_token(user.id, 'upper@example.com')
        mail.outbox.clear()

        self.post(
            '/api/auth/confirm-email-change',
            {'token': change_token},
            **self.auth_headers(token),
        )
        self.assertStatus(200)

        user.refresh_from_db()
        self.assertEqual(user.email, 'upper@example.com')
        self.assertTrue(user.email_verified)


class TestConfirmEmailChange(AuthTestCase):
    def _setup_user_with_pending_email(self):
        user = UserFactory(email='confirm@example.com', full_name='Confirm User')
        user.set_password('testpass123')
        user.pending_email = 'newconfirm@example.com'
        user.save()
        token = create_access_token(user)
        return token, user

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_confirm_email_change_success(self, mock_on_commit):
        token, user = self._setup_user_with_pending_email()
        change_token = generate_email_change_token(user.id, 'newconfirm@example.com')
        mail.outbox.clear()

        data = self.post(
            '/api/auth/confirm-email-change',
            {'token': change_token},
            **self.auth_headers(token),
        )
        self.assertStatus(200)
        self.assertEqual(data['message'], 'Email changed successfully')

        user.refresh_from_db()
        self.assertEqual(user.email, 'newconfirm@example.com')
        self.assertEqual(user.pending_email, '')
        self.assertTrue(user.email_verified)

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['confirm@example.com'])
        self.assertIn('email was changed', mail.outbox[0].subject.lower())

    def test_confirm_email_change_invalid_token(self):
        token, _ = self._setup_user_with_pending_email()

        data = self.post(
            '/api/auth/confirm-email-change',
            {'token': 'invalid-token'},
            **self.auth_headers(token),
        )
        self.assertStatus(400)
        self.assertIn('invalid', data['detail'].lower())

    def test_confirm_email_change_wrong_user(self):
        token, _ = self._setup_user_with_pending_email()
        other = self.create_user(email='other@example.com', password='testpass123', full_name='Other')
        change_token = generate_email_change_token(other.id, 'newconfirm@example.com')

        self.post(
            '/api/auth/confirm-email-change',
            {'token': change_token},
            **self.auth_headers(token),
        )
        self.assertStatus(400)

    def test_confirm_email_change_pending_email_mismatch(self):
        token, user = self._setup_user_with_pending_email()
        change_token = generate_email_change_token(user.id, 'different@example.com')

        data = self.post(
            '/api/auth/confirm-email-change',
            {'token': change_token},
            **self.auth_headers(token),
        )
        self.assertStatus(400)
        self.assertIn('no longer valid', data['detail'].lower())

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_confirm_email_change_email_now_taken(self, mock_on_commit):
        token, user = self._setup_user_with_pending_email()
        self.create_user(email='newconfirm@example.com', password='testpass123', full_name='Taker')
        change_token = generate_email_change_token(user.id, 'newconfirm@example.com')

        data = self.post(
            '/api/auth/confirm-email-change',
            {'token': change_token},
            **self.auth_headers(token),
        )
        self.assertStatus(400)
        self.assertIn('already in use', data['detail'].lower())
