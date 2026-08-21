"""Tests for transfers between accounts (B6)."""

from datetime import date
from decimal import Decimal

from django.db import IntegrityError
from django.test import TestCase

from accounts.factories import AccountFactory
from accounts.services import AccountService
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService
from transactions.factories import TransactionFactory
from transfers.factories import TransferFactory
from transfers.models import Transfer


class TransferTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base: two PLN accounts + one USD account."""

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        self.checking = AccountFactory(workspace=self.workspace, name='Checking', opening_balance=Decimal('100.00'))
        self.savings = AccountFactory(workspace=self.workspace, name='Savings')
        self.dollars = AccountFactory(workspace=self.workspace, name='Dollars', currency=usd)

    def _payload(self, **overrides):
        payload = {
            'from_account_id': self.checking.id,
            'to_account_id': self.savings.id,
            'from_amount': '40.00',
            'date': '2026-07-15',
        }
        payload.update(overrides)
        return payload


class TestSameCurrencyTransfers(TransferTestCase):
    def test_to_amount_defaults_to_from_amount(self):
        data = self.post('/api/transfers', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['from_amount'], '40.00')
        self.assertEqual(data['to_amount'], '40.00')
        self.assertIsNone(data['rate'])

    def test_mismatched_to_amount_returns_400(self):
        self.post('/api/transfers', self._payload(to_amount='39.00'), **self.auth_headers())
        self.assertStatus(400)

    def test_equal_to_amount_accepted(self):
        self.post('/api/transfers', self._payload(to_amount='40.00'), **self.auth_headers())
        self.assertStatus(201)


class TestCrossCurrencyTransfers(TransferTestCase):
    def test_missing_to_amount_returns_400(self):
        self.post('/api/transfers', self._payload(to_account_id=self.dollars.id), **self.auth_headers())
        self.assertStatus(400)

    def test_happy_path_with_implied_rate(self):
        data = self.post(
            '/api/transfers',
            self._payload(to_account_id=self.dollars.id, from_amount='100.00', to_amount='25.00'),
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertEqual(data['from_currency_code'], 'PLN')
        self.assertEqual(data['to_currency_code'], 'USD')
        self.assertEqual(data['rate'], '0.250000')

    def test_cross_currency_moves_each_side_by_its_own_amount(self):
        self.post(
            '/api/transfers',
            self._payload(to_account_id=self.dollars.id, from_amount='100.00', to_amount='25.00'),
            **self.auth_headers(),
        )

        self.assertEqual(AccountService.balance(self.checking), Decimal('0.00'))  # 100 - 100
        self.assertEqual(AccountService.balance(self.dollars), Decimal('25.00'))


class TestTransferValidation(TransferTestCase):
    def test_same_account_returns_422(self):
        self.post('/api/transfers', self._payload(to_account_id=self.checking.id), **self.auth_headers())
        self.assertStatus(422)

    def test_db_constraint_rejects_same_account(self):
        with self.assertRaises(IntegrityError):
            Transfer.objects.create(
                workspace=self.workspace,
                from_account=self.checking,
                to_account=self.checking,
                from_amount=Decimal('10.00'),
                to_amount=Decimal('10.00'),
                date=date(2026, 7, 15),
            )

    def test_archived_account_on_create_returns_400(self):
        self.savings.is_archived = True
        self.savings.save()
        self.post('/api/transfers', self._payload(), **self.auth_headers())
        self.assertStatus(400)

    def test_foreign_account_returns_404(self):
        foreign = AccountFactory()
        self.post('/api/transfers', self._payload(to_account_id=foreign.id), **self.auth_headers())
        self.assertStatus(404)

    def test_negative_amount_returns_422(self):
        self.post('/api/transfers', self._payload(from_amount='-5.00'), **self.auth_headers())
        self.assertStatus(422)

    def test_edit_transfer_with_since_archived_accounts(self):
        created = self.post('/api/transfers', self._payload(), **self.auth_headers())
        self.savings.is_archived = True
        self.savings.save()

        data = self.put(
            f'/api/transfers/{created["id"]}',
            self._payload(from_amount='50.00', description='Edited'),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['from_amount'], '50.00')

    def test_retargeting_to_archived_account_returns_400(self):
        created = self.post(
            '/api/transfers',
            self._payload(to_account_id=self.dollars.id, from_amount='100.00', to_amount='25.00'),
            **self.auth_headers(),
        )
        self.savings.is_archived = True
        self.savings.save()

        self.put(f'/api/transfers/{created["id"]}', self._payload(), **self.auth_headers())
        self.assertStatus(400)


class TestTransferBalances(TransferTestCase):
    def test_transfer_moves_both_balances(self):
        self.post('/api/transfers', self._payload(), **self.auth_headers())

        checking = self.get(f'/api/accounts/{self.checking.id}/balance', **self.auth_headers())
        savings = self.get(f'/api/accounts/{self.savings.id}/balance', **self.auth_headers())
        self.assertEqual(checking['balance'], '60.00')  # 100 - 40
        self.assertEqual(savings['balance'], '40.00')

    def test_delete_transfer_restores_balances(self):
        created = self.post('/api/transfers', self._payload(), **self.auth_headers())
        self.delete(f'/api/transfers/{created["id"]}', **self.auth_headers())
        self.assertStatus(204)

        self.assertEqual(AccountService.balance(self.checking), Decimal('100.00'))
        self.assertEqual(AccountService.balance(self.savings), Decimal('0.00'))

    def test_balance_combines_opening_transactions_and_transfers(self):
        """opening 100 + income 50 − expense 30 + adjustment(−20) − transfer 40 = 60."""
        TransactionFactory(account=self.checking, workspace=self.workspace, amount=Decimal('50.00'), type='income')
        TransactionFactory(account=self.checking, workspace=self.workspace, amount=Decimal('30.00'), type='expense')
        TransactionFactory(account=self.checking, workspace=self.workspace, amount=Decimal('-20.00'), type='adjustment')
        self.post('/api/transfers', self._payload(), **self.auth_headers())

        self.assertEqual(AccountService.balance(self.checking), Decimal('60.00'))
        self.assertEqual(AccountService.balance(self.savings), Decimal('40.00'))

    def test_account_with_transfer_cannot_be_deleted_but_can_archive(self):
        self.post('/api/transfers', self._payload(), **self.auth_headers())

        self.delete(f'/api/accounts/{self.savings.id}', **self.auth_headers())
        self.assertStatus(400)

        self.patch(f'/api/accounts/{self.savings.id}/archive', {'is_archived': True}, **self.auth_headers())
        self.assertStatus(200)


class TestTransferListing(TransferTestCase):
    def setUp(self):
        super().setUp()
        self.t1 = TransferFactory(
            from_account=self.checking,
            to_account=self.savings,
            workspace=self.workspace,
            date=date(2026, 7, 1),
        )
        self.t2 = TransferFactory(
            from_account=self.savings,
            to_account=self.dollars,
            workspace=self.workspace,
            from_amount=Decimal('100.00'),
            to_amount=Decimal('25.00'),
            date=date(2026, 6, 1),
        )

    def test_account_filter_matches_either_side(self):
        data = self.get(f'/api/transfers?account_id={self.savings.id}', **self.auth_headers())
        self.assertEqual(data['total'], 2)

        data = self.get(f'/api/transfers?account_id={self.checking.id}', **self.auth_headers())
        self.assertEqual(data['total'], 1)

    def test_date_range_filter(self):
        data = self.get('/api/transfers?date_from=2026-07-01', **self.auth_headers())
        self.assertEqual(data['total'], 1)
        self.assertEqual(data['items'][0]['id'], self.t1.id)

    def test_workspace_scoping(self):
        foreign = TransferFactory()
        data = self.get('/api/transfers', **self.auth_headers())
        self.assertNotIn(foreign.id, [t['id'] for t in data['items']])

    def test_get_foreign_transfer_returns_404(self):
        foreign = TransferFactory()
        self.get(f'/api/transfers/{foreign.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_list_page_size_cap(self):
        self.get('/api/transfers?page_size=1000', **self.auth_headers())
        self.assertStatus(422)

        self.get('/api/transfers?page_size=0', **self.auth_headers())
        self.assertStatus(422)

        self.get('/api/transfers?page_size=100', **self.auth_headers())
        self.assertStatus(200)

        # 200 is the largest supported page size (frontend PAGE_SIZE_OPTIONS /
        # backend ALLOWED_PAGE_SIZES) — it must keep working under the cap.
        self.get('/api/transfers?page_size=200', **self.auth_headers())
        self.assertStatus(200)


class TestTransferRolePermissions(TransferTestCase):
    user_role = 'viewer'

    def test_viewer_cannot_create(self):
        self.post('/api/transfers', self._payload(), **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_can_list(self):
        self.get('/api/transfers', **self.auth_headers())
        self.assertStatus(200)
