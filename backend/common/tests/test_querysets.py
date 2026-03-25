"""Unit tests for WorkspaceScopedQuerySet."""

from django.test import TestCase

from workspaces.factories import WorkspaceFactory


class TestWorkspaceScopedQuerySet(TestCase):
    """Tests for WorkspaceScopedQuerySet.for_workspace() method."""

    def test_for_workspace_filters_by_direct_workspace_id(self):
        ws1 = WorkspaceFactory()
        ws2 = WorkspaceFactory()

        ws1_currencies = ws1.currencies.all()
        ws2_currencies = ws2.currencies.all()

        self.assertEqual(ws1_currencies.count(), 4)
        self.assertEqual(ws2_currencies.count(), 4)

        ws1_ids = set(ws1_currencies.values_list('id', flat=True))
        ws2_ids = set(ws2_currencies.values_list('id', flat=True))

        self.assertEqual(len(ws1_ids), 4)
        self.assertEqual(len(ws2_ids), 4)
        self.assertEqual(len(ws1_ids & ws2_ids), 0)

        for currency in ws1_currencies:
            self.assertEqual(currency.workspace_id, ws1.id)
        for currency in ws2_currencies:
            self.assertEqual(currency.workspace_id, ws2.id)

    def test_for_workspace_returns_empty_queryset_for_nonexistent_workspace(self):
        WorkspaceFactory()

        from workspaces.models import Currency

        result = Currency.objects.for_workspace(99999)

        self.assertEqual(result.count(), 0)
        self.assertTrue(result.exists() is False)

    def test_for_workspace_raises_valueerror_for_none(self):
        WorkspaceFactory()
        from workspaces.models import Currency

        with self.assertRaises(ValueError) as context:
            Currency.objects.for_workspace(None)
        self.assertIn('workspace_id is required', str(context.exception))

    def test_for_workspace_raises_valueerror_for_zero(self):
        WorkspaceFactory()
        from workspaces.models import Currency

        with self.assertRaises(ValueError) as context:
            Currency.objects.for_workspace(0)
        self.assertIn('workspace_id is required', str(context.exception))
