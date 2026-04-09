"""Tests for workspace event notification emails."""

from unittest.mock import patch

from django.core import mail
from django.db import transaction
from django.test import TestCase

from common.tests.factories import UserFactory
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.services import WorkspaceMemberService, WorkspaceService


def _immediate_on_commit(func, *args, **kwargs):
    func()


class TestRemoveMemberEmail(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_remove_member_sends_email(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Team')
        owner = UserFactory(full_name='Owner', current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        member_user = UserFactory(email='removed@example.com', full_name='Removed User')
        WorkspaceMemberFactory(workspace=workspace, user=member_user, role='member')

        WorkspaceMemberService.remove_member(owner, workspace.id, member_user.id, current_role='owner')

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['removed@example.com'])
        self.assertIn('removed', email.subject.lower())

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_remove_member_email_has_workspace_name(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Finance Hub')
        owner = UserFactory(full_name='Owner', current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        member_user = UserFactory(email='removed@example.com', full_name='Removed User')
        WorkspaceMemberFactory(workspace=workspace, user=member_user, role='member')

        WorkspaceMemberService.remove_member(owner, workspace.id, member_user.id, current_role='owner')

        email = mail.outbox[0]
        self.assertIn('Finance Hub', email.subject)
        self.assertIn('Finance Hub', email.body)


class TestLeaveEmail(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_leave_sends_admin_notifications(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Team')
        owner = UserFactory(full_name='Owner', email='owner@example.com', current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        admin = UserFactory(full_name='Admin', email='admin@example.com')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')
        leaver = UserFactory(full_name='Leaver', email='leaver@example.com')
        WorkspaceMemberFactory(workspace=workspace, user=leaver, role='member')

        WorkspaceMemberService.leave(leaver, workspace.id)

        recipients = [msg.to[0] for msg in mail.outbox]
        self.assertIn('owner@example.com', recipients)
        self.assertIn('admin@example.com', recipients)
        self.assertEqual(len(mail.outbox), 2)

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_leave_does_not_notify_leaver(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Team')
        owner = UserFactory(full_name='Owner', email='owner@example.com', current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        leaver = UserFactory(full_name='Leaver', email='leaver@example.com')
        WorkspaceMemberFactory(workspace=workspace, user=leaver, role='member')

        WorkspaceMemberService.leave(leaver, workspace.id)

        recipients = [msg.to[0] for msg in mail.outbox]
        self.assertNotIn('leaver@example.com', recipients)

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_leave_does_not_notify_viewers(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Team')
        owner = UserFactory(full_name='Owner', email='owner@example.com', current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        viewer = UserFactory(full_name='Viewer', email='viewer@example.com')
        WorkspaceMemberFactory(workspace=workspace, user=viewer, role='viewer')
        leaver = UserFactory(full_name='Leaver', email='leaver@example.com')
        WorkspaceMemberFactory(workspace=workspace, user=leaver, role='member')

        WorkspaceMemberService.leave(leaver, workspace.id)

        recipients = [msg.to[0] for msg in mail.outbox]
        self.assertNotIn('viewer@example.com', recipients)
        self.assertIn('owner@example.com', recipients)
        self.assertEqual(len(mail.outbox), 1)


class TestDeleteWorkspaceEmail(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_delete_workspace_sends_member_notifications(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Doomed WS')
        owner = UserFactory(full_name='Owner', current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        member1 = UserFactory(full_name='Member1', email='member1@example.com')
        WorkspaceMemberFactory(workspace=workspace, user=member1, role='member')
        member1.current_workspace = workspace
        member1.save()

        WorkspaceService.delete_workspace(user=owner, workspace_id=workspace.id)

        recipients = [msg.to[0] for msg in mail.outbox]
        self.assertIn('member1@example.com', recipients)
        self.assertTrue(any('Doomed WS' in msg.subject for msg in mail.outbox))

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_delete_workspace_deleter_not_notified(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Doomed WS')
        owner = UserFactory(full_name='Owner', email='owner@example.com', current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')

        WorkspaceService.delete_workspace(user=owner, workspace_id=workspace.id)

        recipients = [msg.to[0] for msg in mail.outbox]
        self.assertNotIn('owner@example.com', recipients)


class TestUpdateRoleEmail(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_update_role_sends_email(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Team')
        owner = UserFactory(full_name='Owner', current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        member_user = UserFactory(email='target@example.com', full_name='Target User')
        WorkspaceMemberFactory(workspace=workspace, user=member_user, role='member')

        WorkspaceMemberService.update_role(owner, workspace.id, member_user.id, new_role='admin', current_role='owner')

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['target@example.com'])
        self.assertIn('member', email.body.lower())
        self.assertIn('admin', email.body.lower())

    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_update_role_admin_not_notified(self, mock_on_commit):
        workspace = WorkspaceFactory(name='Team')
        owner = UserFactory(full_name='Owner', email='owner@example.com', current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        admin = UserFactory(full_name='Admin', email='admin@example.com')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')
        member_user = UserFactory(email='target@example.com')
        WorkspaceMemberFactory(workspace=workspace, user=member_user, role='member')

        WorkspaceMemberService.update_role(owner, workspace.id, member_user.id, new_role='admin', current_role='owner')

        recipients = [msg.to[0] for msg in mail.outbox]
        self.assertNotIn('owner@example.com', recipients)
        self.assertNotIn('admin@example.com', recipients)
        self.assertEqual(len(mail.outbox), 1)
