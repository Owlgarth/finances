"""Model-level tests for UserWorkspaceSettings: defaults, uniqueness, version constraint, cascades."""

from django.db import IntegrityError
from django.db import transaction as db_transaction
from django.test import TestCase

from common.tests.factories import UserFactory
from workspaces.factories import UserWorkspaceSettingsFactory, WorkspaceFactory
from workspaces.models import UserWorkspaceSettings


class UserWorkspaceSettingsModelTests(TestCase):
    def setUp(self):
        self.workspace = WorkspaceFactory()
        self.user = UserFactory(current_workspace=self.workspace)

    def test_defaults(self):
        row = UserWorkspaceSettingsFactory(workspace=self.workspace, user=self.user)
        self.assertEqual(row.settings, {})
        self.assertEqual(row.version, 1)
        self.assertEqual(UserWorkspaceSettings.objects.for_workspace(self.workspace.id).count(), 1)

    def test_unique_per_user_and_workspace(self):
        UserWorkspaceSettingsFactory(workspace=self.workspace, user=self.user)
        with self.assertRaises(IntegrityError):
            with db_transaction.atomic():  # SAVEPOINT - isolates the rollback
                UserWorkspaceSettingsFactory(workspace=self.workspace, user=self.user)
        self.assertEqual(UserWorkspaceSettings.objects.count(), 1)

    def test_same_user_other_workspace_allowed(self):
        other = WorkspaceFactory()
        UserWorkspaceSettingsFactory(workspace=self.workspace, user=self.user)
        UserWorkspaceSettingsFactory(workspace=other, user=self.user)
        self.assertEqual(UserWorkspaceSettings.objects.count(), 2)

    def test_other_user_same_workspace_allowed(self):
        other_user = UserFactory(current_workspace=self.workspace)
        UserWorkspaceSettingsFactory(workspace=self.workspace, user=self.user)
        UserWorkspaceSettingsFactory(workspace=self.workspace, user=other_user)
        self.assertEqual(UserWorkspaceSettings.objects.count(), 2)

    def test_version_gte_1(self):
        for bad in (0, -1):
            with self.assertRaises(IntegrityError):
                with db_transaction.atomic():  # SAVEPOINT - isolates the rollback
                    UserWorkspaceSettingsFactory(workspace=self.workspace, user=self.user, version=bad)
        UserWorkspaceSettingsFactory(workspace=self.workspace, user=self.user, version=2)
        self.assertEqual(UserWorkspaceSettings.objects.count(), 1)

    def test_cascade_with_user(self):
        UserWorkspaceSettingsFactory(workspace=self.workspace, user=self.user)
        self.user.delete()
        self.assertEqual(UserWorkspaceSettings.objects.count(), 0)

    def test_cascade_with_workspace(self):
        UserWorkspaceSettingsFactory(workspace=self.workspace, user=self.user)
        self.workspace.delete()
        self.assertEqual(UserWorkspaceSettings.objects.count(), 0)
