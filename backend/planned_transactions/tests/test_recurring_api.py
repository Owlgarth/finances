"""API and Celery/beat-schedule tests for recurring transaction rules."""

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from celery.schedules import crontab
from django.conf import settings
from django.test import TestCase
from django.utils import timezone

from accounts.factories import AccountFactory
from budgeting.factories import BudgetFactory
from categories.factories import CategoryFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService
from planned_transactions.exceptions import RecurringTransactionMaterializeAllWithoutEndDateError
from planned_transactions.factories import PlannedTransactionFactory, RecurringTransactionFactory
from planned_transactions.models import PlannedTransaction, RecurringTransaction
from planned_transactions.services import RecurringTransactionService
from planned_transactions.tasks import generate_recurring_transactions
from workspaces.models import WorkspaceMember


class RecurringApiTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base: one PLN account + one USD account + categories + one active rule.

    The base rule's start_date is 60 days in the future and the rule is
    factory-created, so it starts with ZERO materialized rows (factories
    never sync-generate - that hook lives in the service create/update
    paths). API creates and updates against future-dated payloads
    sync-generate exactly the upfront window, keeping row counts
    deterministic against timezone.now() at any runtime date.
    """

    def setUp(self):
        super().setUp()
        self.today = timezone.now().date()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        self.account = AccountFactory(workspace=self.workspace, name='Main')
        self.usd_account = AccountFactory(workspace=self.workspace, name='Dollars', currency=usd)
        self.budget = BudgetFactory(workspace=self.workspace)
        self.rent = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Rent')

        self.rule = RecurringTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='Monthly Rent',
            amount=Decimal('1200.00'),
            category=self.rent,
            interval_kind='monthly',
            interval_count=1,
            start_date=self.today + timedelta(days=60),
            is_active=True,
            created_by=self.user,
            updated_by=self.user,
        )

    def _payload(self, **overrides):
        payload = {
            'name': 'New Recurring',
            'amount': '100.00',
            'account_id': self.account.id,
            'interval_kind': 'monthly',
            'interval_count': 1,
            # Future start_date + default upfront_count=1: the create's
            # sync-generate materializes exactly ONE pending row (the
            # rule's first occurrence at start_date) regardless of the
            # runtime date.
            'start_date': (self.today + timedelta(days=30)).isoformat(),
            'upfront_count': 1,
            'materialize_all': False,
        }
        payload.update(overrides)
        return payload


class TestListRecurring(RecurringApiTestCase):
    def setUp(self):
        super().setUp()
        self.paused = RecurringTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='Paused gym',
            amount=Decimal('40.00'),
            interval_kind='monthly',
            start_date=self.today + timedelta(days=90),
            is_active=False,
        )

    def test_list_without_auth_returns_401(self):
        self.get('/api/recurring-transactions')
        self.assertStatus(401)

    def test_list_returns_active_rules_only_by_default(self):
        data = self.get('/api/recurring-transactions', **self.auth_headers())
        self.assertStatus(200)
        names = [rule['name'] for rule in data]
        self.assertIn('Monthly Rent', names)
        self.assertNotIn('Paused gym', names)

    def test_list_include_inactive_returns_paused_rules(self):
        data = self.get('/api/recurring-transactions?include_inactive=true', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual({rule['name'] for rule in data}, {'Monthly Rent', 'Paused gym'})

    def test_list_is_non_paginated_array(self):
        data = self.get('/api/recurring-transactions', **self.auth_headers())
        self.assertStatus(200)
        # Budgets-style full list, no {'items': ...} envelope.
        self.assertIsInstance(data, list)

    def test_list_workspace_scoping_excludes_foreign_rules(self):
        foreign = RecurringTransactionFactory(name='Foreign rule')
        data = self.get('/api/recurring-transactions?include_inactive=true', **self.auth_headers())
        self.assertNotIn(foreign.id, [rule['id'] for rule in data])

    def test_list_response_includes_derived_fields(self):
        data = self.get('/api/recurring-transactions', **self.auth_headers())
        rent_rule = next(rule for rule in data if rule['name'] == 'Monthly Rent')
        self.assertEqual(rent_rule['account_name'], 'Main')
        self.assertEqual(rent_rule['currency_code'], 'PLN')
        self.assertTrue(rent_rule['is_active'])
        # Never-generated rule: next occurrence is the grammar's first (the
        # start_date itself), serialized as an ISO date string.
        self.assertEqual(rent_rule['next_occurrence_date'], (self.today + timedelta(days=60)).isoformat())
        self.assertIsNone(rent_rule['last_generated_date'])
        self.assertEqual(rent_rule['upfront_count'], 1)
        self.assertFalse(rent_rule['materialize_all'])
        self.assertNotIn('lead_days', rent_rule)

    def test_viewer_can_list(self):
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        data = self.get('/api/recurring-transactions', **self.auth_headers())
        self.assertStatus(200)  # reads carry no role check
        self.assertEqual(len(data), 1)


class TestCreateRecurring(RecurringApiTestCase):
    def test_create_returns_201_with_rule_fields(self):
        data = self.post('/api/recurring-transactions', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['account_id'], self.account.id)
        self.assertEqual(data['currency_code'], 'PLN')
        self.assertTrue(data['is_active'])
        self.assertEqual(data['interval_kind'], 'monthly')
        self.assertEqual(data['upfront_count'], 1)
        self.assertFalse(data['materialize_all'])
        self.assertNotIn('lead_days', data)

    def test_create_accountless_with_currency_returns_201(self):
        payload = self._payload(currency_code='PLN')
        payload.pop('account_id')
        data = self.post('/api/recurring-transactions', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertIsNone(data['account_id'])
        self.assertEqual(data['currency_code'], 'PLN')

    def test_create_materializes_first_occurrence_sync(self):
        """Default upfront_count=1: the rule's first occurrence materializes inline."""
        data = self.post('/api/recurring-transactions', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(PlannedTransaction.objects.filter(recurring_id=data['id']).count(), 1)
        row = PlannedTransaction.objects.get(recurring_id=data['id'])
        self.assertEqual(row.status, 'pending')
        self.assertEqual(row.planned_date, self.today + timedelta(days=30))
        # The pointer advanced in the DB; the response serializes the
        # in-memory instance created before the generator's locked re-fetch
        # wrote the pointer, so it honestly reports the pre-write state
        # (known wire fact, backlog 2026-10-21 - do not "fix").
        rule = RecurringTransaction.objects.get(id=data['id'])
        self.assertEqual(rule.last_generated_date, self.today + timedelta(days=30))
        self.assertIsNone(data['last_generated_date'])
        self.assertEqual(data['pending_planned_count'], 0)

    def test_create_upfront_count_three_materializes_three_pending_rows(self):
        # Daily grammar keeps the expected dates pure timedelta math.
        data = self.post(
            '/api/recurring-transactions',
            self._payload(interval_kind='daily', upfront_count=3),
            **self.auth_headers(),
        )
        self.assertStatus(201)
        rows = PlannedTransaction.objects.filter(recurring_id=data['id'])
        self.assertEqual(rows.count(), 3)
        self.assertEqual(
            {r.planned_date for r in rows},
            {self.today + timedelta(days=k) for k in (30, 31, 32)},
        )
        self.assertTrue(all(r.status == 'pending' for r in rows))

    def test_create_materialize_all_generates_all_occurrences_to_end_date(self):
        # Daily rule, bounded end 5 days after start: all 6 occurrences
        # start..end materialize; the upfront window cap is ignored.
        data = self.post(
            '/api/recurring-transactions',
            self._payload(
                interval_kind='daily',
                materialize_all=True,
                end_date=(self.today + timedelta(days=35)).isoformat(),
            ),
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertTrue(data['materialize_all'])
        rows = PlannedTransaction.objects.filter(recurring_id=data['id'])
        self.assertEqual(rows.count(), 6)
        self.assertEqual(
            {r.planned_date for r in rows},
            {self.today + timedelta(days=k) for k in range(30, 36)},
        )
        # Same pre-generation wire fact as the default-window create above,
        # under materialize_all.
        rule = RecurringTransaction.objects.get(id=data['id'])
        self.assertEqual(rule.last_generated_date, self.today + timedelta(days=35))
        self.assertIsNone(data['last_generated_date'])
        self.assertEqual(data['pending_planned_count'], 0)

    def test_create_accountless_without_currency_returns_400(self):
        payload = self._payload()
        payload.pop('account_id')
        data = self.post('/api/recurring-transactions', payload, **self.auth_headers())
        self.assertStatus(400)
        self.assertEqual(data['code'], 'currency_required')

    def test_create_currency_not_enabled_returns_404(self):
        payload = self._payload(currency_code='GBP')
        payload.pop('account_id')
        data = self.post('/api/recurring-transactions', payload, **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(data['code'], 'currency_not_enabled')

    def test_create_currency_mismatch_returns_400(self):
        data = self.post('/api/recurring-transactions', self._payload(currency_code='USD'), **self.auth_headers())
        self.assertStatus(400)
        self.assertEqual(data['code'], 'currency_mismatch')

    def test_create_on_archived_account_returns_400(self):
        self.account.is_archived = True
        self.account.save()
        data = self.post('/api/recurring-transactions', self._payload(), **self.auth_headers())
        self.assertStatus(400)
        self.assertEqual(data['code'], 'account_archived')

    def test_create_on_foreign_account_returns_404(self):
        foreign = AccountFactory()
        self.post('/api/recurring-transactions', self._payload(account_id=foreign.id), **self.auth_headers())
        self.assertStatus(404)

    def test_create_archived_category_returns_400(self):
        archived = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Old', is_archived=True)
        data = self.post('/api/recurring-transactions', self._payload(category_id=archived.id), **self.auth_headers())
        self.assertStatus(400)
        self.assertEqual(data['code'], 'category_not_found')

    def test_create_end_date_before_start_returns_400(self):
        data = self.post(
            '/api/recurring-transactions',
            self._payload(end_date=(self.today + timedelta(days=29)).isoformat()),
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(data['code'], 'invalid_date_range')

    def test_create_materialize_all_without_end_date_returns_400(self):
        # Service-level validation: pydantic cannot catch the cross-field rule.
        data = self.post('/api/recurring-transactions', self._payload(materialize_all=True), **self.auth_headers())
        self.assertStatus(400)
        self.assertEqual(data['code'], 'materialize_all_requires_end')
        # Validation fired before the rule INSERT: nothing persisted.
        self.assertEqual(RecurringTransaction.objects.count(), 1)  # only the base rule
        self.assertFalse(PlannedTransaction.objects.exists())

    def test_create_materialize_all_over_500_occurrences_returns_400(self):
        # Daily rule, multi-year end: start today+30 to end today+600 is 571
        # occurrences > MAX_MATERIALIZE_OCCURRENCES (500).
        data = self.post(
            '/api/recurring-transactions',
            self._payload(
                interval_kind='daily',
                materialize_all=True,
                end_date=(self.today + timedelta(days=600)).isoformat(),
            ),
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(data['code'], 'materialize_all_limit')
        self.assertFalse(PlannedTransaction.objects.exists())

    def test_create_interval_count_below_1_returns_422(self):
        # Pydantic ge=1 fires before the service runs.
        self.post('/api/recurring-transactions', self._payload(interval_count=0), **self.auth_headers())
        self.assertStatus(422)

    def test_create_upfront_count_above_24_returns_422(self):
        # Pydantic le=24 fires before the service runs.
        self.post('/api/recurring-transactions', self._payload(upfront_count=25), **self.auth_headers())
        self.assertStatus(422)

    def test_create_upfront_count_below_1_returns_422(self):
        # Pydantic ge=1, mirroring the interval_count bound above.
        self.post('/api/recurring-transactions', self._payload(upfront_count=0), **self.auth_headers())
        self.assertStatus(422)

    def test_create_invalid_interval_kind_returns_422(self):
        self.post('/api/recurring-transactions', self._payload(interval_kind='yearly'), **self.auth_headers())
        self.assertStatus(422)

    def test_create_empty_name_returns_422(self):
        self.post('/api/recurring-transactions', self._payload(name=''), **self.auth_headers())
        self.assertStatus(422)

    def test_viewer_cannot_create_returns_403(self):
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        # post returns {} on 403, so only the status is assertable.
        self.post('/api/recurring-transactions', self._payload(), **self.auth_headers())
        self.assertStatus(403)


class TestUpdateRecurring(RecurringApiTestCase):
    def test_update_returns_200_with_updated_fields(self):
        data = self.put(
            f'/api/recurring-transactions/{self.rule.id}',
            self._payload(name='Updated Rent', amount='1300.00'),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Updated Rent')
        self.assertEqual(data['amount'], '1300.00')
        self.assertEqual(data['currency_code'], 'PLN')

    def test_update_pauses_via_is_active_false(self):
        data = self.put(
            f'/api/recurring-transactions/{self.rule.id}',
            self._payload(is_active=False),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertFalse(data['is_active'])
        self.rule.refresh_from_db()
        self.assertFalse(self.rule.is_active)

    def test_update_omitted_is_active_reactivates_paused_rule(self):
        self.rule.is_active = False
        self.rule.save()
        # Full-replace semantics: an absent is_active takes the schema default True.
        data = self.put(
            f'/api/recurring-transactions/{self.rule.id}',
            self._payload(name='Resumed'),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertTrue(data['is_active'])
        self.rule.refresh_from_db()
        self.assertTrue(self.rule.is_active)

    def test_update_missing_rule_returns_404(self):
        data = self.put('/api/recurring-transactions/99999', self._payload(), **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(data['code'], 'not_found')

    def test_update_foreign_workspace_rule_returns_404(self):
        foreign = RecurringTransactionFactory()
        self.put(f'/api/recurring-transactions/{foreign.id}', self._payload(), **self.auth_headers())
        self.assertStatus(404)
        self.assertTrue(RecurringTransaction.objects.filter(id=foreign.id).exists())

    def test_update_with_adopt_planned_id_returns_400(self):
        data = self.put(
            f'/api/recurring-transactions/{self.rule.id}',
            self._payload(adopt_planned_id=123),
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(data['code'], 'adopt_not_allowed')

    def test_update_end_date_before_start_returns_400(self):
        data = self.put(
            f'/api/recurring-transactions/{self.rule.id}',
            self._payload(end_date=(self.today + timedelta(days=29)).isoformat()),
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(data['code'], 'invalid_date_range')

    def test_update_materialize_all_true_sync_generates_to_end_date(self):
        # Base rule is factory-created (pointer None, zero rows); one
        # full-replace PUT toggles materialize_all on with a bounded end.
        data = self.put(
            f'/api/recurring-transactions/{self.rule.id}',
            self._payload(
                interval_kind='daily',
                materialize_all=True,
                end_date=(self.today + timedelta(days=35)).isoformat(),
            ),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertTrue(data['materialize_all'])
        rows = PlannedTransaction.objects.filter(recurring=self.rule)
        self.assertEqual(rows.count(), 6)
        self.assertEqual(
            {r.planned_date for r in rows},
            {self.today + timedelta(days=k) for k in range(30, 36)},
        )
        # Pre-generation wire fact on the update path too: the instance
        # serialized was annotated/fetched before sync-generation ran.
        self.rule.refresh_from_db()
        self.assertEqual(self.rule.last_generated_date, self.today + timedelta(days=35))
        self.assertIsNone(data['last_generated_date'])
        self.assertEqual(data['pending_planned_count'], 0)

    def test_update_extending_end_date_tops_up_new_occurrences_sync(self):
        # Only occurrences PAST the pointer materialize on the second PUT
        # (pointer idempotency through the API).
        first = self._payload(
            interval_kind='daily', materialize_all=True, end_date=(self.today + timedelta(days=32)).isoformat()
        )
        self.put(f'/api/recurring-transactions/{self.rule.id}', first, **self.auth_headers())
        self.assertEqual(PlannedTransaction.objects.filter(recurring=self.rule).count(), 3)  # +30..+32

        second = self._payload(
            interval_kind='daily', materialize_all=True, end_date=(self.today + timedelta(days=34)).isoformat()
        )
        self.put(f'/api/recurring-transactions/{self.rule.id}', second, **self.auth_headers())
        self.assertStatus(200)
        rows = PlannedTransaction.objects.filter(recurring=self.rule)
        self.assertEqual(rows.count(), 5)  # +33, +34 appeared; +30..+32 not regenerated
        self.assertEqual(
            {r.planned_date for r in rows},
            {self.today + timedelta(days=k) for k in range(30, 35)},
        )

    def test_update_materialize_all_without_end_date_returns_400(self):
        # The update-side twin of the create-side 400: update runs the same
        # _validate_materialize_all guard, and the full-replace PUT is the
        # only path that can flip a stored rule into the illegal pair.
        data = self.put(
            f'/api/recurring-transactions/{self.rule.id}',
            self._payload(materialize_all=True, end_date=None),
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(data['detail'], str(RecurringTransactionMaterializeAllWithoutEndDateError()))
        # The stored rule is unchanged - no partial write, no generation.
        self.rule.refresh_from_db()
        self.assertFalse(self.rule.materialize_all)
        self.assertEqual(PlannedTransaction.objects.filter(recurring=self.rule).count(), 0)

    def test_viewer_cannot_update_returns_403(self):
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.put(f'/api/recurring-transactions/{self.rule.id}', self._payload(), **self.auth_headers())
        self.assertStatus(403)


class TestDeleteRecurring(RecurringApiTestCase):
    def setUp(self):
        super().setUp()
        self.pending_row = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            recurring=self.rule,
            name='December rent',
            planned_date=self.today + timedelta(days=60),
            status='pending',
        )
        self.done_row = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            recurring=self.rule,
            name='November rent',
            planned_date=self.today + timedelta(days=30),
            status='done',
        )
        self.other_rule = RecurringTransactionFactory(workspace=self.workspace, account=self.account, name='Other rule')
        self.other_pending = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            recurring=self.other_rule,
            planned_date=self.today + timedelta(days=45),
            status='pending',
        )

    def test_delete_returns_204_and_removes_rule(self):
        self.delete(f'/api/recurring-transactions/{self.rule.id}', **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(RecurringTransaction.objects.filter(id=self.rule.id).exists())

    def test_delete_with_delete_pending_removes_pending_rows_only(self):
        self.delete(f'/api/recurring-transactions/{self.rule.id}?delete_pending=true', **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(PlannedTransaction.objects.filter(id=self.pending_row.id).exists())
        # Done rows are history and always survive, unlinked (FK is SET_NULL):
        self.done_row.refresh_from_db()
        self.assertEqual(self.done_row.status, 'done')
        self.assertIsNone(self.done_row.recurring_id)
        # A pending row of a DIFFERENT rule is untouched:
        self.assertTrue(PlannedTransaction.objects.filter(id=self.other_pending.id).exists())

    def test_delete_without_flag_keeps_pending_rows_unlinked(self):
        self.delete(f'/api/recurring-transactions/{self.rule.id}', **self.auth_headers())
        self.assertStatus(204)
        self.pending_row.refresh_from_db()
        self.assertEqual(self.pending_row.status, 'pending')
        self.assertIsNone(self.pending_row.recurring_id)

    def test_delete_missing_rule_returns_404(self):
        self.delete('/api/recurring-transactions/99999', **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(self.response.json()['code'], 'not_found')  # delete helper returns None

    def test_delete_foreign_workspace_rule_returns_404(self):
        foreign = RecurringTransactionFactory()
        self.delete(f'/api/recurring-transactions/{foreign.id}', **self.auth_headers())
        self.assertStatus(404)
        self.assertTrue(RecurringTransaction.objects.filter(id=foreign.id).exists())

    def test_viewer_cannot_delete_returns_403(self):
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.delete(f'/api/recurring-transactions/{self.rule.id}', **self.auth_headers())
        self.assertStatus(403)


class TestPlannedListRecurringId(RecurringApiTestCase):
    def test_planned_list_exposes_recurring_id_for_linked_row(self):
        linked = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            recurring=self.rule,
            name='Linked rent',
            planned_date=self.today + timedelta(days=60),
            status='pending',
        )
        ordinary = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='One-off payment',
            planned_date=self.today + timedelta(days=10),
            status='pending',
        )
        data = self.get('/api/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        # The planned list IS paginated - index data['items'].
        items = {item['id']: item for item in data['items']}
        self.assertEqual(items[linked.id]['recurring_id'], self.rule.id)
        self.assertIsNone(items[ordinary.id]['recurring_id'])

    def test_planned_list_recurring_id_absent_for_ordinary_rows_only(self):
        # Pins the field's presence in the response shape: every ordinary
        # row carries an explicit null rather than the key disappearing.
        PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='One-off payment',
            planned_date=self.today + timedelta(days=10),
            status='pending',
        )
        data = self.get('/api/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        self.assertTrue(data['items'])
        for item in data['items']:
            self.assertIsNone(item['recurring_id'])


class TestGenerateRecurringTaskDirect(RecurringApiTestCase):
    def setUp(self):
        super().setUp()
        # Due NOW: daily rule starting today. Factory creation does NOT
        # sync-generate (that hook lives in the service create path), so the
        # rows appear only when the task runs.
        self.due = RecurringTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='Due today',
            interval_kind='daily',
            interval_count=1,
            start_date=self.today,
        )

    def test_task_generates_due_occurrence_and_returns_count(self):
        created = generate_recurring_transactions()
        # Due rule: today's catch-up row + tomorrow's window row (N=1);
        # base setUp rule: its 1-row window (first occurrence 60 days out).
        self.assertEqual(created, 3)
        dates = list(
            PlannedTransaction.objects.filter(recurring=self.due)
            .order_by('planned_date')
            .values_list('planned_date', flat=True)
        )
        self.assertEqual(dates, [self.today, self.today + timedelta(days=1)])
        row = PlannedTransaction.objects.get(recurring=self.due, planned_date=self.today)
        self.assertEqual(row.status, 'pending')
        self.assertEqual(row.account_id, self.account.id)
        self.due.refresh_from_db()
        self.assertEqual(self.due.last_generated_date, self.today + timedelta(days=1))

    def test_task_second_run_is_noop(self):
        generate_recurring_transactions()
        created = generate_recurring_transactions()
        self.assertEqual(created, 0)
        self.assertEqual(PlannedTransaction.objects.filter(recurring=self.due).count(), 2)

    def test_task_skips_paused_rules(self):
        self.due.is_active = False
        self.due.save()
        created = generate_recurring_transactions()
        self.assertEqual(created, 1)  # only the base rule's window row; the paused rule generates nothing
        self.assertFalse(PlannedTransaction.objects.filter(recurring=self.due).exists())

    def test_task_spans_all_workspaces(self):
        # The factory's own account derives its own workspace: the beat task
        # is a system schedule with no workspace scope.
        foreign_due = RecurringTransactionFactory(name='Foreign due', interval_kind='daily', start_date=self.today)
        created = generate_recurring_transactions()
        # 2 due + 2 foreign (daily from today) + 1 base-rule window row (60 days out).
        self.assertEqual(created, 5)
        self.assertTrue(PlannedTransaction.objects.filter(recurring=foreign_due).exists())


class TestGenerateRecurringTaskDispatch(RecurringApiTestCase):
    """Delegation contract - the task is transport-only (case file 2026-05-21).

    Dependency direction is INVERTED relative to the email exemplar (there:
    service dispatches task; here: task delegates to service), so the
    "dispatch" class pins the delegation instead.
    """

    def test_task_delegates_to_generate_due(self):
        # The task imports RecurringTransactionService in its function body
        # (circular-import workaround), but patching the class attribute
        # intercepts the call regardless: the attribute lookup happens at
        # call time.
        with mock.patch.object(RecurringTransactionService, 'generate_due', return_value=7) as mock_generate:
            result = generate_recurring_transactions()
        mock_generate.assert_called_once()
        self.assertIsInstance(mock_generate.call_args.args[0], date)  # passes today, not None
        self.assertEqual(result, 7)  # returns the service's count unchanged

    def test_delay_runs_eagerly_under_always_eager(self):
        result = generate_recurring_transactions.delay()
        self.assertTrue(result.successful())
        # Base rule fills its 1-row window (first occurrence 60 days out);
        # EagerResult carries the task's return value.
        self.assertEqual(result.result, 1)


class TestGenerateRecurringBeatConfig(TestCase):
    """Beat schedule, timezone, and task registration/retry configuration.

    In-process assertions on django.conf.settings are valid under pytest
    because config/test_settings.py does `from config.settings import *` and
    CELERY_TASK_ALWAYS_EAGER is the only Celery override - nothing touching
    the schedule is import-time env-gated.
    """

    def test_beat_schedule_contains_generate_recurring_entry(self):
        self.assertIn('generate-recurring-transactions', settings.CELERY_BEAT_SCHEDULE)
        entry = settings.CELERY_BEAT_SCHEDULE['generate-recurring-transactions']
        self.assertEqual(entry['task'], 'planned_transactions.tasks.generate_recurring_transactions')
        self.assertIsInstance(entry['schedule'], crontab)

    def test_beat_schedule_runs_nightly_at_00_05(self):
        schedule = settings.CELERY_BEAT_SCHEDULE['generate-recurring-transactions']['schedule']
        self.assertEqual(schedule.minute, {5})  # celery crontab stores sets
        self.assertEqual(schedule.hour, {0})

    def test_celery_timezone_is_utc(self):
        self.assertEqual(settings.CELERY_TIMEZONE, 'UTC')

    def test_task_name_matches_schedule_entry(self):
        self.assertEqual(
            generate_recurring_transactions.name, 'planned_transactions.tasks.generate_recurring_transactions'
        )

    def test_task_retry_config(self):
        self.assertEqual(generate_recurring_transactions.max_retries, 3)
        self.assertEqual(generate_recurring_transactions.autoretry_for, (Exception,))
        self.assertTrue(generate_recurring_transactions.retry_backoff)
