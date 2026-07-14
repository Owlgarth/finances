"""Tests for the accounts app (CRUD, balances, archive, workspace scoping)."""

from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from accounts.exceptions import AccountInUseError
from accounts.factories import AccountFactory
from accounts.models import Account
from accounts.services import AccountService
from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService
from workspaces.factories import WorkspaceFactory
from workspaces.services import WorkspaceService


class TestAccountsAPI(AuthMixin, APIClientMixin, TestCase):
    """CRUD + balance endpoint tests as owner."""

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')

    def test_create_account(self):
        payload = {'name': 'Savings', 'type': 'bank', 'currency_code': 'PLN', 'opening_balance': '1500.00'}
        data = self.post('/api/accounts', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['name'], 'Savings')
        self.assertEqual(data['currency_code'], 'PLN')
        self.assertEqual(data['opening_balance'], '1500.00')
        self.assertFalse(data['is_archived'])

    def test_create_account_non_enabled_currency_returns_404(self):
        payload = {'name': 'Dollars', 'type': 'cash', 'currency_code': 'USD'}
        self.post('/api/accounts', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_create_account_with_enabled_custom_currency(self):
        CurrencyCatalogService.create_custom(self.user, self.workspace.id, code='GOLD', name='Gold', symbol='g')
        payload = {'name': 'Vault', 'type': 'other', 'currency_code': 'GOLD'}
        data = self.post('/api/accounts', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['currency_code'], 'GOLD')

    def test_create_duplicate_name_returns_400(self):
        AccountFactory(workspace=self.workspace, name='Savings')
        payload = {'name': 'Savings', 'currency_code': 'PLN'}
        self.post('/api/accounts', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_same_name_across_workspaces_ok(self):
        other_workspace = WorkspaceFactory()
        AccountFactory(workspace=other_workspace, name='Savings')
        payload = {'name': 'Savings', 'currency_code': 'PLN'}
        self.post('/api/accounts', payload, **self.auth_headers())
        self.assertStatus(201)

    def test_list_accounts(self):
        AccountFactory(workspace=self.workspace, name='One')
        AccountFactory(workspace=self.workspace, name='Two')
        data = self.get('/api/accounts', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual({a['name'] for a in data}, {'One', 'Two'})

    def test_get_account_from_other_workspace_returns_404(self):
        other = AccountFactory()
        self.get(f'/api/accounts/{other.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_update_account(self):
        account = AccountFactory(workspace=self.workspace, name='Old Name')
        data = self.put(
            f'/api/accounts/{account.id}',
            {'name': 'New Name', 'type': 'cash', 'opening_balance': '25.50'},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['name'], 'New Name')
        self.assertEqual(data['type'], 'cash')
        self.assertEqual(data['opening_balance'], '25.50')

    def test_update_currency_change_returns_400(self):
        account = AccountFactory(workspace=self.workspace)  # PLN
        self.put(f'/api/accounts/{account.id}', {'currency_code': 'USD'}, **self.auth_headers())
        self.assertStatus(400)

    def test_update_with_same_currency_code_ok(self):
        account = AccountFactory(workspace=self.workspace)
        self.put(f'/api/accounts/{account.id}', {'currency_code': 'PLN', 'name': 'Kept'}, **self.auth_headers())
        self.assertStatus(200)

    def test_archive_and_list_toggle(self):
        account = AccountFactory(workspace=self.workspace, name='Old Account')
        data = self.patch(f'/api/accounts/{account.id}/archive', {'is_archived': True}, **self.auth_headers())
        self.assertStatus(200)
        self.assertTrue(data['is_archived'])

        names = [a['name'] for a in self.get('/api/accounts', **self.auth_headers())]
        self.assertNotIn('Old Account', names)

        names = [a['name'] for a in self.get('/api/accounts?include_archived=true', **self.auth_headers())]
        self.assertIn('Old Account', names)

    def test_delete_account_without_records(self):
        account = AccountFactory(workspace=self.workspace)
        self.delete(f'/api/accounts/{account.id}', **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(Account.objects.filter(id=account.id).exists())

    def test_delete_account_with_records_returns_400(self):
        account = AccountFactory(workspace=self.workspace)
        with patch.object(AccountService, '_record_count', return_value=1):
            self.delete(f'/api/accounts/{account.id}', **self.auth_headers())
        self.assertStatus(400)
        self.assertTrue(Account.objects.filter(id=account.id).exists())

    def test_balance_endpoint_returns_opening_balance(self):
        account = AccountFactory(workspace=self.workspace, opening_balance=Decimal('123.45'))
        data = self.get(f'/api/accounts/{account.id}/balance', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['account_id'], account.id)
        self.assertEqual(data['currency_code'], 'PLN')
        self.assertEqual(data['balance'], '123.45')


class TestAccountRolePermissions(AuthMixin, APIClientMixin, TestCase):
    """Members and viewers cannot write accounts."""

    user_role = 'member'

    def test_member_cannot_create(self):
        self.post('/api/accounts', {'name': 'X', 'currency_code': 'PLN'}, **self.auth_headers())
        self.assertStatus(403)

    def test_member_cannot_update(self):
        account = AccountFactory(workspace=self.workspace)
        self.put(f'/api/accounts/{account.id}', {'name': 'Y'}, **self.auth_headers())
        self.assertStatus(403)

    def test_member_cannot_delete(self):
        account = AccountFactory(workspace=self.workspace)
        self.delete(f'/api/accounts/{account.id}', **self.auth_headers())
        self.assertStatus(403)

    def test_member_cannot_archive(self):
        account = AccountFactory(workspace=self.workspace)
        self.patch(f'/api/accounts/{account.id}/archive', {'is_archived': True}, **self.auth_headers())
        self.assertStatus(403)

    def test_member_can_view(self):
        account = AccountFactory(workspace=self.workspace)
        self.get('/api/accounts', **self.auth_headers())
        self.assertStatus(200)
        self.get(f'/api/accounts/{account.id}/balance', **self.auth_headers())
        self.assertStatus(200)


class TestAccountService(TestCase):
    """Service-level behavior not covered through the API."""

    def setUp(self):
        self.workspace = WorkspaceFactory()

    def test_single_active_account(self):
        first = AccountFactory(workspace=self.workspace)
        self.assertEqual(AccountService.single_active_account(self.workspace.id), first)

        second = AccountFactory(workspace=self.workspace)
        self.assertIsNone(AccountService.single_active_account(self.workspace.id))

        first.is_archived = True
        first.save()
        self.assertEqual(AccountService.single_active_account(self.workspace.id), second)

        second.is_archived = True
        second.save()
        self.assertIsNone(AccountService.single_active_account(self.workspace.id))

    def test_delete_with_records_raises(self):
        account = AccountFactory(workspace=self.workspace)
        with patch.object(AccountService, '_record_count', return_value=2):
            with self.assertRaises(AccountInUseError):
                AccountService.delete(self.workspace.id, account.id)

    def test_balance_is_opening_balance_plus_deltas(self):
        account = AccountFactory(workspace=self.workspace, opening_balance=Decimal('100.00'))
        with (
            patch.object(AccountService, '_transactions_delta', return_value=Decimal('50.00')),
            patch.object(AccountService, '_transfers_delta', return_value=Decimal('-30.00')),
        ):
            self.assertEqual(AccountService.balance(account), Decimal('120.00'))


class TestDefaultMainAccount(TestCase):
    """create_workspace provisions a Main account in the chosen currency."""

    def test_new_workspace_has_main_account(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='WS', currency_code='EUR')

        accounts = list(Account.objects.for_workspace(workspace.id))
        self.assertEqual(len(accounts), 1)
        self.assertEqual(accounts[0].name, 'Main')
        self.assertEqual(accounts[0].currency.code, 'EUR')
        self.assertIsNone(accounts[0].currency.workspace)
        self.assertFalse(accounts[0].is_archived)


class TestCurrencyDisableBlockedByAccount(AuthMixin, APIClientMixin, TestCase):
    """A currency referenced by an account cannot be disabled."""

    def test_disable_currency_with_account_returns_400(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        AccountFactory(workspace=self.workspace, currency=usd)

        self.delete('/api/workspaces/enabled-currencies/USD', **self.auth_headers())
        self.assertStatus(400)
