"""Tests for UserWorkspaceSettingsService: schemas, normalization, PATCH semantics."""

from django.test import TestCase
from pydantic import ValidationError as PydanticValidationError

from common.tests.factories import UserFactory
from workspaces.factories import WorkspaceFactory
from workspaces.models import UserWorkspaceSettings
from workspaces.schemas import TransactionsSettingsUpdate, UserWorkspaceSettingsUpdate
from workspaces.services import UserWorkspaceSettingsService

# The pinned fresh shape: every facet null (no preference - architect
# correction 2026-10-27; NOT a 'month' pre-fill on planned.range).
FRESH_SHAPE = {
    'version': 1,
    'planned': {'status': None, 'range': None, 'view': None, 'ordering': None},
    'transactions': {'range': None, 'type': None, 'ordering': None},
    'transfers': {'range': None},
}


def _make_row(user, workspace, settings, version=1):
    """Seed a settings row directly - the hand-crafted blob IS the fixture."""
    return UserWorkspaceSettings.objects.create(
        workspace=workspace,
        user=user,
        settings=settings,
        version=version,
        created_by=user,
        updated_by=user,
    )


class TestGet(TestCase):
    """get_or_create semantics and the read-never-writes-back rule."""

    def test_get_creates_fresh_row_for_new_user(self):
        user = UserFactory()
        workspace = WorkspaceFactory()

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertEqual(result, FRESH_SHAPE)
        row = UserWorkspaceSettings.objects.for_workspace(workspace.id).get(user=user)
        self.assertEqual(row.version, 1)
        # Version lives in the column, never inside the stored blob.
        self.assertNotIn('version', row.settings)
        self.assertIsNone(row.settings['planned']['range'])

    def test_get_second_call_returns_stored_row_not_fresh_defaults(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        UserWorkspaceSettingsService.get(user, workspace.id)  # create
        UserWorkspaceSettingsService.update(
            user, workspace.id, UserWorkspaceSettingsUpdate(transfers={'range': 'week'})
        )

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertEqual(result['transfers'], {'range': 'week'})
        self.assertIsNone(result['planned']['range'])  # untouched page
        self.assertEqual(UserWorkspaceSettings.objects.count(), 1)

    def test_get_does_not_write_back_repairs(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        row = _make_row(user, workspace, settings={'planned': {'status': 'bogus'}, 'dashboard': {'x': 1}})

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertIsNone(result['planned']['status'])
        self.assertNotIn('dashboard', result)
        row.refresh_from_db()
        self.assertEqual(row.settings, {'planned': {'status': 'bogus'}, 'dashboard': {'x': 1}})


class TestUpdatePageReplace(TestCase):
    """PATCH semantics: page-level replace, absent pages untouched."""

    def test_present_page_replaces_whole_subobject(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(
            user,
            workspace,
            settings={
                'planned': {'status': 'done', 'range': 'week', 'view': 'recurring', 'ordering': 'name'},
                'transactions': {'range': 'year', 'type': ['income'], 'ordering': 'amount'},
                'transfers': {'range': 'all'},
            },
        )

        result = UserWorkspaceSettingsService.update(
            user, workspace.id, UserWorkspaceSettingsUpdate(planned={'status': 'pending'})
        )

        self.assertEqual(result['planned'], {'status': 'pending', 'range': None, 'view': None, 'ordering': None})
        self.assertEqual(result['transactions'], {'range': 'year', 'type': ['income'], 'ordering': 'amount'})
        self.assertEqual(result['transfers'], {'range': 'all'})
        row = UserWorkspaceSettings.objects.for_workspace(workspace.id).get(user=user)
        self.assertEqual(row.settings['planned'], {'status': 'pending', 'range': None, 'view': None, 'ordering': None})

    def test_empty_page_object_resets_every_facet(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(
            user,
            workspace,
            settings={'transactions': {'range': 'year', 'type': ['income'], 'ordering': 'amount'}},
        )

        result = UserWorkspaceSettingsService.update(user, workspace.id, UserWorkspaceSettingsUpdate(transactions={}))

        self.assertEqual(result['transactions'], {'range': None, 'type': None, 'ordering': None})

    def test_explicit_null_page_is_noop(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(user, workspace, settings={'transfers': {'range': 'week'}})

        result = UserWorkspaceSettingsService.update(user, workspace.id, UserWorkspaceSettingsUpdate(transfers=None))

        self.assertEqual(result['transfers'], {'range': 'week'})

    def test_update_returns_full_shape(self):
        user = UserFactory()
        workspace = WorkspaceFactory()

        result = UserWorkspaceSettingsService.update(
            user, workspace.id, UserWorkspaceSettingsUpdate(planned={'view': 'recurring'})
        )

        self.assertEqual(set(result), {'version', 'planned', 'transactions', 'transfers'})
        self.assertEqual(result['version'], 1)

    def test_update_sets_updated_by(self):
        user = UserFactory()
        other = UserFactory()
        workspace = WorkspaceFactory()
        row = _make_row(user, workspace, settings={})
        row.updated_by = other  # observable initial state: someone else touched it last
        row.save(update_fields=['updated_by'])

        UserWorkspaceSettingsService.update(user, workspace.id, UserWorkspaceSettingsUpdate())

        row.refresh_from_db()
        self.assertEqual(row.updated_by, user)

    def test_update_on_newer_version_row_writes_back(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        row = _make_row(user, workspace, settings={'transfers': {'range': 'week'}}, version=2)

        result = UserWorkspaceSettingsService.update(
            user, workspace.id, UserWorkspaceSettingsUpdate(transfers={'range': 'year'})
        )

        self.assertEqual(result['version'], 1)
        row.refresh_from_db()
        self.assertEqual(row.version, 1)
        self.assertEqual(row.settings['transfers'], {'range': 'year'})


class TestTypeNormalization(TestCase):
    """transactions.type: dedupe, empty->null, Literal 422s (schema side)."""

    def test_schema_dedupes_preserving_first_occurrence(self):
        page = TransactionsSettingsUpdate(type=['expense', 'income', 'expense'])
        self.assertEqual(page.type, ['expense', 'income'])

    def test_schema_empty_list_normalizes_to_null(self):
        self.assertIsNone(TransactionsSettingsUpdate(type=[]).type)

    def test_schema_unknown_literal_rejected(self):
        with self.assertRaises(PydanticValidationError):
            TransactionsSettingsUpdate(type=['income', 'bogus'])

    def test_schema_unhashable_member_rejected_not_500(self):
        with self.assertRaises(PydanticValidationError):
            TransactionsSettingsUpdate(type=[{'a': 1}])

    def test_update_type_round_trip(self):
        user = UserFactory()
        workspace = WorkspaceFactory()

        result = UserWorkspaceSettingsService.update(
            user,
            workspace.id,
            UserWorkspaceSettingsUpdate(transactions={'type': ['expense', 'income', 'expense']}),
        )

        self.assertEqual(result['transactions']['type'], ['expense', 'income'])

    def test_update_empty_type_resets_to_null(self):
        user = UserFactory()
        workspace = WorkspaceFactory()

        result = UserWorkspaceSettingsService.update(
            user, workspace.id, UserWorkspaceSettingsUpdate(transactions={'type': []})
        )

        self.assertIsNone(result['transactions']['type'])


class TestGarbageDegradationOnRead(TestCase):
    """Stored-blob tolerance: drop unknown keys, degrade garbage to null."""

    def test_unknown_enum_values_degrade_to_null(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(
            user,
            workspace,
            settings={'planned': {'status': 'bogus', 'range': 'fortnight'}},
        )

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertIsNone(result['planned']['status'])
        self.assertIsNone(result['planned']['range'])

    def test_unknown_top_level_key_dropped(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(user, workspace, settings={'dashboard': {'theme': 'dark'}})

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertEqual(set(result), {'version', 'planned', 'transactions', 'transfers'})

    def test_unknown_facet_key_dropped(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(user, workspace, settings={'planned': {'status': 'done', 'frobnicate': 'x'}})

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertEqual(result['planned'], {'status': 'done', 'range': None, 'view': None, 'ordering': None})

    def test_wrong_typed_facets_degrade_to_null(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(
            user,
            workspace,
            settings={
                'planned': {'status': 42, 'range': True, 'view': ['planned'], 'ordering': 3.5},
                'transactions': {'type': 'income'},
            },
        )

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertEqual(result['planned'], {'status': None, 'range': None, 'view': None, 'ordering': None})
        self.assertIsNone(result['transactions']['type'])

    def test_non_dict_page_degrades_to_all_null(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(user, workspace, settings={'planned': 'garbage', 'transfers': [1, 2]})

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertEqual(result['planned'], {'status': None, 'range': None, 'view': None, 'ordering': None})
        self.assertEqual(result['transfers'], {'range': None})

    def test_non_dict_blob_degrades_to_all_null(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(user, workspace, settings='garbage')

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertEqual(
            result,
            {
                'version': 1,
                'planned': {'status': None, 'range': None, 'view': None, 'ordering': None},
                'transactions': {'range': None, 'type': None, 'ordering': None},
                'transfers': {'range': None},
            },
        )

    def test_type_list_filters_unknown_and_dedupes(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(
            user,
            workspace,
            settings={'transactions': {'type': ['income', 'bogus', 'income', 'expense', 7]}},
        )

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertEqual(result['transactions']['type'], ['income', 'expense'])


class TestVersionUpgradePipeline(TestCase):
    """The (empty) v1 pipeline hook: passthrough, floor, clamp, write-back."""

    def test_upgrade_v1_is_identity(self):
        blob = {'planned': {'status': 'done'}}
        self.assertEqual(UserWorkspaceSettingsService._upgrade(blob, 1), (blob, 1))

    def test_upgrade_v0_floors_and_passes_through(self):
        # A v0 row cannot exist (check constraint); the floor is exercised
        # as a direct unit call - the documented way to test the hook
        # while v1 is greenfield.
        blob = {'planned': {'status': 'done'}}
        self.assertEqual(UserWorkspaceSettingsService._upgrade(blob, 0), (blob, 1))

    def test_upgrade_future_version_clamps_report(self):
        blob = {'transfers': {'range': 'week'}}
        self.assertEqual(UserWorkspaceSettingsService._upgrade(blob, 99), (blob, 1))

    def test_get_on_newer_version_row_reports_current_without_writeback(self):
        user = UserFactory()
        workspace = WorkspaceFactory()
        row = _make_row(user, workspace, settings={'transfers': {'range': 'week'}}, version=2)

        result = UserWorkspaceSettingsService.get(user, workspace.id)

        self.assertEqual(result['version'], 1)
        self.assertEqual(result['transfers'], {'range': 'week'})
        row.refresh_from_db()
        self.assertEqual(row.version, 2)


class TestIsolation(TestCase):
    """user+workspace scoping: foreign rows invisible, never 403."""

    def test_other_user_gets_own_fresh_row(self):
        user_a = UserFactory()
        user_b = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(user_a, workspace, settings={'transfers': {'range': 'week'}})

        result_b = UserWorkspaceSettingsService.get(user_b, workspace.id)
        result_a = UserWorkspaceSettingsService.get(user_a, workspace.id)

        self.assertEqual(result_b, FRESH_SHAPE)
        self.assertEqual(result_a['transfers'], {'range': 'week'})
        self.assertEqual(UserWorkspaceSettings.objects.count(), 2)

    def test_other_user_update_never_touches_other_row(self):
        user_a = UserFactory()
        user_b = UserFactory()
        workspace = WorkspaceFactory()
        _make_row(user_a, workspace, settings={'transfers': {'range': 'week'}})

        UserWorkspaceSettingsService.update(
            user_b, workspace.id, UserWorkspaceSettingsUpdate(transfers={'range': 'year'})
        )

        row_a = UserWorkspaceSettings.objects.for_workspace(workspace.id).get(user=user_a)
        self.assertEqual(row_a.settings['transfers'], {'range': 'week'})

    def test_other_workspace_isolated(self):
        user = UserFactory()
        ws1 = WorkspaceFactory()
        ws2 = WorkspaceFactory()
        _make_row(user, ws1, settings={'transfers': {'range': 'week'}})

        UserWorkspaceSettingsService.update(user, ws2.id, UserWorkspaceSettingsUpdate(transfers={'range': 'year'}))

        self.assertEqual(UserWorkspaceSettings.objects.count(), 2)
        self.assertEqual(UserWorkspaceSettingsService.get(user, ws1.id)['transfers'], {'range': 'week'})
        self.assertEqual(UserWorkspaceSettingsService.get(user, ws2.id)['transfers'], {'range': 'year'})
