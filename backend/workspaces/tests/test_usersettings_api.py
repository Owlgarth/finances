"""API tests for GET/PATCH /api/workspaces/member-settings (personal, no role gate)."""

from django.test import TestCase

from common.auth import create_access_token
from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.models import UserWorkspaceSettings

# The pinned fresh shape (task 2 service contract, architect ruling
# 2026-10-27): every facet null = "no preference" (the page falls back
# to its built-in).
FRESH_SHAPE = {
    'version': 1,
    'planned': {'status': None, 'range': None, 'view': None, 'ordering': None},
    'transactions': {'range': None, 'type': None, 'ordering': None},
    'transfers': {'range': None},
}


class MemberSettingsAPITestCase(APIClientMixin, AuthMixin, TestCase):
    """Base: owner (self.user, via AuthMixin) + a member-role second user + a second workspace."""

    def setUp(self):
        APIClientMixin.setUp(self)
        AuthMixin.setUp(self)

        self.member_user = UserFactory(
            email='member@example.com',
            current_workspace=self.workspace,
        )
        WorkspaceMemberFactory(
            workspace=self.workspace,
            user=self.member_user,
            role='member',
        )

        self.other_workspace = WorkspaceFactory(name='Other Workspace')
        WorkspaceMemberFactory(
            workspace=self.other_workspace,
            user=self.user,
            role='admin',
        )

    def token_headers_for(self, user):
        """Bearer headers for a user other than self.user (AuthMixin mints only self.user's)."""
        return {'HTTP_AUTHORIZATION': f'Bearer {create_access_token(user)}'}


class TestGetMemberSettings(MemberSettingsAPITestCase):
    """GET /member-settings: full fresh shape, get_or_create, idempotence, auth."""

    def test_get_without_auth_returns_401(self):
        self.get('/api/workspaces/member-settings')
        self.assertStatus(401)

    def test_get_returns_full_fresh_shape(self):
        data = self.get('/api/workspaces/member-settings', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, FRESH_SHAPE)

    def test_get_creates_the_row(self):
        self.get('/api/workspaces/member-settings', **self.auth_headers())
        self.assertStatus(200)
        row = UserWorkspaceSettings.objects.for_workspace(self.workspace.id).get(user=self.user)
        self.assertEqual(row.version, 1)

    def test_get_twice_leaves_one_row(self):
        self.get('/api/workspaces/member-settings', **self.auth_headers())
        data = self.get('/api/workspaces/member-settings', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, FRESH_SHAPE)
        self.assertEqual(UserWorkspaceSettings.objects.count(), 1)


class TestPatchMemberSettings(MemberSettingsAPITestCase):
    """PATCH /member-settings: page-level replace, absent pages untouched, 422s."""

    def test_patch_without_auth_returns_401(self):
        self.patch('/api/workspaces/member-settings', {'transfers': {'range': 'week'}})
        self.assertStatus(401)

    def test_patch_one_page_leaves_other_pages_untouched(self):
        data = self.patch(
            '/api/workspaces/member-settings',
            {'transfers': {'range': 'week'}},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['transfers'], {'range': 'week'})
        self.assertEqual(data['planned'], FRESH_SHAPE['planned'])
        self.assertEqual(data['transactions'], FRESH_SHAPE['transactions'])

    def test_patch_page_replace_resets_omitted_facets_to_null(self):
        self.patch(
            '/api/workspaces/member-settings',
            {'planned': {'status': 'done', 'range': 'year', 'view': 'recurring', 'ordering': 'name'}},
            **self.auth_headers(),
        )
        self.assertStatus(200)

        data = self.patch(
            '/api/workspaces/member-settings',
            {'planned': {'status': 'pending'}},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['planned'], {'status': 'pending', 'range': None, 'view': None, 'ordering': None})

    def test_patch_unknown_enum_literal_returns_422(self):
        self.patch(
            '/api/workspaces/member-settings',
            {'planned': {'status': 'bogus'}},
            **self.auth_headers(),
        )
        self.assertStatus(422)
        # The 422 fires at body parsing - the service (and its get_or_create) never ran.
        self.assertEqual(UserWorkspaceSettings.objects.count(), 0)

    def test_patch_dedupes_type_list_in_response(self):
        data = self.patch(
            '/api/workspaces/member-settings',
            {'transactions': {'type': ['expense', 'income', 'expense']}},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['transactions']['type'], ['expense', 'income'])

    def test_patch_empty_body_returns_full_shape(self):
        data = self.patch('/api/workspaces/member-settings', {}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, FRESH_SHAPE)


class TestMemberSettingsViewerRoleAPI(MemberSettingsAPITestCase):
    """Member settings are personal: a viewer GETs and PATCHes their own - no role gate."""

    user_role = 'viewer'

    def test_viewer_can_get_own_settings(self):
        data = self.get('/api/workspaces/member-settings', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, FRESH_SHAPE)

    def test_viewer_can_patch_own_settings(self):
        data = self.patch(
            '/api/workspaces/member-settings',
            {'transfers': {'range': 'all'}},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['transfers'], {'range': 'all'})
        self.assertEqual(UserWorkspaceSettings.objects.count(), 1)


class TestMemberSettingsIsolationAPI(MemberSettingsAPITestCase):
    """Cross-user and cross-workspace isolation: foreign rows are unreachable by construction."""

    def test_second_member_has_independent_row(self):
        self.patch(
            '/api/workspaces/member-settings',
            {'transfers': {'range': 'week'}},
            **self.auth_headers(),
        )
        self.assertStatus(200)

        data_b = self.get('/api/workspaces/member-settings', **self.token_headers_for(self.member_user))
        self.assertStatus(200)
        self.assertEqual(data_b, FRESH_SHAPE)
        self.assertEqual(UserWorkspaceSettings.objects.count(), 2)

    def test_second_member_patch_never_touches_owner_row(self):
        self.patch(
            '/api/workspaces/member-settings',
            {'transfers': {'range': 'week'}},
            **self.auth_headers(),
        )

        self.patch(
            '/api/workspaces/member-settings',
            {'transfers': {'range': 'year'}},
            **self.token_headers_for(self.member_user),
        )
        self.assertStatus(200)

        row_a = UserWorkspaceSettings.objects.for_workspace(self.workspace.id).get(user=self.user)
        self.assertEqual(row_a.settings['transfers'], {'range': 'week'})

    def test_settings_do_not_leak_across_workspaces(self):
        # Workspace A (current): store a preference.
        self.patch(
            '/api/workspaces/member-settings',
            {'transfers': {'range': 'week'}},
            **self.auth_headers(),
        )
        self.assertStatus(200)

        # Switch current workspace, then reuse the SAME token: WorkspaceJWTAuth
        # scopes off the user's DB current_workspace_id, so the identical
        # headers now operate on workspace B (the test_workspaces.py switch
        # mechanics). Workspace B must see a fresh row, not workspace A's.
        self.post(f'/api/workspaces/{self.other_workspace.id}/switch', {}, **self.auth_headers())
        self.assertStatus(200)

        data = self.get('/api/workspaces/member-settings', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['transfers'], {'range': None})
        self.assertEqual(data['planned'], FRESH_SHAPE['planned'])
        self.assertEqual(UserWorkspaceSettings.objects.count(), 2)

        # Workspace A's stored preference is untouched.
        row_a = UserWorkspaceSettings.objects.for_workspace(self.workspace.id).get(user=self.user)
        self.assertEqual(row_a.settings['transfers'], {'range': 'week'})
