"""Tests for workspace invitation emails."""

from unittest.mock import patch

from django.core import mail
from django.db import transaction
from django.test import TestCase

from common.tests.factories import UserFactory
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
