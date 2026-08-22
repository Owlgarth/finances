"""Tests for workspace invitation emails."""

import re
from unittest.mock import patch

from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.db import transaction
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from common.tests.factories import UserFactory
from users.models import User
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.services import WorkspaceMemberService


def _immediate_on_commit(func, *args, **kwargs):
    func()


class TestNewUserInvitationEmail(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_add_new_user_sends_invitation_email(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Finance Team')
        admin = UserFactory(full_name='Admin User')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        class Data:
            email = 'newuser@example.com'
            role = 'member'
            password = 'securepass123'
            full_name = 'New User'

        WorkspaceMemberService.add_member(admin, workspace.id, Data())

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['newuser@example.com'])
        self.assertIn('invited', email.subject.lower())
        self.assertIn('Finance Team', email.subject)

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_invitation_email_contains_workspace_name(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Budget Masters')
        admin = UserFactory(full_name='Admin User')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        class Data:
            email = 'member@example.com'
            role = 'member'
            password = 'securepass123'
            full_name = 'Member'

        WorkspaceMemberService.add_member(admin, workspace.id, Data())

        email = mail.outbox[0]
        self.assertIn('Budget Masters', email.subject)
        self.assertIn('Budget Masters', email.body)

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_invitation_email_does_not_contain_password(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Safe Workspace')
        admin = UserFactory(full_name='Admin User')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        test_password = 'super_secret_password_123!'

        class Data:
            email = 'safeuser@example.com'
            role = 'viewer'
            password = test_password
            full_name = 'Safe User'

        WorkspaceMemberService.add_member(admin, workspace.id, Data())

        email = mail.outbox[0]
        self.assertNotIn(test_password, email.body)
        for alt in email.alternatives:
            self.assertNotIn(test_password, alt[0])


class TestExistingUserInvitationEmail(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_add_existing_user_sends_invitation_email(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Existing Team')
        admin = UserFactory(full_name='Admin User')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')
        existing_user = UserFactory(email='existing@example.com', full_name='Existing User')

        class Data:
            email = existing_user.email
            role = 'member'
            password = None
            full_name = None

        WorkspaceMemberService.add_member(admin, workspace.id, Data())

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['existing@example.com'])
        self.assertIn('added', email.subject.lower())
        self.assertIn('Existing Team', email.subject)
        self.assertIn('Existing Team', email.body)


class TestNewUserSetPasswordEmail(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_add_new_user_without_password_sends_set_password_email(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Set Password Team')
        admin = UserFactory(full_name='Admin User')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        class Data:
            email = 'setpwd@example.com'
            role = 'member'
            password = None
            full_name = 'Set Pwd User'

        WorkspaceMemberService.add_member(admin, workspace.id, Data())

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['setpwd@example.com'])
        self.assertIn('invited', email.subject.lower())
        self.assertIn('Set Password Team', email.subject)

        # The link carries a valid, consumable reset token (same minting as
        # UserService.send_reset_password_email; consumed by /api/auth/reset-password)
        match = re.search(r'/reset-password\?uid=([^&\s]+)&token=([^\s]+)', email.body)
        self.assertIsNotNone(match)
        new_user = User.objects.get(email='setpwd@example.com')
        self.assertEqual(urlsafe_base64_encode(force_bytes(new_user.pk)), match.group(1))
        self.assertTrue(default_token_generator.check_token(new_user, match.group(2)))

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_add_new_user_with_password_still_sends_plain_invitation(self, mock_on_commit):
        """The with-password branch keeps the classic invitation (no reset link)."""
        workspace = WorkspaceFactory(name='Classic Invite')
        admin = UserFactory(full_name='Admin User')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        class Data:
            email = 'classic@example.com'
            role = 'member'
            password = 'securepass123'
            full_name = 'Classic User'

        WorkspaceMemberService.add_member(admin, workspace.id, Data())

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Classic Invite', mail.outbox[0].subject)
        self.assertNotIn('/reset-password', mail.outbox[0].body)
