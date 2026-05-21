"""Tests for the Celery email task and EmailService dispatch."""

from unittest.mock import patch

from django.core import mail
from django.test import TestCase

from common.email import EmailService
from common.tasks import send_email_task


class TestSendEmailTask(TestCase):
    """Tests for direct send_email_task invocation."""

    def test_sends_email_via_task(self):
        send_email_task(
            to=['user@example.com'],
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
        )

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['user@example.com'])
        self.assertEqual(email.subject, 'Welcome')

    def test_task_sends_html_alternative(self):
        send_email_task(
            to=['user@example.com'],
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
        )

        email = mail.outbox[0]
        self.assertEqual(len(email.alternatives), 1)
        self.assertEqual(email.alternatives[0][1], 'text/html')

    def test_task_with_no_context(self):
        send_email_task(
            to=['user@example.com'],
            subject='Welcome',
            template_name='email/welcome',
        )

        self.assertEqual(len(mail.outbox), 1)

    def test_task_with_custom_from_email(self):
        send_email_task(
            to=['user@example.com'],
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
            from_email='custom@example.com',
        )

        email = mail.outbox[0]
        self.assertEqual(email.from_email, 'custom@example.com')

    @patch('common.email.EmailMultiAlternatives')
    def test_task_returns_false_on_failure(self, mock_msg_class):
        mock_msg = mock_msg_class.return_value
        mock_msg.send.side_effect = Exception('SMTP error')

        result = send_email_task(
            to=['user@example.com'],
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
        )

        self.assertFalse(result)

    def test_task_with_multiple_recipients(self):
        send_email_task(
            to=['alice@example.com', 'bob@example.com'],
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
        )

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['alice@example.com', 'bob@example.com'])


class TestEmailServiceDispatch(TestCase):
    """Tests for EmailService.send_email dispatching to Celery task."""

    def test_send_email_dispatches_task(self):
        EmailService.send_email(
            to='user@example.com',
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
        )

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['user@example.com'])

    def test_send_email_normalizes_string_to_list(self):
        EmailService.send_email(
            to='user@example.com',
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
        )

        email = mail.outbox[0]
        self.assertEqual(email.to, ['user@example.com'])

    def test_send_email_passes_list_recipients(self):
        EmailService.send_email(
            to=['alice@example.com', 'bob@example.com'],
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
        )

        email = mail.outbox[0]
        self.assertEqual(email.to, ['alice@example.com', 'bob@example.com'])

    def test_send_email_returns_true_immediately(self):
        result = EmailService.send_email(
            to='user@example.com',
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
        )

        self.assertTrue(result)

    @patch('common.tasks.send_email_task.delay')
    def test_send_email_falls_back_to_sync_when_celery_unavailable(self, mock_delay):
        mock_delay.side_effect = Exception('Celery connection error')

        result = EmailService.send_email(
            to='user@example.com',
            subject='Welcome',
            template_name='email/welcome',
            context={'user_name': 'Alice'},
        )

        self.assertTrue(result)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['user@example.com'])
        self.assertEqual(email.subject, 'Welcome')


class TestSendEmailTaskRetryConfig(TestCase):
    """Tests for send_email_task retry configuration."""

    def test_task_has_autoretry_for_exception(self):
        self.assertIn(Exception, send_email_task.autoretry_for)

    def test_task_has_max_retries(self):
        self.assertEqual(send_email_task.max_retries, 3)

    def test_task_has_retry_backoff(self):
        self.assertTrue(send_email_task.retry_backoff)
