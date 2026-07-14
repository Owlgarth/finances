"""Unit tests for WorkspaceScopedQuerySet."""

from django.test import TestCase

from accounts.factories import AccountFactory
from accounts.models import Account
from workspaces.factories import WorkspaceFactory


class TestWorkspaceScopedQuerySet(TestCase):
    """Tests for WorkspaceScopedQuerySet.for_workspace() method."""

    def test_for_workspace_filters_by_direct_workspace_id(self):
        ws1 = WorkspaceFactory()
        ws2 = WorkspaceFactory()

        AccountFactory(workspace=ws1, name='A1')
        AccountFactory(workspace=ws1, name='A2')
        AccountFactory(workspace=ws2, name='B1')

        ws1_accounts = Account.objects.for_workspace(ws1.id)
        ws2_accounts = Account.objects.for_workspace(ws2.id)

        self.assertEqual(ws1_accounts.count(), 2)
        self.assertEqual(ws2_accounts.count(), 1)

        ws1_ids = set(ws1_accounts.values_list('id', flat=True))
        ws2_ids = set(ws2_accounts.values_list('id', flat=True))
        self.assertEqual(len(ws1_ids & ws2_ids), 0)

        for account in ws1_accounts:
            self.assertEqual(account.workspace_id, ws1.id)

    def test_for_workspace_returns_empty_queryset_for_nonexistent_workspace(self):
        WorkspaceFactory()

        result = Account.objects.for_workspace(99999)

        self.assertEqual(result.count(), 0)
        self.assertTrue(result.exists() is False)

    def test_for_workspace_raises_valueerror_for_none(self):
        with self.assertRaises(ValueError) as context:
            Account.objects.for_workspace(None)
        self.assertIn('workspace_id is required', str(context.exception))

    def test_for_workspace_raises_valueerror_for_zero(self):
        with self.assertRaises(ValueError) as context:
            Account.objects.for_workspace(0)
        self.assertIn('workspace_id is required', str(context.exception))
