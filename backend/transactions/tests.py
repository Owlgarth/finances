"""Tests for account-based transactions (B5 semantics)."""

import json
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import requests
from django.conf import settings
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone

from accounts.factories import AccountFactory
from accounts.services import AccountService
from budgeting.factories import BudgetFactory
from budgeting.models import Cadence, Period
from budgeting.services import PeriodService
from categories.factories import CategoryFactory
from common.auth import create_access_token
from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.models import Currency
from currencies.services import CurrencyCatalogService
from transactions.factories import TransactionFactory, TransactionItemFactory
from transactions.models import (
    Transaction,
    TransactionAttachment,
    TransactionIdempotencyKey,
    TransactionItem,
)
from transactions.parser_client import ParserServiceError, ParserUnavailableError, parse_receipt
from transactions.schemas import TransactionCreate
from transactions.services import TransactionService
from transactions.tasks import extract_attachment
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory


class TransactionTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base: one active PLN account + a budget with categories."""

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        self.account = AccountFactory(workspace=self.workspace, name='Main', opening_balance=Decimal('100.00'))
        self.budget = BudgetFactory(workspace=self.workspace)
        self.groceries = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Groceries')

    def _payload(self, **overrides):
        payload = {
            'date': '2026-07-15',
            'description': 'Test expense',
            'type': 'expense',
            'amount': '50.00',
            'account_id': self.account.id,
        }
        payload.update(overrides)
        return payload


class TestCreateTransaction(TransactionTestCase):
    def test_create_with_explicit_account(self):
        data = self.post('/api/transactions', self._payload(account_id=self.account.id), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['account_id'], self.account.id)
        self.assertEqual(data['account_name'], 'Main')
        self.assertEqual(data['currency_code'], 'PLN')
        self.assertEqual(data['amount'], '50.00')

    def test_create_account_less_with_currency(self):
        """The pocket-cash / traveling-cash path: no account, explicit currency."""
        data = self.post(
            '/api/transactions', self._payload(account_id=None, currency_code='PLN'), **self.auth_headers()
        )
        self.assertStatus(201)
        self.assertIsNone(data['account_id'])
        self.assertIsNone(data['account_name'])
        self.assertEqual(data['currency_code'], 'PLN')

    def test_create_account_less_without_currency_returns_400(self):
        self.post('/api/transactions', self._payload(account_id=None), **self.auth_headers())
        self.assertStatus(400)

    def test_create_on_archived_account_returns_400(self):
        archived = AccountFactory(workspace=self.workspace, name='Old', is_archived=True)
        self.post('/api/transactions', self._payload(account_id=archived.id), **self.auth_headers())
        self.assertStatus(400)

    def test_create_on_foreign_account_returns_404(self):
        foreign = AccountFactory()
        self.post('/api/transactions', self._payload(account_id=foreign.id), **self.auth_headers())
        self.assertStatus(404)

    def test_create_with_zero_amount_returns_400(self):
        self.post('/api/transactions', self._payload(amount='0.00'), **self.auth_headers())
        self.assertStatus(400)

    def test_create_with_negative_expense_returns_400(self):
        self.post('/api/transactions', self._payload(amount='-5.00'), **self.auth_headers())
        self.assertStatus(400)


class TestTransactionOwnCurrency(TransactionTestCase):
    """The own-currency contract: derive from account / match / require / enabled-domain."""

    def test_currency_derived_from_account_when_omitted(self):
        data = self.post('/api/transactions', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['currency_code'], 'PLN')

    def test_currency_matching_account_currency_ok(self):
        data = self.post('/api/transactions', self._payload(currency_code='PLN'), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['currency_code'], 'PLN')

    def test_currency_mismatching_account_returns_400(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        self.post('/api/transactions', self._payload(currency_code='USD'), **self.auth_headers())
        self.assertStatus(400)

    def test_account_less_currency_not_enabled_returns_404(self):
        # get_enabled maps to CurrencyNotEnabledError -> NotFoundError -> 404
        self.post('/api/transactions', self._payload(account_id=None, currency_code='EUR'), **self.auth_headers())
        self.assertStatus(404)

    def test_adjustment_without_account_returns_400(self):
        self.post(
            '/api/transactions',
            self._payload(type='adjustment', amount='-20.00', account_id=None, currency_code='PLN'),
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_adjustment_with_account_ok(self):
        data = self.post('/api/transactions', self._payload(type='adjustment', amount='-20.00'), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['account_id'], self.account.id)
        self.assertEqual(data['currency_code'], 'PLN')


class TestCreateTransactionWithItems(TransactionTestCase):
    """Inline items on POST /transactions (Q1=A: optional, atomic, backward-compatible)."""

    def test_create_with_items_persists_them_in_order(self):
        items = [
            {'name': 'Bread', 'quantity': '1', 'unit_price': '4.99', 'line_total': '4.99'},
            {'name': 'Milk', 'quantity': '2', 'unit_price': '3.99', 'line_total': '7.98'},
            {'name': 'Cheese', 'quantity': '1', 'unit_price': '11.00', 'line_total': '11.00'},
        ]
        data = self.post('/api/transactions', self._payload(items=items), **self.auth_headers())
        self.assertStatus(201)
        items_data = self.get(f'/api/transactions/{data["id"]}/items', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([i['name'] for i in items_data['items']], ['Bread', 'Milk', 'Cheese'])
        self.assertEqual([i['position'] for i in items_data['items']], [0, 1, 2])
        self.assertEqual(items_data['items_total'], '23.97')

    def test_create_without_items_is_backward_compatible(self):
        """Regression for planned_transactions/tasks.py: it constructs TransactionCreate without items=."""
        data = self.post('/api/transactions', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        items_data = self.get(f'/api/transactions/{data["id"]}/items', **self.auth_headers())
        self.assertEqual(items_data['items'], [])
        self.assertEqual(TransactionItem.objects.filter(transaction_id=data['id']).count(), 0)

    def test_create_with_empty_items_list_is_noop(self):
        data = self.post('/api/transactions', self._payload(items=[]), **self.auth_headers())
        self.assertStatus(201)
        items_data = self.get(f'/api/transactions/{data["id"]}/items', **self.auth_headers())
        self.assertEqual(items_data['items'], [])
        self.assertEqual(TransactionItem.objects.filter(transaction_id=data['id']).count(), 0)

    def test_create_items_exceeding_max_length_rejected(self):
        too_many = [{'name': f'Item {i}', 'line_total': '1.00'} for i in range(201)]
        self.post('/api/transactions', self._payload(items=too_many), **self.auth_headers())
        self.assertStatus(422)  # Pydantic max_length=200

    def test_create_with_items_does_not_change_amount_or_balance(self):
        """Items are informational — the transaction's amount stays authoritative (invariant from
        TestTransactionItems.test_items_do_not_change_amount_or_balance)."""
        balance_before = AccountService.balance(self.account)
        data = self.post(
            '/api/transactions',
            self._payload(amount='50.00', items=[{'name': 'X', 'line_total': '999.99'}]),
            **self.auth_headers(),
        )
        self.assertStatus(201)
        trans = Transaction.objects.get(id=data['id'])
        self.assertEqual(trans.amount, Decimal('50.00'))  # not 999.99
        # opening_balance 100.00 − expense 50.00
        self.assertEqual(AccountService.balance(self.account), balance_before - Decimal('50.00'))


class TestIdempotencyKey(TransactionTestCase):
    """Idempotency-Key header on POST /transactions — Stripe-style dedup."""

    def test_create_with_key_returns_same_transaction_on_replay(self):
        headers = {**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': 'abc-123'}
        first = self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)

        second = self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)
        self.assertEqual(second['id'], first['id'])
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 1)

    def test_create_with_key_different_payload_still_returns_original(self):
        """Stripe semantics: same key = same result, regardless of payload.

        The user replayed the request — they don't want a second transaction.
        The new payload is ignored; the original transaction is returned.
        """
        headers = {**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': 'abc-123'}
        first = self.post('/api/transactions', self._payload(amount='50.00'), **headers)
        self.assertStatus(201)

        second = self.post(
            '/api/transactions',
            self._payload(description='Different description', amount='99.99'),
            **headers,
        )
        self.assertStatus(201)
        self.assertEqual(second['id'], first['id'])
        self.assertEqual(second['amount'], '50.00')
        self.assertEqual(second['description'], 'Test expense')
        self.assertEqual(Transaction.objects.count(), 1)

    def test_create_without_key_bypasses_dedup(self):
        """No header → no dedup → two POSTs create two transactions (backward compat)."""
        first = self.post('/api/transactions', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        second = self.post('/api/transactions', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        self.assertNotEqual(second['id'], first['id'])
        self.assertEqual(Transaction.objects.count(), 2)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 0)

    def test_blank_key_bypasses_dedup(self):
        """An empty Idempotency-Key header is treated as absent."""
        headers = {**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': ''}
        first = self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)
        second = self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)
        self.assertNotEqual(second['id'], first['id'])

    def test_same_key_different_user_is_independent(self):
        """Unique constraint is (key, user) — no cross-user collision.

        AuthMixin mints a JWT only for `self.user`. To authenticate a second
        user via the HTTP layer we mint a token directly via the public
        `common.auth.create_access_token` helper and add the user as a
        workspace member so WorkspaceJWTAuth accepts them.
        """
        other = UserFactory(email='other@example.com', current_workspace=self.workspace)
        WorkspaceMemberFactory(workspace=self.workspace, user=other, role='member')
        other_headers = {'HTTP_AUTHORIZATION': f'Bearer {create_access_token(other)}'}

        first = self.post(
            '/api/transactions',
            self._payload(),
            **{**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': 'shared-key'},
        )
        self.assertStatus(201)

        second = self.post(
            '/api/transactions',
            self._payload(),
            **{**other_headers, 'HTTP_IDEMPOTENCY_KEY': 'shared-key'},
        )
        self.assertStatus(201)

        self.assertNotEqual(second['id'], first['id'])
        self.assertEqual(Transaction.objects.count(), 2)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 2)
        # Same key, distinct users — both rows live side by side.
        keys = list(TransactionIdempotencyKey.objects.values_list('user_id', flat=True))
        self.assertEqual(sorted(keys), sorted([self.user.id, other.id]))

    def test_same_key_different_workspace_is_independent(self):
        """Unique constraint is (key, user, workspace) — no cross-workspace collision.

        Same user, same key, two workspaces → two transactions, two dedup
        records. AuthMixin mints a JWT scoped to self.workspace, so the second
        workspace's create goes through TransactionService directly (mirroring
        the race test) rather than the HTTP layer.
        """
        other_workspace = WorkspaceFactory(name='Other Workspace')
        WorkspaceMemberFactory(workspace=other_workspace, user=self.user, role='member')
        CurrencyCatalogService.enable(self.user, other_workspace.id, 'PLN')
        other_account = AccountFactory(workspace=other_workspace, name='Other Main')

        first = self.post(
            '/api/transactions',
            self._payload(),
            **{**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': 'shared-key'},
        )
        self.assertStatus(201)

        second = TransactionService.create(
            self.user,
            other_workspace.id,
            TransactionCreate(**self._payload(account_id=other_account.id)),
            idempotency_key='shared-key',
        )

        self.assertNotEqual(second.id, first['id'])
        self.assertEqual(Transaction.objects.count(), 2)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 2)
        # Same key + user, distinct workspaces — both rows live side by side.
        ws_ids = list(
            TransactionIdempotencyKey.objects.filter(key='shared-key', user=self.user).values_list(
                'workspace_id', flat=True
            )
        )
        self.assertEqual(sorted(ws_ids), sorted([self.workspace.id, other_workspace.id]))
        # Each transaction landed in its own workspace.
        first_tx = Transaction.objects.get(id=first['id'])
        self.assertEqual(first_tx.workspace_id, self.workspace.id)
        self.assertEqual(second.workspace_id, other_workspace.id)

    def test_replay_does_not_leak_across_workspaces(self):
        """A replay of key K under workspace B must NOT return workspace A's transaction.

        Regression for the cross-workspace leak: before the lookup was
        workspace-scoped, a replay under B returned the transaction created
        under A (even after the user's membership in A was revoked). Now the
        scoped lookup + per-workspace constraint keep the two isolated — the
        replay creates a fresh transaction in B and A's transaction id is
        never returned.
        """
        other_workspace = WorkspaceFactory(name='Other Workspace')
        WorkspaceMemberFactory(workspace=other_workspace, user=self.user, role='member')
        CurrencyCatalogService.enable(self.user, other_workspace.id, 'PLN')
        other_account = AccountFactory(workspace=other_workspace, name='Other Main')

        # Create with the key in workspace A (self.workspace).
        first = self.post(
            '/api/transactions',
            self._payload(),
            **{**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': 'leak-key'},
        )
        self.assertStatus(201)
        first_id = first['id']

        # Replay the SAME key against workspace B — must be a fresh create, not
        # a return of A's transaction.
        replay = TransactionService.create(
            self.user,
            other_workspace.id,
            TransactionCreate(**self._payload(account_id=other_account.id)),
            idempotency_key='leak-key',
        )

        self.assertNotEqual(replay.id, first_id)
        self.assertEqual(replay.workspace_id, other_workspace.id)
        self.assertEqual(Transaction.objects.count(), 2)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 2)

    def test_key_after_24h_treated_as_new(self):
        """After the 24h TTL, the same key creates a new transaction.

        The unique constraint is unconditional on (key, user), so the service
        sweeps expired records before inserting — the old dedup row is
        replaced (not left as cruft). What matters is that the second request
        produces a NEW transaction; the dedup record count stays at 1.
        """
        headers = {**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': 'abc-123'}
        first = self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)

        # Mock timezone.now forward 25h for BOTH the lookup cutoff and the new
        # record's auto_now_add. The codebase does NOT use freezegun; patch
        # django.utils.timezone.now directly. Apply the patch around the whole
        # second request because the lookup AND the create both consult now().
        original_now = timezone.now()
        future = original_now + timedelta(hours=25)
        with mock.patch('django.utils.timezone.now', return_value=future):
            second = self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)
        self.assertNotEqual(second['id'], first['id'])
        self.assertEqual(Transaction.objects.count(), 2)
        # Exactly one dedup record — the expired one was swept before insert.
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 1)

    def test_user_delete_cascades_to_idempotency_key(self):
        """CASCADE on user FK — UserService.delete_account() needs no code change."""
        from users.models import User

        headers = {**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': 'abc-123'}
        self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 1)

        # Direct delete — exercises the FK on_delete behavior at the DB level.
        # (UserService.delete_account also CASCADEs through owned_workspaces,
        # but a direct user.delete() is the minimal verification.)
        user_id = self.user.id
        User.objects.filter(id=user_id).delete()

        self.assertEqual(TransactionIdempotencyKey.objects.filter(user_id=user_id).count(), 0)

    def test_workspace_delete_cascades_to_idempotency_key(self):
        """CASCADE on workspace FK.

        Direct `workspace.delete()` would fail with ProtectedError because
        accounts are PROTECT-referenced by transactions — production code
        (`UserService.delete_account`, `WorkspaceService.delete_workspace`)
        always calls `delete_workspace_financial_records` first. Mirror that
        here.
        """
        from common.services.base import delete_workspace_financial_records
        from workspaces.models import Workspace

        headers = {**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': 'abc-123'}
        self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)
        ws_id = self.workspace.id

        # Match production: drop PROTECT-referenced financial records first,
        # then delete the workspace (which CASCADEs the dedup record).
        delete_workspace_financial_records(ws_id)
        Workspace.objects.filter(id=ws_id).delete()
        self.assertEqual(TransactionIdempotencyKey.objects.filter(workspace_id=ws_id).count(), 0)

    def test_transaction_delete_sets_null_not_cascade(self):
        """SET_NULL on transaction FK — record survives a transaction delete."""
        headers = {**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': 'abc-123'}
        self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)
        record = TransactionIdempotencyKey.objects.get()
        tx_id = record.transaction_id
        self.assertIsNotNone(tx_id)

        Transaction.objects.filter(id=tx_id).delete()

        record.refresh_from_db()
        self.assertIsNone(record.transaction_id)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 1)

        # And a replay after the delete should create a fresh transaction
        # (the stale-record branch in TransactionService.create kicks in).
        replay = self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(201)
        self.assertNotEqual(replay['id'], tx_id)

    def test_viewer_cannot_use_idempotency_key(self):
        """require_role runs before the header is read — viewer gets 403.

        AuthMixin mints a JWT only for `self.user`, so we add a viewer member
        and mint their token via the public `create_access_token` helper.
        """
        viewer = UserFactory(email='viewer@example.com', current_workspace=self.workspace)
        WorkspaceMemberFactory(workspace=self.workspace, user=viewer, role='viewer')
        viewer_headers = {'HTTP_AUTHORIZATION': f'Bearer {create_access_token(viewer)}'}

        # Even with an oversized key (which would normally trigger 400),
        # require_role denies first → 403, no record written, no transaction.
        long_key = 'k' * 101
        self.post(
            '/api/transactions',
            self._payload(),
            **{**viewer_headers, 'HTTP_IDEMPOTENCY_KEY': long_key},
        )
        self.assertStatus(403)
        self.assertEqual(Transaction.objects.count(), 0)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 0)

    def test_oversized_key_returns_400(self):
        """Keys longer than 100 chars are rejected with 400 (not truncated)."""
        long_key = 'k' * 101
        headers = {**self.auth_headers(), 'HTTP_IDEMPOTENCY_KEY': long_key}
        data = self.post('/api/transactions', self._payload(), **headers)
        self.assertStatus(400)
        self.assertIn('100 characters', data['detail'])
        self.assertEqual(Transaction.objects.count(), 0)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 0)

    def test_race_condition_two_concurrent_inserts_returns_one_transaction(self):
        """Force the IntegrityError branch by pre-inserting a winner's record.

        A true concurrent-request race is hard to test deterministically. To
        exercise the `except IntegrityError` branch in `TransactionService.create`,
        we (1) commit a winner's record directly (it lives in the test's outer
        transaction, so the wrapper's savepoint rollback won't undo it), (2)
        mock the FIRST lookup to return None so the wrapper proceeds to insert
        (and hits the unique constraint), and (3) let the SECOND lookup run for
        real so the wrapper finds the winner and returns their transaction.
        """
        # Pre-commit the winner: a different transaction + dedup record for
        # the same (key, user). This is what the concurrent request would have
        # committed in a real race.
        winner_tx = TransactionFactory(account=self.account, workspace=self.workspace)
        TransactionIdempotencyKey.objects.create(
            key='race-key',
            user=self.user,
            workspace_id=self.workspace.id,
            transaction=winner_tx,
        )

        # Mock the lookup: first call (before insert) returns None, simulating
        # "no record yet" — the wrapper then tries to insert and collides with
        # the pre-committed winner above. The second call (after IntegrityError,
        # inside the except branch) delegates to the real lookup, which finds
        # the winner.
        real_lookup = TransactionService._lookup_idempotency_key
        call_count = [0]

        def fake_lookup(user, workspace_id, key):
            call_count[0] += 1
            if call_count[0] == 1:
                return None
            return real_lookup(user, workspace_id, key)

        with mock.patch.object(TransactionService, '_lookup_idempotency_key', side_effect=fake_lookup):
            result = TransactionService.create(
                self.user,
                self.workspace.id,
                TransactionCreate(**self._payload()),
                idempotency_key='race-key',
            )

        # The wrapper caught IntegrityError, re-read the winner, returned it.
        self.assertEqual(result.id, winner_tx.id)
        # Exactly one dedup record survives — the wrapper's own insert was
        # rolled back by the savepoint, leaving only the pre-committed winner.
        self.assertEqual(TransactionIdempotencyKey.objects.filter(key='race-key', user=self.user).count(), 1)


class TestAdjustments(TransactionTestCase):
    def test_negative_adjustment_ok(self):
        data = self.post(
            '/api/transactions',
            self._payload(type='adjustment', amount='-20.00', description='Reconcile'),
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertEqual(data['amount'], '-20.00')

    def test_zero_adjustment_returns_400(self):
        self.post('/api/transactions', self._payload(type='adjustment', amount='0.00'), **self.auth_headers())
        self.assertStatus(400)

    def test_adjustment_with_category_returns_400(self):
        self.post(
            '/api/transactions',
            self._payload(type='adjustment', amount='-20.00', category_id=self.groceries.id),
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_adjustment_affects_balance_but_not_totals(self):
        self.post('/api/transactions', self._payload(type='income', amount='50.00'), **self.auth_headers())
        self.post('/api/transactions', self._payload(type='adjustment', amount='-20.00'), **self.auth_headers())

        balance = self.get(f'/api/accounts/{self.account.id}/balance', **self.auth_headers())
        self.assertEqual(balance['balance'], '130.00')  # 100 + 50 - 20

        totals = self.get('/api/transactions/totals?group_by=type', **self.auth_headers())
        groups = {t['group'] for t in totals['totals']}
        self.assertEqual(groups, {'income'})


class TestOriginalFacet(TransactionTestCase):
    def test_facet_happy_path(self):
        data = self.post(
            '/api/transactions',
            self._payload(original_amount='12.99', original_currency_code='USD'),
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertEqual(data['original_amount'], '12.99')
        self.assertEqual(data['original_currency_code'], 'USD')

    def test_facet_one_field_only_returns_422(self):
        self.post('/api/transactions', self._payload(original_amount='12.99'), **self.auth_headers())
        self.assertStatus(422)

    def test_facet_same_as_account_currency_returns_400(self):
        self.post(
            '/api/transactions',
            self._payload(original_amount='12.99', original_currency_code='PLN'),
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_facet_unknown_code_returns_400(self):
        self.post(
            '/api/transactions',
            self._payload(original_amount='12.99', original_currency_code='XXX'),
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_facet_same_as_own_currency_account_less_returns_400(self):
        self.post(
            '/api/transactions',
            self._payload(account_id=None, currency_code='PLN', original_amount='12.99', original_currency_code='PLN'),
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_facet_differs_from_own_currency_account_less_ok(self):
        data = self.post(
            '/api/transactions',
            self._payload(account_id=None, currency_code='PLN', original_amount='12.99', original_currency_code='USD'),
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertEqual(data['currency_code'], 'PLN')
        self.assertEqual(data['original_currency_code'], 'USD')


class TestDerivedPeriods(TransactionTestCase):
    def test_create_with_category_materializes_period(self):
        self.assertEqual(Period.objects.filter(budget=self.budget).count(), 0)

        self.post('/api/transactions', self._payload(category_id=self.groceries.id), **self.auth_headers())
        self.assertStatus(201)

        periods = Period.objects.filter(budget=self.budget)
        self.assertEqual(periods.count(), 1)
        self.assertEqual(periods.first().start_date, date(2026, 7, 1))

    def test_date_change_materializes_next_period(self):
        created = self.post('/api/transactions', self._payload(category_id=self.groceries.id), **self.auth_headers())
        self.put(
            f'/api/transactions/{created["id"]}',
            self._payload(category_id=self.groceries.id, date='2026-08-03'),
            **self.auth_headers(),
        )
        self.assertStatus(200)

        starts = set(Period.objects.filter(budget=self.budget).values_list('start_date', flat=True))
        self.assertEqual(starts, {date(2026, 7, 1), date(2026, 8, 1)})

    def test_no_category_no_period(self):
        self.post('/api/transactions', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(Period.objects.filter(workspace=self.workspace).count(), 0)

    def test_custom_cadence_without_covering_period_returns_400(self):
        custom_budget = BudgetFactory(workspace=self.workspace, cadence=Cadence.CUSTOM)
        category = CategoryFactory(budget=custom_budget, workspace=self.workspace, name='Trip Food')
        self.post('/api/transactions', self._payload(category_id=category.id), **self.auth_headers())
        self.assertStatus(400)

    def test_archived_category_returns_400(self):
        archived = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Old', is_archived=True)
        self.post('/api/transactions', self._payload(category_id=archived.id), **self.auth_headers())
        self.assertStatus(400)

    def test_foreign_workspace_category_returns_400(self):
        foreign = CategoryFactory()
        self.post('/api/transactions', self._payload(category_id=foreign.id), **self.auth_headers())
        self.assertStatus(400)


class TestFiltersAndTotals(TransactionTestCase):
    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        self.usd_account = AccountFactory(workspace=self.workspace, name='Dollars', currency=usd)

        TransactionFactory(
            account=self.account,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            description='Groceries run',
            category=self.groceries,
            amount=Decimal('40.00'),
            type='expense',
        )
        TransactionFactory(
            account=self.account,
            workspace=self.workspace,
            date=date(2026, 7, 10),
            description='Salary',
            amount=Decimal('500.00'),
            type='income',
        )
        TransactionFactory(
            account=self.usd_account,
            workspace=self.workspace,
            date=date(2026, 6, 10),
            description='US expense',
            amount=Decimal('30.00'),
            type='expense',
        )
        TransactionFactory(
            account=self.account,
            workspace=self.workspace,
            date=date(2026, 7, 12),
            description='Reconcile',
            amount=Decimal('-15.00'),
            type='adjustment',
        )

    def test_filter_by_date_range(self):
        data = self.get('/api/transactions?date_from=2026-07-01&date_to=2026-07-31', **self.auth_headers())
        self.assertEqual(data['total'], 3)

    def test_filter_by_account(self):
        data = self.get(f'/api/transactions?account_id={self.usd_account.id}', **self.auth_headers())
        self.assertEqual(data['total'], 1)
        self.assertEqual(data['items'][0]['currency_code'], 'USD')

    def test_filter_by_multiple_accounts(self):
        data = self.get(
            f'/api/transactions?account_id={self.account.id}&account_id={self.usd_account.id}',
            **self.auth_headers(),
        )
        self.assertEqual(data['total'], 4)

    def test_filter_by_own_currency(self):
        data = self.get('/api/transactions?currency_code=USD', **self.auth_headers())
        self.assertEqual(data['total'], 1)
        self.assertEqual(data['items'][0]['currency_code'], 'USD')

    def test_filter_by_multiple_currencies(self):
        eur = CurrencyCatalogService.enable(self.user, self.workspace.id, 'EUR')
        eur_account = AccountFactory(workspace=self.workspace, name='Euros', currency=eur)
        TransactionFactory(
            account=eur_account,
            workspace=self.workspace,
            date=date(2026, 7, 8),
            description='Euro expense',
            amount=Decimal('20.00'),
            type='expense',
        )

        data = self.get('/api/transactions?currency_code=USD&currency_code=EUR', **self.auth_headers())
        # The three PLN-account rows stay excluded.
        self.assertEqual(data['total'], 2)
        self.assertEqual({t['currency_code'] for t in data['items']}, {'USD', 'EUR'})

    def test_currency_filter_matches_account_less_by_own_currency(self):
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        TransactionFactory(
            account=None,
            currency=usd,
            workspace=self.workspace,
            date=date(2026, 7, 14),
            description='Cash expense',
            amount=Decimal('15.00'),
            type='expense',
        )

        data = self.get('/api/transactions?currency_code=USD', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['total'], 2)
        self.assertTrue(all(t['currency_code'] == 'USD' for t in data['items']))

    def test_currency_filter_never_matches_original_facet(self):
        # A THB original facet on a PLN-account transaction: the filter targets
        # the stored own currency, never the facet.
        thb = Currency.objects.get(workspace__isnull=True, code='THB')
        TransactionFactory(
            account=self.account,
            workspace=self.workspace,
            date=date(2026, 7, 9),
            description='Paid in baht, settled in PLN',
            amount=Decimal('50.00'),
            type='expense',
            original_amount=Decimal('400.00'),
            original_currency=thb,
        )

        data = self.get('/api/transactions?currency_code=THB', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['total'], 0)

        # The same row matches its ACCOUNT currency (3 setUp rows + the facet row).
        data = self.get('/api/transactions?currency_code=PLN', **self.auth_headers())
        self.assertEqual(data['total'], 4)

    def test_currency_filter_unknown_code_returns_empty(self):
        data = self.get('/api/transactions?currency_code=XXX', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['total'], 0)

    def test_filter_by_budget(self):
        data = self.get(f'/api/transactions?budget_id={self.budget.id}', **self.auth_headers())
        self.assertEqual(data['total'], 1)
        self.assertEqual(data['items'][0]['category_name'], 'Groceries')

    def test_response_includes_category_budget_id(self):
        data = self.get(f'/api/transactions?budget_id={self.budget.id}', **self.auth_headers())
        self.assertEqual(data['items'][0]['category_budget_id'], self.budget.id)

        uncategorized = self.get('/api/transactions?transaction_type=income', **self.auth_headers())
        self.assertIsNone(uncategorized['items'][0]['category_budget_id'])

    def test_filter_by_type(self):
        data = self.get('/api/transactions?transaction_type=income', **self.auth_headers())
        self.assertEqual(data['total'], 1)

    def test_totals_grouped_per_own_currency(self):
        eur = CurrencyCatalogService.enable(self.user, self.workspace.id, 'EUR')
        TransactionFactory(
            account=None,
            currency=eur,
            workspace=self.workspace,
            date=date(2026, 7, 14),
            description='Cash tip',
            amount=Decimal('25.00'),
            type='expense',
        )

        totals = self.get('/api/transactions/totals?group_by=type', **self.auth_headers())['totals']
        as_map = {(t['group'], t['currency']): t['total'] for t in totals}
        # Account-having rows keep grouping by their (stored) account currency.
        self.assertEqual(as_map[('expense', 'PLN')], '40.00')
        self.assertEqual(as_map[('expense', 'USD')], '30.00')
        self.assertEqual(as_map[('income', 'PLN')], '500.00')
        self.assertNotIn(('adjustment', 'PLN'), as_map)
        # The account-less row groups by its stored own currency.
        self.assertEqual(as_map[('expense', 'EUR')], '25.00')

    def test_totals_currency_filter_returns_only_matching_groups(self):
        eur = CurrencyCatalogService.enable(self.user, self.workspace.id, 'EUR')
        TransactionFactory(
            account=None,
            currency=eur,
            workspace=self.workspace,
            date=date(2026, 7, 14),
            description='Cash tip',
            amount=Decimal('25.00'),
            type='expense',
        )

        totals = self.get('/api/transactions/totals?currency_code=EUR', **self.auth_headers())['totals']
        as_map = {(t['group'], t['currency']): t['total'] for t in totals}
        # Whole-map equality: only the EUR group survives - the PLN and USD
        # setUp groups are absent, exactly like the list endpoint's filter.
        self.assertEqual(as_map, {('expense', 'EUR'): '25.00'})

        # Multi-value repetition widens the filter but still excludes PLN.
        totals = self.get('/api/transactions/totals?currency_code=EUR&currency_code=USD', **self.auth_headers())[
            'totals'
        ]
        as_map = {(t['group'], t['currency']): t['total'] for t in totals}
        self.assertEqual(as_map, {('expense', 'EUR'): '25.00', ('expense', 'USD'): '30.00'})

    def test_totals_category_branch_groups_account_less_by_own_currency(self):
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        TransactionFactory(
            account=None,
            currency=usd,
            workspace=self.workspace,
            date=date(2026, 7, 14),
            description='Cash groceries',
            category=self.groceries,
            amount=Decimal('12.00'),
            type='expense',
        )

        totals = self.get('/api/transactions/totals?group_by=category', **self.auth_headers())['totals']
        as_map = {(t['group'], t['currency']): t['total'] for t in totals}
        self.assertEqual(as_map[('Groceries', 'PLN')], '40.00')
        self.assertEqual(as_map[('Groceries', 'USD')], '12.00')

    def test_totals_filtered_by_multiple_accounts(self):
        totals = self.get(
            f'/api/transactions/totals?account_id={self.account.id}&account_id={self.usd_account.id}',
            **self.auth_headers(),
        )['totals']
        as_map = {(t['group'], t['currency']): t['total'] for t in totals}
        self.assertEqual(as_map[('expense', 'PLN')], '40.00')
        self.assertEqual(as_map[('expense', 'USD')], '30.00')
        self.assertEqual(as_map[('income', 'PLN')], '500.00')

    def test_totals_filtered_by_budget(self):
        # Only the categorized grocery expense belongs to the budget.
        totals = self.get(f'/api/transactions/totals?budget_id={self.budget.id}', **self.auth_headers())['totals']
        as_map = {(t['group'], t['currency']): t['total'] for t in totals}
        self.assertEqual(as_map, {('expense', 'PLN'): '40.00'})

    def test_totals_combined_excludes_adjustments(self):
        data = self.get('/api/transactions/totals?group_by=type,category', **self.auth_headers())
        by_type_groups = {t['group'] for t in data['by_type']}
        self.assertEqual(by_type_groups, {'income', 'expense'})

    def test_totals_combined_includes_account_less(self):
        eur = CurrencyCatalogService.enable(self.user, self.workspace.id, 'EUR')
        TransactionFactory(
            account=None,
            currency=eur,
            workspace=self.workspace,
            date=date(2026, 7, 14),
            description='Cash tip',
            amount=Decimal('25.00'),
            type='expense',
        )

        data = self.get('/api/transactions/totals?group_by=type,category', **self.auth_headers())
        by_type = {(t['group'], t['currency']): t['total'] for t in data['by_type']}
        self.assertEqual(by_type[('expense', 'EUR')], '25.00')
        self.assertEqual(by_type[('expense', 'PLN')], '40.00')

    def test_totals_combined_currency_filter(self):
        eur = CurrencyCatalogService.enable(self.user, self.workspace.id, 'EUR')
        TransactionFactory(
            account=None,
            currency=eur,
            workspace=self.workspace,
            date=date(2026, 7, 14),
            description='Cash tip',
            amount=Decimal('25.00'),
            type='expense',
        )

        data = self.get('/api/transactions/totals?group_by=type,category&currency_code=EUR', **self.auth_headers())
        by_type = {(t['group'], t['currency']): t['total'] for t in data['by_type']}
        by_category = {(t['group'], t['currency']): t['total'] for t in data['by_category']}
        self.assertEqual(by_type, {('expense', 'EUR'): '25.00'})
        # Both combined views honor the filter - no PLN/USD groups anywhere.
        self.assertEqual(by_category, {('Uncategorized', 'EUR'): '25.00'})

    def test_workspace_scoping(self):
        foreign = TransactionFactory()
        data = self.get('/api/transactions', **self.auth_headers())
        self.assertNotIn(foreign.id, [t['id'] for t in data['items']])

    def test_list_page_size_cap(self):
        self.get('/api/transactions?page_size=1000', **self.auth_headers())
        self.assertStatus(422)

        self.get('/api/transactions?page_size=0', **self.auth_headers())
        self.assertStatus(422)

        self.get('/api/transactions?page_size=100', **self.auth_headers())
        self.assertStatus(200)

        # 200 is the largest supported page size (frontend PAGE_SIZE_OPTIONS /
        # backend ALLOWED_PAGE_SIZES) — it must keep working under the cap.
        self.get('/api/transactions?page_size=200', **self.auth_headers())
        self.assertStatus(200)

    def test_ordering_by_own_currency_allowed(self):
        self.get('/api/transactions?ordering=currency__code', **self.auth_headers())
        self.assertStatus(200)

    def test_ordering_by_account_currency_rejected(self):
        self.get('/api/transactions?ordering=account__currency__code', **self.auth_headers())
        self.assertStatus(422)


class TestBulkSetAccount(TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.second = AccountFactory(workspace=self.workspace, name='Second')
        self.trans1 = TransactionFactory(account=self.account, workspace=self.workspace)
        self.trans2 = TransactionFactory(account=self.account, workspace=self.workspace)

    def test_bulk_set_account(self):
        payload = {'transaction_ids': [self.trans1.id, self.trans2.id], 'account_id': self.second.id}
        data = self.post('/api/transactions/bulk-account', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['updated'], 2)
        self.trans1.refresh_from_db()
        self.assertEqual(self.trans1.account_id, self.second.id)

    def test_bulk_with_foreign_transaction_applies_nothing(self):
        foreign = TransactionFactory()
        payload = {'transaction_ids': [self.trans1.id, foreign.id], 'account_id': self.second.id}
        self.post('/api/transactions/bulk-account', payload, **self.auth_headers())
        self.assertStatus(400)
        self.trans1.refresh_from_db()
        self.assertEqual(self.trans1.account_id, self.account.id)

    def test_bulk_to_other_currency_account_returns_400(self):
        """A cross-currency move would silently reinterpret amounts."""
        from currencies.models import Currency

        eur, _ = Currency.objects.get_or_create(
            code='EUR', workspace=None, defaults={'name': 'Euro', 'symbol': '€', 'decimals': 2}
        )
        eur_account = AccountFactory(workspace=self.workspace, name='Euro acct', currency=eur)

        payload = {'transaction_ids': [self.trans1.id, self.trans2.id], 'account_id': eur_account.id}
        self.post('/api/transactions/bulk-account', payload, **self.auth_headers())
        self.assertStatus(400)
        self.trans1.refresh_from_db()
        self.assertEqual(self.trans1.account_id, self.account.id)

    def test_bulk_assigns_account_less_row_with_matching_currency(self):
        """Pocket-cash path: an account-less PLN row can be assigned to a PLN account."""
        pln = Currency.objects.get(workspace__isnull=True, code='PLN')
        account_less = TransactionFactory(account=None, currency=pln, workspace=self.workspace)

        payload = {'transaction_ids': [account_less.id], 'account_id': self.second.id}
        data = self.post('/api/transactions/bulk-account', payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['updated'], 1)
        account_less.refresh_from_db()
        self.assertEqual(account_less.account_id, self.second.id)

    def test_bulk_account_less_row_with_other_currency_returns_400(self):
        usd, _ = Currency.objects.get_or_create(
            code='USD', workspace=None, defaults={'name': 'US Dollar', 'symbol': '$', 'decimals': 2}
        )
        account_less = TransactionFactory(account=None, currency=usd, workspace=self.workspace)

        payload = {'transaction_ids': [account_less.id], 'account_id': self.second.id}
        self.post('/api/transactions/bulk-account', payload, **self.auth_headers())
        self.assertStatus(400)
        account_less.refresh_from_db()
        self.assertIsNone(account_less.account_id)


class TestAccountBalanceWithTransactions(TransactionTestCase):
    def test_balance_formula(self):
        """opening 100 + income 50 − expense 30 + adjustment(−20) = 100."""
        TransactionFactory(account=self.account, workspace=self.workspace, amount=Decimal('50.00'), type='income')
        TransactionFactory(account=self.account, workspace=self.workspace, amount=Decimal('30.00'), type='expense')
        TransactionFactory(account=self.account, workspace=self.workspace, amount=Decimal('-20.00'), type='adjustment')

        self.assertEqual(AccountService.balance(self.account), Decimal('100.00'))

    def test_account_delete_blocked_with_transactions_archive_allowed(self):
        TransactionFactory(account=self.account, workspace=self.workspace)

        self.delete(f'/api/accounts/{self.account.id}', **self.auth_headers())
        self.assertStatus(400)

        self.patch(f'/api/accounts/{self.account.id}/archive', {'is_archived': True}, **self.auth_headers())
        self.assertStatus(200)


class TestUpdateDelete(TransactionTestCase):
    def test_update_on_archived_account_allowed(self):
        """Archiving keeps history editable — only retargeting to archived is blocked."""
        created = self.post('/api/transactions', self._payload(account_id=self.account.id), **self.auth_headers())
        self.account.is_archived = True
        self.account.save(update_fields=['is_archived'])

        data = self.put(
            f'/api/transactions/{created["id"]}',
            self._payload(account_id=self.account.id, description='Fixed typo'),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['description'], 'Fixed typo')

    def test_update_retarget_to_archived_account_returns_400(self):
        archived = AccountFactory(workspace=self.workspace, name='Old', is_archived=True)
        created = self.post('/api/transactions', self._payload(account_id=self.account.id), **self.auth_headers())

        self.put(
            f'/api/transactions/{created["id"]}',
            self._payload(account_id=archived.id),
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_update_moves_between_accounts(self):
        second = AccountFactory(workspace=self.workspace, name='Second')
        created = self.post('/api/transactions', self._payload(account_id=self.account.id), **self.auth_headers())

        data = self.put(
            f'/api/transactions/{created["id"]}',
            self._payload(account_id=second.id, description='Moved'),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['account_id'], second.id)

    def test_update_account_id_none_clears_the_account(self):
        """account_id is authoritative on update: None clears it (currency_code becomes required)."""
        created = self.post('/api/transactions', self._payload(account_id=self.account.id), **self.auth_headers())

        data = self.put(
            f'/api/transactions/{created["id"]}',
            self._payload(account_id=None, currency_code='PLN', description='Cleared'),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertIsNone(data['account_id'])
        self.assertIsNone(data['account_name'])
        self.assertEqual(data['currency_code'], 'PLN')

    def test_update_account_less_without_currency_returns_400(self):
        created = self.post('/api/transactions', self._payload(account_id=self.account.id), **self.auth_headers())
        self.put(f'/api/transactions/{created["id"]}', self._payload(account_id=None), **self.auth_headers())
        self.assertStatus(400)

    def test_update_with_null_category(self):
        """Explicit category_id=null must update fine (modal sends null when budget changes)."""
        created = self.post(
            '/api/transactions',
            self._payload(account_id=self.account.id, category_id=self.groceries.id),
            **self.auth_headers(),
        )

        data = self.put(
            f'/api/transactions/{created["id"]}',
            self._payload(
                account_id=self.account.id,
                category_id=None,
                original_amount=None,
                original_currency_code=None,
            ),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertIsNone(data['category_id'])
        self.assertIsNone(data['category_budget_id'])

    def test_delete(self):
        trans = TransactionFactory(account=self.account, workspace=self.workspace)
        self.delete(f'/api/transactions/{trans.id}', **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(Transaction.objects.filter(id=trans.id).exists())

    def test_viewer_cannot_write(self):
        trans = TransactionFactory(account=self.account, workspace=self.workspace)
        from workspaces.models import WorkspaceMember

        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.post('/api/transactions', self._payload(), **self.auth_headers())
        self.assertStatus(403)
        self.delete(f'/api/transactions/{trans.id}', **self.auth_headers())
        self.assertStatus(403)


class TestExportImport(TransactionTestCase):
    def test_export_includes_account_currency_original(self):
        usd = CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        TransactionFactory(
            account=self.account,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            description='Converted payment',
            amount=Decimal('51.20'),
            type='expense',
            original_amount=Decimal('12.99'),
            original_currency=usd,
        )

        response = self.client.get('/api/transactions/export/', **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        rows = json.loads(response.content)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['account_name'], 'Main')
        self.assertEqual(rows[0]['currency_code'], 'PLN')
        self.assertEqual(rows[0]['original_amount'], '12.99')
        self.assertEqual(rows[0]['original_currency_code'], 'USD')

    def test_export_account_less_row_emits_null_account_name(self):
        usd = CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        TransactionFactory(
            account=None,
            currency=usd,
            workspace=self.workspace,
            date=date(2026, 7, 6),
            description='Cash tip',
            amount=Decimal('5.00'),
            type='expense',
        )

        response = self.client.get('/api/transactions/export/', **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        rows = json.loads(response.content)
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]['account_name'])
        self.assertEqual(rows[0]['currency_code'], 'USD')

    def test_import_lands_rows_in_given_account(self):
        rows = [
            {'date': '2026-07-01', 'description': 'Imported A', 'amount': '10.00', 'type': 'expense'},
            {
                'date': '2026-07-02',
                'description': 'Imported B',
                'amount': '20.00',
                'type': 'expense',
                'category_name': 'Groceries',
            },
        ]
        upload = self._json_file(rows)
        response = self.client.post(
            '/api/transactions/import',
            {'account_id': self.account.id, 'budget_id': self.budget.id, 'file': upload},
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 201)

        imported = Transaction.objects.filter(account=self.account, description__startswith='Imported')
        self.assertEqual(imported.count(), 2)
        self.assertEqual(imported.get(description='Imported B').category_id, self.groceries.id)

    def test_import_without_budget_leaves_categories_null(self):
        rows = [
            {
                'date': '2026-07-02',
                'description': 'No budget',
                'amount': '20.00',
                'type': 'expense',
                'category_name': 'Groceries',
            },
        ]
        response = self.client.post(
            '/api/transactions/import',
            {'account_id': self.account.id, 'file': self._json_file(rows)},
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(Transaction.objects.get(description='No budget').category_id)

    def _json_file(self, rows):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return SimpleUploadedFile('rows.json', json.dumps(rows).encode(), content_type='application/json')


class TestFrequentDescriptions(TransactionTestCase):
    def test_frequent_descriptions(self):
        for _ in range(3):
            TransactionFactory(
                account=self.account, workspace=self.workspace, description='Biedronka', amount=Decimal('10.00')
            )
        TransactionFactory(account=self.account, workspace=self.workspace, description='Zabka', amount=Decimal('5.00'))

        data = self.get('/api/transactions/frequent-descriptions', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['items'][0]['description'], 'Biedronka')
        self.assertEqual(data['items'][0]['count'], 3)
        self.assertEqual(data['items'][0]['currency'], 'PLN')

    def test_frequent_descriptions_groups_account_less_by_own_currency(self):
        usd = CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        for _ in range(2):
            TransactionFactory(
                account=None,
                currency=usd,
                workspace=self.workspace,
                description='Biedronka',
                amount=Decimal('10.00'),
            )
        TransactionFactory(
            account=self.account, workspace=self.workspace, description='Biedronka', amount=Decimal('7.00')
        )

        data = self.get('/api/transactions/frequent-descriptions', **self.auth_headers())
        self.assertStatus(200)
        by_currency = {(i['description'], i['currency']): i['count'] for i in data['items']}
        self.assertEqual(by_currency[('Biedronka', 'USD')], 2)
        self.assertEqual(by_currency[('Biedronka', 'PLN')], 1)


class TestDerivedPeriodServiceLevel(TestCase):
    """get_or_create_for_date is invoked with the transaction's own date."""

    def test_period_touch_uses_transaction_date(self):
        from common.tests.factories import UserFactory

        user = UserFactory()
        workspace = WorkspaceFactory()
        budget = BudgetFactory(workspace=workspace)
        category = CategoryFactory(budget=budget, workspace=workspace, name='Food')

        TransactionService._touch_period(user, category, date(2026, 3, 14))
        period = PeriodService.get_or_create_for_date(user, budget, date(2026, 3, 1))
        self.assertEqual(Period.objects.filter(budget=budget).count(), 1)
        self.assertEqual(period.start_date, date(2026, 3, 1))


class TestTransactionItems(TransactionTestCase):
    """Line items: informational, ordered, replace-all semantics (R2)."""

    def setUp(self):
        super().setUp()
        self.trans = TransactionFactory(account=self.account, amount=Decimal('23.97'), description='Groceries run')

    def _items_url(self):
        return f'/api/transactions/{self.trans.id}/items'

    def test_empty_by_default(self):
        data = self.get(self._items_url(), **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['items'], [])
        self.assertEqual(data['items_total'], '0.00')

    def test_replace_creates_ordered_items(self):
        payload = {
            'items': [
                {'name': 'Bread', 'quantity': '1', 'unit_price': '4.99', 'line_total': '4.99'},
                {'name': 'Milk', 'quantity': '2', 'unit_price': '3.99', 'line_total': '7.98'},
                {'name': 'Cheese', 'quantity': '1', 'unit_price': '11.00', 'line_total': '11.00'},
            ]
        }
        data = self.put(self._items_url(), payload, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([i['name'] for i in data['items']], ['Bread', 'Milk', 'Cheese'])
        self.assertEqual([i['position'] for i in data['items']], [0, 1, 2])
        self.assertEqual(data['items_total'], '23.97')

    def test_replace_reorders_and_deletes(self):
        self.put(
            self._items_url(),
            {'items': [{'name': 'A', 'line_total': '1.00'}, {'name': 'B', 'line_total': '2.00'}]},
            **self.auth_headers(),
        )
        data = self.put(
            self._items_url(),
            {'items': [{'name': 'B', 'line_total': '2.00'}]},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual([i['name'] for i in data['items']], ['B'])
        self.assertEqual(TransactionItem.objects.filter(transaction=self.trans).count(), 1)

    def test_items_total_falls_back_to_quantity_times_unit_price(self):
        data = self.put(
            self._items_url(),
            {'items': [{'name': 'Tomatoes', 'quantity': '0.782', 'unit_price': '9.99'}]},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['items_total'], '7.81')

    def test_items_do_not_change_amount_or_balance(self):
        balance_before = AccountService.balance(self.account)
        self.put(self._items_url(), {'items': [{'name': 'X', 'line_total': '999.99'}]}, **self.auth_headers())
        self.trans.refresh_from_db()
        self.assertEqual(self.trans.amount, Decimal('23.97'))
        self.assertEqual(AccountService.balance(self.account), balance_before)

    def test_items_deleted_with_transaction(self):
        self.put(self._items_url(), {'items': [{'name': 'X', 'line_total': '1.00'}]}, **self.auth_headers())
        self.delete(f'/api/transactions/{self.trans.id}', **self.auth_headers())
        self.assertEqual(TransactionItem.objects.filter(transaction_id=self.trans.id).count(), 0)

    def test_other_workspace_transaction_404(self):
        other_trans = TransactionFactory()
        self.get(f'/api/transactions/{other_trans.id}/items', **self.auth_headers())
        self.assertStatus(404)

    def test_viewer_cannot_replace_items(self):
        from workspaces.models import WorkspaceMember

        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.put(self._items_url(), {'items': []}, **self.auth_headers())
        self.assertStatus(403)

    def test_blank_name_rejected(self):
        self.put(self._items_url(), {'items': [{'name': '   ', 'line_total': '1.00'}]}, **self.auth_headers())
        self.assertStatus(422)


class TestTransactionAttachments(TransactionTestCase):
    """Attachment endpoints with StorageService mocked (R1)."""

    def setUp(self):
        super().setUp()
        self.trans = TransactionFactory(account=self.account, description='With receipt')
        # Pretend S3 is configured; individual operations are mocked per test.
        patcher = mock.patch('transactions.attachments.StorageService')
        self.storage = patcher.start()
        self.addCleanup(patcher.stop)
        self.storage._is_enabled.return_value = True
        self.storage.save_file.side_effect = lambda bucket, key, content, content_type: key
        self.storage.delete_file.return_value = True

    def _attachments_url(self):
        return f'/api/transactions/{self.trans.id}/attachments'

    def _upload(self, name='receipt.jpg', content_type='image/jpeg', content=b'fakebytes'):
        upload = SimpleUploadedFile(name, content, content_type=content_type)
        return self.client.post(
            self._attachments_url(),
            {'file': upload},
            **self.auth_headers(),
        )

    def test_upload_and_list(self):
        response = self._upload()
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['filename'], 'receipt.jpg')
        self.assertEqual(data['content_type'], 'image/jpeg')
        self.assertNotIn('download_url', data)

        listed = self.get(self._attachments_url(), **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(listed), 1)
        self.assertNotIn('download_url', listed[0])
        self.storage.save_file.assert_called_once()
        key = self.storage.save_file.call_args[0][1]
        self.assertTrue(key.startswith(f'attachments/{self.workspace.id}/{self.trans.id}/'))
        self.assertTrue(key.endswith('.jpg'))

    def test_upload_pdf_ok(self):
        response = self._upload(name='receipt.pdf', content_type='application/pdf')
        self.assertEqual(response.status_code, 201)

    def test_unsupported_type_rejected(self):
        response = self._upload(name='malware.exe', content_type='application/octet-stream')
        self.assertEqual(response.status_code, 400)
        self.storage.save_file.assert_not_called()

    def test_storage_disabled_returns_503(self):
        self.storage._is_enabled.return_value = False
        response = self._upload()
        self.assertEqual(response.status_code, 503)

    def test_delete_removes_row_and_storage_object(self):
        created = self._upload().json()
        self.delete(f'{self._attachments_url()}/{created["id"]}', **self.auth_headers())
        self.assertStatus(204)
        self.assertEqual(TransactionAttachment.objects.filter(transaction=self.trans).count(), 0)
        self.storage.delete_file.assert_called_once()

    def test_transaction_delete_cleans_storage(self):
        self._upload()
        self.delete(f'/api/transactions/{self.trans.id}', **self.auth_headers())
        self.assertStatus(204)
        self.storage.delete_file.assert_called_once()
        self.assertEqual(TransactionAttachment.objects.count(), 0)

    def test_workspace_deletion_cleans_storage(self):
        from common.services.base import delete_workspace_financial_records

        self._upload()
        delete_workspace_financial_records(self.workspace.id)
        self.storage.delete_file.assert_called_once()
        self.assertEqual(TransactionAttachment.objects.count(), 0)

    def test_other_workspace_404(self):
        other_trans = TransactionFactory()
        self.get(f'/api/transactions/{other_trans.id}/attachments', **self.auth_headers())
        self.assertStatus(404)

    def test_viewer_cannot_upload(self):
        from workspaces.models import WorkspaceMember

        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        response = self._upload()
        self.assertEqual(response.status_code, 403)

    def test_gdpr_export_import_round_trip(self):
        from transactions.attachments import AttachmentService

        self._upload(name='shop.jpg', content=b'originalbytes')
        # Export reads the stored bytes back as base64.
        self.storage.get_file.return_value = b'originalbytes'
        exported = AttachmentService.export_for_transaction(self.trans)
        self.assertEqual(len(exported), 1)
        self.assertEqual(exported[0]['filename'], 'shop.jpg')
        self.assertIsNotNone(exported[0]['content_b64'])

        # Import into a fresh transaction recreates the stored object + row.
        target = TransactionFactory(account=self.account, description='Restored')
        created = AttachmentService.import_for_transaction(self.user, target, exported)
        self.assertEqual(created, 1)
        self.assertEqual(target.attachments.count(), 1)
        self.assertEqual(target.attachments.first().filename, 'shop.jpg')


class TestAttachmentDownload(TransactionTestCase):
    """Authenticated file download endpoint (bytes streamed via the API)."""

    def setUp(self):
        super().setUp()
        self.trans = TransactionFactory(account=self.account, description='With receipt')
        patcher = mock.patch('transactions.attachments.StorageService')
        self.storage = patcher.start()
        self.addCleanup(patcher.stop)
        self.storage._is_enabled.return_value = True
        self.storage.get_file.return_value = b'storedbytes'
        self.attachment = self.trans.attachments.create(
            file_key='attachments/x.jpg', filename='r.jpg', content_type='image/jpeg', size=11, uploaded_by=self.user
        )

    def _download_url(self, attachment_id=None):
        return f'/api/transactions/{self.trans.id}/attachments/{attachment_id or self.attachment.id}/download'

    def test_download_streams_bytes_with_headers(self):
        response = self.client.get(self._download_url(), **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'storedbytes')
        self.assertEqual(response['Content-Type'], 'image/jpeg')
        disposition = response['Content-Disposition']
        self.assertIn('attachment', disposition)
        self.assertIn('filename="r.jpg"', disposition)
        self.assertIn("filename*=UTF-8''r.jpg", disposition)
        self.storage.get_file.assert_called_once()

    def test_unicode_filename_uses_ascii_fallback_and_rfc5987_param(self):
        self.attachment.filename = 'paragón.jpg'
        self.attachment.save()
        response = self.client.get(self._download_url(), **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        disposition = response['Content-Disposition']
        self.assertIn('filename="parag_n.jpg"', disposition)
        self.assertIn("filename*=UTF-8''parag%C3%B3n.jpg", disposition)

    def test_other_workspace_transaction_404(self):
        other_trans = TransactionFactory()
        url = f'/api/transactions/{other_trans.id}/attachments/{self.attachment.id}/download'
        self.get(url, **self.auth_headers())
        self.assertStatus(404)
        self.storage.get_file.assert_not_called()

    def test_nonexistent_attachment_404(self):
        self.get(self._download_url(attachment_id=999999), **self.auth_headers())
        self.assertStatus(404)

    def test_storage_disabled_503(self):
        self.storage._is_enabled.return_value = False
        self.get(self._download_url(), **self.auth_headers())
        self.assertStatus(503)

    def test_missing_file_404_with_code(self):
        self.storage.get_file.return_value = None
        data = self.get(self._download_url(), **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(data['code'], 'file_missing')

    def test_viewer_can_download(self):
        from workspaces.models import WorkspaceMember

        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        response = self.client.get(self._download_url(), **self.auth_headers())
        self.assertEqual(response.status_code, 200)


class TestTransactionAttachmentAdmin(TransactionTestCase):
    """Admin presigned download link - the live consumer of get_presigned_url."""

    def setUp(self):
        super().setUp()
        self.trans = TransactionFactory(account=self.account, description='With receipt')
        self.attachment = self.trans.attachments.create(
            file_key='attachments/x.jpg', filename='r.jpg', content_type='image/jpeg', size=10, uploaded_by=self.user
        )

    def _model_admin(self):
        from django.contrib import admin as django_admin

        from transactions.admin import TransactionAttachmentAdmin

        return TransactionAttachmentAdmin(TransactionAttachment, django_admin.site)

    def test_link_is_presigned_url_with_short_expiry(self):
        from transactions.attachments import DOWNLOAD_URL_EXPIRY_SECONDS

        with mock.patch('transactions.admin.StorageService') as storage:
            storage.get_presigned_url.return_value = 'http://signed.example/admin'
            rendered = self._model_admin().presigned_download_link(self.attachment)
        storage.get_presigned_url.assert_called_once()
        self.assertEqual(storage.get_presigned_url.call_args.kwargs['expiry'], DOWNLOAD_URL_EXPIRY_SECONDS)
        self.assertIn('http://signed.example/admin', rendered)

    def test_link_reports_storage_disabled(self):
        with mock.patch('transactions.admin.StorageService') as storage:
            storage.get_presigned_url.return_value = None
            rendered = self._model_admin().presigned_download_link(self.attachment)
        self.assertEqual(rendered, 'storage disabled')


CONTRACT_RESULT = {
    'schema_version': '1',
    'merchant': 'Lidl',
    'date': '2026-06-14',
    'currency': 'PLN',
    'total': '20.47',
    'items': [
        {'name': 'Bread', 'quantity': '1', 'unit_price': '4.49', 'line_total': '4.49', 'confidence': 0.98},
        {'name': 'Butter', 'quantity': '2', 'unit_price': '7.99', 'line_total': '15.98', 'confidence': 0.7},
    ],
    'confidence': {'merchant': 0.9, 'date': 0.95, 'currency': 0.99, 'total': 0.98, 'items': 0.8},
    'warnings': [],
}


class TestExtraction(TransactionTestCase):
    """Receipt extraction dispatch + polling (R5). Celery runs eager in tests."""

    def setUp(self):
        super().setUp()
        self.trans = TransactionFactory(account=self.account, description='Receipt tx')
        storage_patcher = mock.patch('transactions.attachments.StorageService')
        self.storage = storage_patcher.start()
        self.addCleanup(storage_patcher.stop)
        self.storage._is_enabled.return_value = True
        self.storage.save_file.side_effect = lambda bucket, key, content, content_type: key
        self.storage.get_file.return_value = b'imagebytes'
        # Pretend a parser is configured.
        enabled_patcher = mock.patch('transactions.parser_client.is_enabled', return_value=True)
        enabled_patcher.start()
        self.addCleanup(enabled_patcher.stop)
        self.attachment = self.trans.attachments.create(
            file_key='attachments/x.jpg', filename='r.jpg', content_type='image/jpeg', size=10, uploaded_by=self.user
        )

    def _extract_url(self):
        return f'/api/transactions/{self.trans.id}/attachments/{self.attachment.id}/extract'

    def _state_url(self):
        return f'/api/transactions/{self.trans.id}/attachments/{self.attachment.id}/extraction'

    def test_config_reports_enabled_flag(self):
        with mock.patch('transactions.parser_client.is_enabled', return_value=False):
            data = self.get('/api/transactions/extraction/config', **self.auth_headers())
        self.assertStatus(200)
        self.assertFalse(data['enabled'])

    def test_extract_success_stores_result(self):
        with mock.patch('transactions.tasks.parse_receipt', return_value=CONTRACT_RESULT) as parse:
            self.post(self._extract_url(), {}, **self.auth_headers())
        self.assertStatus(202)
        parse.assert_called_once()
        state = self.get(self._state_url(), **self.auth_headers())
        self.assertEqual(state['status'], 'done')
        self.assertEqual(state['result']['total'], '20.47')

    def test_extract_failure_records_error(self):
        from transactions.parser_client import ParserServiceError

        with mock.patch('transactions.tasks.parse_receipt', side_effect=ParserServiceError('boom')):
            self.post(self._extract_url(), {}, **self.auth_headers())
        state = self.get(self._state_url(), **self.auth_headers())
        self.assertEqual(state['status'], 'failed')
        self.assertIn('boom', state['error'])
        self.assertIsNone(state['result'])

    def test_extract_disabled_returns_503(self):
        with mock.patch('transactions.parser_client.is_enabled', return_value=False):
            self.post(self._extract_url(), {}, **self.auth_headers())
        self.assertStatus(503)

    def test_missing_file_marks_failed(self):
        self.storage.get_file.return_value = None
        self.post(self._extract_url(), {}, **self.auth_headers())
        state = self.get(self._state_url(), **self.auth_headers())
        self.assertEqual(state['status'], 'failed')

    def test_viewer_cannot_extract(self):
        from workspaces.models import WorkspaceMember

        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.post(self._extract_url(), {}, **self.auth_headers())
        self.assertStatus(403)

    def test_extraction_status_in_attachment_list(self):
        with mock.patch('transactions.tasks.parse_receipt', return_value=CONTRACT_RESULT):
            self.post(self._extract_url(), {}, **self.auth_headers())
        listed = self.get(f'/api/transactions/{self.trans.id}/attachments', **self.auth_headers())
        self.assertEqual(listed[0]['extraction_status'], 'done')

    def test_parse_receipt_preview_persists_nothing(self):
        before = Transaction.objects.count()
        upload = SimpleUploadedFile('r.jpg', b'bytes', content_type='image/jpeg')
        with mock.patch('transactions.parser_client.parse_receipt', return_value=CONTRACT_RESULT):
            response = self.client.post('/api/transactions/extraction/parse', {'file': upload}, **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['total'], '20.47')
        # No transaction and no attachment created.
        self.assertEqual(Transaction.objects.count(), before)
        self.assertEqual(TransactionAttachment.objects.count(), 1)  # only the setUp attachment

    def test_parse_receipt_preview_disabled_returns_503(self):
        upload = SimpleUploadedFile('r.jpg', b'bytes', content_type='image/jpeg')
        with mock.patch('transactions.parser_client.is_enabled', return_value=False):
            response = self.client.post('/api/transactions/extraction/parse', {'file': upload}, **self.auth_headers())
        self.assertEqual(response.status_code, 503)

    def test_parse_receipt_preview_offline_returns_503_not_400(self):
        """A powered-off parser host is not a bad upload — the client must be able
        to tell "try later" apart from "this receipt was rejected"."""
        from transactions.parser_client import ParserUnavailableError

        upload = SimpleUploadedFile('r.jpg', b'bytes', content_type='image/jpeg')
        with mock.patch(
            'transactions.parser_client.parse_receipt', side_effect=ParserUnavailableError('connection refused')
        ):
            response = self.client.post('/api/transactions/extraction/parse', {'file': upload}, **self.auth_headers())
        self.assertEqual(response.status_code, 503)
        self.assertIn('offline', response.json()['detail'].lower())


class TestParserReachability(TransactionTestCase):
    """Live reachability probing (T14) — the parser host is intermittently powered on."""

    def setUp(self):
        super().setUp()
        cache.clear()  # locmem cache persists across tests in a process
        self.addCleanup(cache.clear)

    def _config(self):
        return self.get('/api/transactions/extraction/config', **self.auth_headers())

    def test_config_reports_reachable_when_health_answers(self):
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            mock.patch('transactions.parser_client.requests.get') as get,
        ):
            get.return_value = mock.Mock(status_code=200)
            data = self._config()
        self.assertStatus(200)
        self.assertTrue(data['enabled'])
        self.assertTrue(data['reachable'])

    def test_config_reports_unreachable_when_host_is_down(self):
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            mock.patch(
                'transactions.parser_client.requests.get', side_effect=requests.ConnectionError('no route to host')
            ),
        ):
            data = self._config()
        # Configured but offline: the UI relabels the affordance instead of hiding it.
        self.assertTrue(data['enabled'])
        self.assertFalse(data['reachable'])

    def test_disabled_parser_is_never_probed(self):
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=False),
            mock.patch('transactions.parser_client.requests.get') as get,
        ):
            data = self._config()
        self.assertFalse(data['reachable'])
        get.assert_not_called()

    def test_probe_result_is_cached(self):
        """One probe per TTL — an offline host must not stall every config poll."""
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            mock.patch('transactions.parser_client.requests.get') as get,
        ):
            get.return_value = mock.Mock(status_code=200)
            self._config()
            self._config()
            self._config()
        get.assert_called_once()

    def test_health_probe_uses_short_timeout(self):
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            mock.patch('transactions.parser_client.requests.get') as get,
        ):
            get.return_value = mock.Mock(status_code=200)
            self._config()
        self.assertEqual(get.call_args.kwargs['timeout'], settings.PARSER_HEALTH_TIMEOUT_SECONDS)


class TestParserClientErrorClassification(TestCase):
    """Transient (retryable) vs permanent parser failures."""

    def _parse(self):
        return parse_receipt(b'bytes', 'r.jpg', 'image/jpeg')

    def test_connection_error_is_retryable(self):
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            mock.patch('transactions.parser_client.requests.post', side_effect=requests.ConnectionError('down')),
            self.assertRaises(ParserUnavailableError),
        ):
            self._parse()

    def test_model_unavailable_503_is_retryable(self):
        response = mock.Mock(status_code=503)
        response.json.return_value = {'error': {'message': 'The extraction model is unavailable.'}}
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            mock.patch('transactions.parser_client.requests.post', return_value=response),
            self.assertRaises(ParserUnavailableError),
        ):
            self._parse()

    def test_rejected_file_4xx_is_permanent(self):
        response = mock.Mock(status_code=422)
        response.json.return_value = {'error': {'message': 'The receipt is unreadable.'}}
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            mock.patch('transactions.parser_client.requests.post', return_value=response),
            self.assertRaises(ParserServiceError) as caught,
        ):
            self._parse()
        self.assertNotIsInstance(caught.exception, ParserUnavailableError)


class TestExtractionRetries(TransactionTestCase):
    """The extraction task must survive the parser host being off for hours (T14)."""

    def setUp(self):
        super().setUp()
        self.trans = TransactionFactory(account=self.account, description='Receipt tx')
        storage_patcher = mock.patch('transactions.attachments.StorageService')
        self.storage = storage_patcher.start()
        self.addCleanup(storage_patcher.stop)
        self.storage._is_enabled.return_value = True
        self.storage.get_file.return_value = b'imagebytes'
        self.attachment = self.trans.attachments.create(
            file_key='attachments/x.jpg', filename='r.jpg', content_type='image/jpeg', size=10, uploaded_by=self.user
        )

    def _status(self):
        self.attachment.refresh_from_db()
        return self.attachment.extraction_status

    def test_transient_failure_retries_and_succeeds_when_host_returns(self):
        """Home server off, then back: the receipt is extracted without user action."""
        with mock.patch(
            'transactions.tasks.parse_receipt', side_effect=[ParserUnavailableError('host down'), CONTRACT_RESULT]
        ) as parse:
            extract_attachment.apply(args=[self.attachment.id])
        self.assertEqual(parse.call_count, 2)
        self.assertEqual(self._status(), 'done')
        self.attachment.refresh_from_db()
        self.assertEqual(self.attachment.extraction_result['total'], '20.47')

    def test_exhausted_retries_mark_failed_with_offline_message(self):
        with (
            mock.patch.object(extract_attachment, 'max_retries', 1),
            mock.patch('transactions.tasks.parse_receipt', side_effect=ParserUnavailableError('host down')) as parse,
        ):
            extract_attachment.apply(args=[self.attachment.id])
        self.assertEqual(parse.call_count, 2)  # initial attempt + one retry
        self.assertEqual(self._status(), 'failed')
        self.attachment.refresh_from_db()
        self.assertIn('unavailable', self.attachment.extraction_error.lower())

    def test_rejected_file_fails_immediately_without_retrying(self):
        with mock.patch(
            'transactions.tasks.parse_receipt', side_effect=ParserServiceError('Parser returned 422: unreadable')
        ) as parse:
            extract_attachment.apply(args=[self.attachment.id])
        parse.assert_called_once()  # retrying sends identical bytes — pointless
        self.assertEqual(self._status(), 'failed')

    def test_missing_attachment_is_a_no_op(self):
        with mock.patch('transactions.tasks.parse_receipt') as parse:
            extract_attachment.apply(args=[self.attachment.id + 999])
        parse.assert_not_called()


class TestExtractionTaskConfig(TestCase):
    def test_retry_config_covers_hours_of_downtime(self):
        self.assertEqual(extract_attachment.autoretry_for, (ParserUnavailableError,))
        self.assertEqual(extract_attachment.max_retries, settings.PARSER_EXTRACT_MAX_RETRIES)
        self.assertEqual(extract_attachment.retry_backoff, settings.PARSER_EXTRACT_RETRY_BACKOFF)
        self.assertEqual(extract_attachment.retry_backoff_max, settings.PARSER_EXTRACT_RETRY_BACKOFF_MAX)
        self.assertTrue(extract_attachment.retry_jitter)


class TestAutoFillFromExtraction(TransactionTestCase):
    """auto_fill_from_extraction — server-side auto-fill from a parsed receipt.

    Covers: items created when zero, description filled from merchant, no-clobber
    guards, bad-decimal skipping, attachment-result regression, idempotency,
    and a missing transaction (deleted between queue and run).
    """

    def setUp(self):
        super().setUp()
        self.trans = TransactionFactory(account=self.account, description='Receipt')

    def _result(self, **overrides):
        """Return a fresh copy of CONTRACT_RESULT so tests can't mutate the shared constant."""
        result = {**CONTRACT_RESULT}
        if 'items' in overrides:
            result['items'] = [dict(i) for i in overrides.pop('items')]
        result.update(overrides)
        return result

    def test_creates_items_and_fills_description_when_blank(self):
        self.trans.description = ''
        self.trans.save(update_fields=['description'])

        created = TransactionService.auto_fill_from_extraction(self.trans, self._result())

        self.assertTrue(created)
        self.assertEqual(
            list(self.trans.items.values_list('name', flat=True)),
            ['Bread', 'Butter'],
        )
        self.trans.refresh_from_db()
        self.assertEqual(self.trans.description, 'Lidl')

    def test_fills_description_when_placeholder_receipt(self):
        # setUp already sets description = 'Receipt'.
        created = TransactionService.auto_fill_from_extraction(self.trans, self._result())

        self.assertTrue(created)
        self.trans.refresh_from_db()
        self.assertEqual(self.trans.description, 'Lidl')

    def test_does_not_touch_items_when_already_populated(self):
        TransactionItemFactory(transaction=self.trans, position=0, name='Existing row')

        created = TransactionService.auto_fill_from_extraction(self.trans, self._result())

        self.assertFalse(created)
        names = list(self.trans.items.values_list('name', flat=True))
        self.assertEqual(names, ['Existing row'])

    def test_does_not_overwrite_intentional_description(self):
        self.trans.description = 'Groceries'
        self.trans.save(update_fields=['description'])

        created = TransactionService.auto_fill_from_extraction(self.trans, self._result())

        # Items are still auto-created (no existing rows); only description is preserved.
        self.assertTrue(created)
        self.trans.refresh_from_db()
        self.assertEqual(self.trans.description, 'Groceries')

    def test_skips_rows_with_bad_decimals_keeps_good_ones(self):
        result = self._result(
            items=[
                {'name': 'Bread', 'quantity': '1', 'unit_price': '4.49', 'line_total': '4.49'},
                {'name': 'Bad', 'quantity': 'NaN', 'unit_price': 'oops', 'line_total': 'nope'},
                {'name': 'Butter', 'quantity': '2', 'unit_price': '7.99', 'line_total': '15.98'},
            ],
        )

        created = TransactionService.auto_fill_from_extraction(self.trans, result)

        self.assertTrue(created)
        self.assertEqual(
            list(self.trans.items.values_list('name', flat=True)),
            ['Bread', 'Butter'],
        )
        # Positions are dense across the surviving rows (Bad is dropped, Butter is position 1).
        self.assertEqual(
            list(self.trans.items.values_list('position', flat=True)),
            [0, 1],
        )

    def test_result_still_stored_on_attachment(self):
        """Regression: auto-fill must not interfere with the existing
        mark_extraction_done behavior that persists the result on the attachment."""
        attachment = self.trans.attachments.create(
            file_key='attachments/x.jpg',
            filename='r.jpg',
            content_type='image/jpeg',
            size=10,
            uploaded_by=self.user,
        )
        # Storage is disabled by default in tests; the task reads bytes via
        # AttachmentService.read_bytes → StorageService.get_file. Mock both so
        # the task runs end-to-end. Mirrors TestExtraction.setUp.
        with (
            mock.patch('transactions.attachments.StorageService') as storage,
            mock.patch('transactions.tasks.parse_receipt', return_value=CONTRACT_RESULT),
        ):
            storage._is_enabled.return_value = True
            storage.get_file.return_value = b'imagebytes'
            extract_attachment(attachment.id)

        attachment.refresh_from_db()
        self.assertEqual(attachment.extraction_status, 'done')
        self.assertEqual(attachment.extraction_result['total'], '20.47')
        # And the transaction was auto-filled as a side effect of the task.
        self.trans.refresh_from_db()
        self.assertEqual(self.trans.items.count(), 2)
        self.assertEqual(self.trans.description, 'Lidl')

    def test_idempotent_second_call_is_noop_on_items(self):
        TransactionService.auto_fill_from_extraction(self.trans, self._result())
        self.assertEqual(self.trans.items.count(), 2)

        created = TransactionService.auto_fill_from_extraction(self.trans, self._result())

        self.assertFalse(created)
        self.assertEqual(self.trans.items.count(), 2)

    def test_missing_transaction_does_not_raise(self):
        self.trans.delete()
        # A deleted transaction should not blow up the task — the method just returns False.
        created = TransactionService.auto_fill_from_extraction(self.trans, self._result())
        self.assertFalse(created)
