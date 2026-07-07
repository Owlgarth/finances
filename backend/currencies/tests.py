"""Tests for the currencies app (catalog, enablement, API, workspace creation)."""

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.exceptions import (
    CurrencyInUseError,
    CurrencyNotEnabledError,
    DuplicateCurrencyError,
    LastCurrencyError,
    UnknownCurrencyError,
)
from currencies.factories import CustomCurrencyFactory, WorkspaceCurrencyFactory
from currencies.models import Currency, WorkspaceCurrency
from currencies.services import CurrencyCatalogService
from workspaces.factories import WorkspaceFactory
from workspaces.models import Currency as LegacyCurrency
from workspaces.services import WorkspaceService

User = get_user_model()


class TestSeedCurrenciesCommand(TestCase):
    """Tests for the seed_currencies management command."""

    def test_seed_idempotent(self):
        """Running the command twice yields the same rows with no duplicates."""
        call_command('seed_currencies', verbosity=0)
        first_count = Currency.objects.filter(workspace__isnull=True).count()

        call_command('seed_currencies', verbosity=0)
        second_count = Currency.objects.filter(workspace__isnull=True).count()

        self.assertGreater(first_count, 100)
        self.assertEqual(first_count, second_count)
        self.assertEqual(Currency.objects.filter(workspace__isnull=True, code='USD').count(), 1)

    def test_seeded_decimals(self):
        """Minor-unit exponents are correct for known currencies."""
        call_command('seed_currencies', verbosity=0)
        self.assertEqual(Currency.objects.get(workspace__isnull=True, code='USD').decimals, 2)
        self.assertEqual(Currency.objects.get(workspace__isnull=True, code='JPY').decimals, 0)
        self.assertEqual(Currency.objects.get(workspace__isnull=True, code='KWD').decimals, 3)


class TestCurrencyCatalogService(TestCase):
    """Tests for CurrencyCatalogService."""

    def setUp(self):
        self.user = UserFactory()
        self.workspace = WorkspaceFactory()
        self.other_workspace = WorkspaceFactory()

    def test_list_catalog_includes_global_and_own_custom_only(self):
        own_custom = CustomCurrencyFactory(workspace=self.workspace, code='GOLD')
        other_custom = CustomCurrencyFactory(workspace=self.other_workspace, code='SILV')

        catalog = list(CurrencyCatalogService.list_catalog(self.workspace.id))

        self.assertIn(own_custom, catalog)
        self.assertNotIn(other_custom, catalog)
        codes = [c.code for c in catalog]
        self.assertIn('USD', codes)
        self.assertEqual(codes, sorted(codes))

    def test_enable_is_idempotent(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')

        enablements = WorkspaceCurrency.objects.filter(workspace=self.workspace, currency__code='USD')
        self.assertEqual(enablements.count(), 1)

    def test_enable_unknown_code_raises(self):
        with self.assertRaises(UnknownCurrencyError):
            CurrencyCatalogService.enable(self.user, self.workspace.id, 'XXX')

    def test_enable_does_not_leak_other_workspace_custom(self):
        CustomCurrencyFactory(workspace=self.other_workspace, code='GOLD')
        with self.assertRaises(UnknownCurrencyError):
            CurrencyCatalogService.enable(self.user, self.workspace.id, 'GOLD')

    def test_get_enabled(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        currency = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        self.assertEqual(currency.code, 'USD')

        with self.assertRaises(CurrencyNotEnabledError):
            CurrencyCatalogService.get_enabled(self.workspace.id, 'EUR')

    def test_list_enabled_scoped_to_workspace(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        CurrencyCatalogService.enable(self.user, self.other_workspace.id, 'EUR')

        own = [c.code for c in CurrencyCatalogService.list_enabled(self.workspace.id)]
        other = [c.code for c in CurrencyCatalogService.list_enabled(self.other_workspace.id)]

        self.assertEqual(own, ['USD'])
        self.assertEqual(other, ['EUR'])

    def test_create_custom_creates_and_enables(self):
        currency = CurrencyCatalogService.create_custom(
            self.user, self.workspace.id, code='GOLD', name='Gold grams', symbol='g', decimals=3
        )

        self.assertTrue(currency.is_custom)
        self.assertEqual(currency.workspace_id, self.workspace.id)
        self.assertEqual(currency.decimals, 3)
        self.assertTrue(WorkspaceCurrency.objects.filter(workspace=self.workspace, currency=currency).exists())

    def test_create_custom_collides_with_global_code(self):
        with self.assertRaises(DuplicateCurrencyError):
            CurrencyCatalogService.create_custom(self.user, self.workspace.id, code='USD', name='My Dollar', symbol='$')

    def test_create_custom_same_code_in_two_workspaces(self):
        first = CurrencyCatalogService.create_custom(self.user, self.workspace.id, code='GOLD', name='Gold', symbol='g')
        second = CurrencyCatalogService.create_custom(
            self.user, self.other_workspace.id, code='GOLD', name='Gold', symbol='g'
        )
        self.assertNotEqual(first.id, second.id)

        with self.assertRaises(DuplicateCurrencyError):
            CurrencyCatalogService.create_custom(self.user, self.workspace.id, code='GOLD', name='Gold', symbol='g')

    def test_disable_last_currency_blocked(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        with self.assertRaises(LastCurrencyError):
            CurrencyCatalogService.disable(self.workspace.id, 'USD')

    def test_disable_not_enabled_raises(self):
        with self.assertRaises(CurrencyNotEnabledError):
            CurrencyCatalogService.disable(self.workspace.id, 'USD')

    def test_disable_happy_path(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'EUR')

        CurrencyCatalogService.disable(self.workspace.id, 'EUR')

        codes = [c.code for c in CurrencyCatalogService.list_enabled(self.workspace.id)]
        self.assertEqual(codes, ['USD'])
        # Global catalog row untouched
        self.assertTrue(Currency.objects.filter(workspace__isnull=True, code='EUR').exists())

    def test_disable_cleans_up_orphaned_custom_row(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        custom = CurrencyCatalogService.create_custom(
            self.user, self.workspace.id, code='GOLD', name='Gold', symbol='g'
        )

        CurrencyCatalogService.disable(self.workspace.id, 'GOLD')

        self.assertFalse(Currency.objects.filter(id=custom.id).exists())

    def test_disable_in_use_blocked(self):
        """_reference_count is 0 until B2+; verify the guard path via a stub."""
        from unittest.mock import patch

        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'EUR')

        with patch.object(CurrencyCatalogService, '_reference_count', return_value=3):
            with self.assertRaises(CurrencyInUseError):
                CurrencyCatalogService.disable(self.workspace.id, 'EUR')

        # Still enabled after the failed disable
        codes = [c.code for c in CurrencyCatalogService.list_enabled(self.workspace.id)]
        self.assertIn('EUR', codes)


class TestCurrencyCatalogAPI(AuthMixin, APIClientMixin, TestCase):
    """Tests for GET /api/currencies and /api/workspaces/enabled-currencies as admin/owner."""

    def test_list_catalog(self):
        data = self.get('/api/currencies', **self.auth_headers())
        self.assertStatus(200)
        codes = [row['code'] for row in data]
        self.assertIn('USD', codes)
        self.assertIn('PLN', codes)

    def test_list_catalog_requires_auth(self):
        self.get('/api/currencies')
        self.assertStatus(401)

    def test_list_catalog_excludes_other_workspace_custom(self):
        other_workspace = WorkspaceFactory()
        CustomCurrencyFactory(workspace=other_workspace, code='SILV')
        CustomCurrencyFactory(workspace=self.workspace, code='GOLD')

        data = self.get('/api/currencies', **self.auth_headers())
        codes = [row['code'] for row in data]
        self.assertIn('GOLD', codes)
        self.assertNotIn('SILV', codes)

    def test_enable_currency(self):
        data = self.post('/api/workspaces/enabled-currencies', {'code': 'USD'}, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['code'], 'USD')
        self.assertFalse(data['is_custom'])

    def test_enable_unknown_currency_returns_404(self):
        self.post('/api/workspaces/enabled-currencies', {'code': 'XXX'}, **self.auth_headers())
        self.assertStatus(404)

    def test_create_custom_currency(self):
        payload = {'code': 'GOLD', 'custom': True, 'name': 'Gold grams', 'symbol': 'g', 'decimals': 3}
        data = self.post('/api/workspaces/enabled-currencies', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertTrue(data['is_custom'])
        self.assertEqual(data['decimals'], 3)

    def test_create_custom_currency_missing_name_returns_422(self):
        self.post('/api/workspaces/enabled-currencies', {'code': 'GOLD', 'custom': True}, **self.auth_headers())
        self.assertStatus(422)

    def test_create_custom_currency_colliding_with_global_returns_400(self):
        payload = {'code': 'USD', 'custom': True, 'name': 'My Dollar', 'symbol': '$'}
        self.post('/api/workspaces/enabled-currencies', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_list_enabled_currencies(self):
        self.post('/api/workspaces/enabled-currencies', {'code': 'USD'}, **self.auth_headers())
        data = self.get('/api/workspaces/enabled-currencies', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([row['code'] for row in data], ['USD'])

    def test_list_enabled_does_not_leak_across_workspaces(self):
        other_workspace = WorkspaceFactory()
        WorkspaceCurrencyFactory(workspace=other_workspace)  # enables USD there

        data = self.get('/api/workspaces/enabled-currencies', **self.auth_headers())
        self.assertEqual(data, [])

    def test_disable_currency(self):
        self.post('/api/workspaces/enabled-currencies', {'code': 'USD'}, **self.auth_headers())
        self.post('/api/workspaces/enabled-currencies', {'code': 'EUR'}, **self.auth_headers())

        self.delete('/api/workspaces/enabled-currencies/EUR', **self.auth_headers())
        self.assertStatus(204)

        data = self.get('/api/workspaces/enabled-currencies', **self.auth_headers())
        self.assertEqual([row['code'] for row in data], ['USD'])

    def test_disable_last_currency_returns_400(self):
        self.post('/api/workspaces/enabled-currencies', {'code': 'USD'}, **self.auth_headers())
        self.delete('/api/workspaces/enabled-currencies/USD', **self.auth_headers())
        self.assertStatus(400)

    def test_disable_not_enabled_returns_404(self):
        self.delete('/api/workspaces/enabled-currencies/EUR', **self.auth_headers())
        self.assertStatus(404)


class TestCurrencyRolePermissions(AuthMixin, APIClientMixin, TestCase):
    """Members cannot manage enabled currencies."""

    user_role = 'member'

    def test_member_cannot_enable(self):
        self.post('/api/workspaces/enabled-currencies', {'code': 'USD'}, **self.auth_headers())
        self.assertStatus(403)

    def test_member_cannot_disable(self):
        WorkspaceCurrencyFactory(workspace=self.workspace)
        self.delete('/api/workspaces/enabled-currencies/USD', **self.auth_headers())
        self.assertStatus(403)

    def test_member_can_view(self):
        self.get('/api/workspaces/enabled-currencies', **self.auth_headers())
        self.assertStatus(200)
        self.get('/api/currencies', **self.auth_headers())
        self.assertStatus(200)


class TestRegistrationCurrencyCode(APIClientMixin, TestCase):
    """Registration propagates currency_code into workspace creation."""

    def _register(self, email: str, **extra):
        payload = {
            'email': email,
            'password': 'securepassword123',
            'workspace_name': 'My Workspace',
            'accepted_terms_version': '1.0',
            'accepted_privacy_version': '1.0',
            **extra,
        }
        return self.post('/api/auth/register', payload)

    def test_register_with_currency_code(self):
        self._register('eur_user@example.com', currency_code='EUR')
        self.assertStatus(201)

        user = User.objects.get(email='eur_user@example.com')
        enabled = CurrencyCatalogService.list_enabled(user.current_workspace_id)
        self.assertIn('EUR', [c.code for c in enabled])
        self.assertTrue(LegacyCurrency.objects.filter(workspace_id=user.current_workspace_id, symbol='EUR').exists())

    def test_register_defaults_to_pln(self):
        self._register('pln_user@example.com')
        self.assertStatus(201)

        user = User.objects.get(email='pln_user@example.com')
        enabled = CurrencyCatalogService.list_enabled(user.current_workspace_id)
        self.assertIn('PLN', [c.code for c in enabled])


class TestCreateWorkspaceEndpointCurrency(AuthMixin, APIClientMixin, TestCase):
    """POST /api/workspaces accepts currency_code."""

    def test_create_workspace_with_currency_code(self):
        data = self.post('/api/workspaces/', {'name': 'EUR Workspace', 'currency_code': 'EUR'}, **self.auth_headers())
        self.assertStatus(201)

        enabled = CurrencyCatalogService.list_enabled(data['id'])
        self.assertEqual([c.code for c in enabled], ['EUR'])

    def test_create_workspace_service_direct(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Direct', currency_code='EUR')

        legacy_rows = LegacyCurrency.objects.filter(workspace=workspace)
        self.assertEqual(legacy_rows.count(), 1)
        self.assertEqual(legacy_rows.first().symbol, 'EUR')
        self.assertEqual([c.code for c in CurrencyCatalogService.list_enabled(workspace.id)], ['EUR'])
