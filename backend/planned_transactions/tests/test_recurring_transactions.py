"""Tests for recurring transaction rules: occurrence math, service CRUD, materialization."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest import mock

from django.db import IntegrityError
from django.db import transaction as db_transaction
from django.test import TestCase
from django.utils import timezone

from accounts.factories import AccountFactory
from budgeting.factories import BudgetFactory
from categories.factories import CategoryFactory
from common.tests.mixins import AuthMixin
from currencies.services import CurrencyCatalogService
from planned_transactions.exceptions import (
    PlannedTransactionAccountArchivedError,
    PlannedTransactionCategoryNotFoundError,
    PlannedTransactionCurrencyMismatchError,
    PlannedTransactionCurrencyRequiredError,
    PlannedTransactionNotFoundError,
    RecurringTransactionAdoptAlreadyLinkedError,
    RecurringTransactionAdoptNotAllowedError,
    RecurringTransactionAdoptNotPendingError,
    RecurringTransactionEndDateError,
    RecurringTransactionMaterializeAllLimitError,
    RecurringTransactionMaterializeAllWithoutEndDateError,
)
from planned_transactions.factories import PlannedTransactionFactory, RecurringTransactionFactory
from planned_transactions.models import PlannedTransaction, RecurringTransaction
from planned_transactions.schemas import RecurringTransactionCreate
from planned_transactions.services import RecurringTransactionService
from workspaces.factories import WorkspaceFactory


class RecurringRuleTestCase(AuthMixin, TestCase):
    """Base: one PLN workspace with accounts, budget, and a category."""

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        self.account = AccountFactory(workspace=self.workspace, name='Main')
        self.budget = BudgetFactory(workspace=self.workspace)
        self.rent = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Rent')

    def _rule(self, **overrides) -> RecurringTransaction:
        """Create a rule in this workspace via the factory (no service call, no sync-generate)."""
        kwargs = {
            'workspace': self.workspace,
            'account': self.account,
            'created_by': self.user,
            'name': 'Rent rule',
        }
        kwargs.update(overrides)
        return RecurringTransactionFactory(**kwargs)

    def _payload(self, **overrides) -> RecurringTransactionCreate:
        """Build the create/update schema; start_date defaults to a far-future date so the
        sync-generate at the end of service create() materializes exactly one row (the
        default N=1 window's first occurrence, at 2027-06-01) unless a test deliberately
        overrides it."""
        payload = {
            'name': 'Rent rule',
            'amount': Decimal('1200.00'),
            'account_id': self.account.id,
            'interval_kind': 'monthly',
            'interval_count': 1,
            'start_date': date(2027, 6, 1),
        }
        payload.update(overrides)
        return RecurringTransactionCreate(**payload)

    def _freeze_created_at(self, rule: RecurringTransaction, when: datetime) -> None:
        """Pin created_at: auto_now_add ignores factory kwargs, so write it via queryset
        .update() (bypasses pre_save and the save() workspace guard)."""
        RecurringTransaction.objects.filter(id=rule.id).update(created_at=when)
        rule.refresh_from_db()


class TestOccurrenceMathMonthly(RecurringRuleTestCase):
    """Model-level monthly stepping: day clamping, day re-anchoring, year boundaries."""

    def test_monthly_day_31_clamps_to_february_28(self):
        rule = self._rule(start_date=date(2026, 1, 31))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 2, 1)), date(2026, 2, 28))

    def test_monthly_day_31_clamps_to_feb_29_in_leap_year(self):
        rule = self._rule(start_date=date(2028, 1, 31))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2028, 2, 1)), date(2028, 2, 29))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2028, 3, 1)), date(2028, 3, 31))

    def test_monthly_reanchors_to_day_31_after_short_month(self):
        rule = self._rule(start_date=date(2026, 1, 31))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 3, 1)), date(2026, 3, 31))
        # The day re-anchors to start_date.day (31), NOT the clamped 28 from February.
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 4, 1)), date(2026, 4, 30))

    def test_monthly_steps_across_year_boundary(self):
        rule = self._rule(start_date=date(2026, 12, 15))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 12, 16)), date(2027, 1, 15))

    def test_monthly_interval_count_2_skips_a_month(self):
        rule = self._rule(start_date=date(2026, 11, 30), interval_count=2)
        # Month arithmetic (Nov + 2 = Jan), NOT +60 days: 2026-12-30 would be wrong.
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 12, 1)), date(2027, 1, 30))
        # February is skipped entirely, not collapsed into.
        self.assertEqual(rule.next_occurrence_on_or_after(date(2027, 2, 1)), date(2027, 3, 30))


class TestOccurrenceMathWeeklyDaily(RecurringRuleTestCase):
    """Model-level weekly/daily stepping: fixed-day arithmetic via timedelta."""

    def test_weekly_preserves_weekday(self):
        rule = self._rule(interval_kind='weekly', start_date=date(2026, 10, 5))  # a Monday
        self.assertEqual(rule.start_date.weekday(), 0)
        nxt = rule.next_occurrence_on_or_after(date(2026, 10, 6))
        self.assertEqual(nxt, date(2026, 10, 12))
        self.assertEqual(nxt.weekday(), 0)
        nxt = rule.next_occurrence_on_or_after(date(2026, 10, 13))
        self.assertEqual(nxt, date(2026, 10, 19))
        self.assertEqual(nxt.weekday(), 0)

    def test_weekly_interval_count_2_adds_14_days(self):
        rule = self._rule(interval_kind='weekly', interval_count=2, start_date=date(2026, 10, 5))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 10, 6)), date(2026, 10, 19))

    def test_daily_interval_count_1_every_day(self):
        rule = self._rule(interval_kind='daily', start_date=date(2026, 10, 1))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 10, 2)), date(2026, 10, 2))

    def test_daily_interval_count_3_adds_3_days(self):
        rule = self._rule(interval_kind='daily', interval_count=3, start_date=date(2026, 10, 1))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 10, 2)), date(2026, 10, 4))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 10, 5)), date(2026, 10, 7))


class TestNextOccurrenceOnOrAfterSemantics(RecurringRuleTestCase):
    """The inclusive lower bound: first occurrence ON or after the target, never before it."""

    def test_returns_occurrence_equal_to_target(self):
        rule = self._rule(start_date=date(2026, 1, 31))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 3, 31)), date(2026, 3, 31))

    def test_returns_first_on_or_after_never_before(self):
        rule = self._rule(start_date=date(2026, 1, 31))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 3, 15)), date(2026, 3, 31))

    def test_target_before_start_returns_start_date(self):
        rule = self._rule(start_date=date(2026, 1, 31))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2025, 6, 1)), date(2026, 1, 31))
        self.assertEqual(rule.next_occurrence_on_or_after(date(2026, 1, 31)), date(2026, 1, 31))


class TestNextOccurrenceDateProperty(RecurringRuleTestCase):
    """The read-side next_occurrence_date property (the derivation the generator seeds from)."""

    def test_never_generated_returns_first_occurrence_on_or_after_start(self):
        rule = self._rule(start_date=date(2026, 1, 31))
        self.assertEqual(rule.next_occurrence_date, date(2026, 1, 31))

    def test_advances_past_pointer(self):
        rule = self._rule(start_date=date(2026, 1, 31), last_generated_date=date(2026, 1, 31))
        self.assertEqual(rule.next_occurrence_date, date(2026, 2, 28))
        rule.last_generated_date = date(2026, 2, 28)
        self.assertEqual(rule.next_occurrence_date, date(2026, 3, 31))

    def test_paused_returns_none(self):
        rule = self._rule(start_date=date(2026, 1, 31), is_active=False)
        self.assertIsNone(rule.next_occurrence_date)

    def test_ended_returns_none(self):
        rule = self._rule(
            start_date=date(2026, 1, 31), end_date=date(2026, 3, 31), last_generated_date=date(2026, 3, 31)
        )
        self.assertIsNone(rule.next_occurrence_date)  # next candidate 2026-04-30 exceeds end


class TestCreateRuleValidation(RecurringRuleTestCase):
    """Service create(): resolver and end-date guards fire before any INSERT."""

    def test_archived_account_rejected(self):
        archived = AccountFactory(workspace=self.workspace, is_archived=True)
        with self.assertRaises(PlannedTransactionAccountArchivedError):
            RecurringTransactionService.create(
                user=self.user, workspace_id=self.workspace.id, data=self._payload(account_id=archived.id)
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_currency_mismatch_with_account_rejected(self):
        with self.assertRaises(PlannedTransactionCurrencyMismatchError):
            RecurringTransactionService.create(
                user=self.user, workspace_id=self.workspace.id, data=self._payload(currency_code='USD')
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_currency_required_when_accountless_rejected(self):
        with self.assertRaises(PlannedTransactionCurrencyRequiredError):
            RecurringTransactionService.create(
                user=self.user,
                workspace_id=self.workspace.id,
                data=self._payload(account_id=None, currency_code=None),
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_accountless_with_enabled_currency_created(self):
        rule = RecurringTransactionService.create(
            user=self.user,
            workspace_id=self.workspace.id,
            data=self._payload(account_id=None, currency_code='USD'),
        )
        self.assertIsNone(rule.account)
        self.assertEqual(rule.currency.code, 'USD')
        self.assertIsNone(rule.last_generated_date)  # pre-generation wire shape (no re-fetch)
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2027, 6, 1))  # default 2027 start: window 1 filled

    def test_unknown_category_rejected(self):
        with self.assertRaises(PlannedTransactionCategoryNotFoundError):
            RecurringTransactionService.create(
                user=self.user, workspace_id=self.workspace.id, data=self._payload(category_id=999999)
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_archived_category_rejected(self):
        self.rent.is_archived = True
        self.rent.save()
        # Archived and missing raise the same class - the resolver's contract.
        with self.assertRaises(PlannedTransactionCategoryNotFoundError):
            RecurringTransactionService.create(
                user=self.user, workspace_id=self.workspace.id, data=self._payload(category_id=self.rent.id)
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_cross_workspace_category_rejected(self):
        other = WorkspaceFactory()
        other_budget = BudgetFactory(workspace=other)
        foreign = CategoryFactory(budget=other_budget, workspace=other)
        with self.assertRaises(PlannedTransactionCategoryNotFoundError):
            RecurringTransactionService.create(
                user=self.user, workspace_id=self.workspace.id, data=self._payload(category_id=foreign.id)
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_end_date_before_start_date_rejected(self):
        with self.assertRaises(RecurringTransactionEndDateError):
            RecurringTransactionService.create(
                user=self.user,
                workspace_id=self.workspace.id,
                data=self._payload(start_date=date(2027, 6, 1), end_date=date(2027, 5, 31)),
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_end_date_equal_to_start_date_allowed(self):
        rule = RecurringTransactionService.create(
            user=self.user, workspace_id=self.workspace.id, data=self._payload(end_date=date(2027, 6, 1))
        )
        self.assertEqual(rule.end_date, date(2027, 6, 1))  # boundary is "on or after"
        self.assertEqual(RecurringTransaction.objects.count(), 1)


class TestAdoptPlannedTransaction(RecurringRuleTestCase):
    """The adopt mechanic: a pending planned row becomes a rule's first occurrence, no duplicate."""

    def test_adopt_links_row_and_advances_pointer(self):
        source = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='Rent plan',
            amount=Decimal('1200.00'),
            planned_date=date(2027, 1, 5),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )
        rule = RecurringTransactionService.create(
            user=self.user,
            workspace_id=self.workspace.id,
            data=self._payload(start_date=date(2027, 1, 5), adopt_planned_id=source.id),
        )
        source.refresh_from_db()
        self.assertEqual(source.recurring_id, rule.id)  # linked, not duplicated
        self.assertEqual(rule.last_generated_date, date(2027, 1, 5))  # pointer at its date
        self.assertEqual(  # exactly one row for the rule
            PlannedTransaction.objects.filter(recurring=rule).count(), 1
        )

    def test_adopt_non_pending_source_rejected(self):
        source = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            planned_date=date(2027, 1, 5),
            status='done',
            created_by=self.user,
            updated_by=self.user,
        )
        with self.assertRaises(RecurringTransactionAdoptNotPendingError):
            RecurringTransactionService.create(
                user=self.user,
                workspace_id=self.workspace.id,
                data=self._payload(start_date=date(2027, 1, 5), adopt_planned_id=source.id),
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_adopt_already_linked_source_rejected(self):
        existing = self._rule()
        source = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            planned_date=date(2027, 1, 5),
            status='pending',
            recurring=existing,
            created_by=self.user,
            updated_by=self.user,
        )
        with self.assertRaises(RecurringTransactionAdoptAlreadyLinkedError):
            RecurringTransactionService.create(
                user=self.user,
                workspace_id=self.workspace.id,
                data=self._payload(start_date=date(2027, 1, 5), adopt_planned_id=source.id),
            )
        self.assertEqual(RecurringTransaction.objects.count(), 1)  # no SECOND rule created

    def test_adopt_cross_workspace_source_rejected(self):
        # Default SubFactory path: the row builds its own workspace and account.
        foreign = PlannedTransactionFactory()
        with self.assertRaises(PlannedTransactionNotFoundError):
            RecurringTransactionService.create(
                user=self.user,
                workspace_id=self.workspace.id,
                data=self._payload(start_date=date(2027, 1, 5), adopt_planned_id=foreign.id),
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_adopt_unknown_source_rejected(self):
        with self.assertRaises(PlannedTransactionNotFoundError):
            RecurringTransactionService.create(
                user=self.user,
                workspace_id=self.workspace.id,
                data=self._payload(start_date=date(2027, 1, 5), adopt_planned_id=999999),
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_update_rejects_adopt_planned_id(self):
        rule = RecurringTransactionService.create(user=self.user, workspace_id=self.workspace.id, data=self._payload())
        pending = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            planned_date=date(2027, 3, 10),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )
        with self.assertRaises(RecurringTransactionAdoptNotAllowedError):
            RecurringTransactionService.update(
                user=self.user,
                workspace_id=self.workspace.id,
                rule_id=rule.id,
                data=self._payload(adopt_planned_id=pending.id),
            )


class TestCreateSyncGeneratesFirstOccurrence(RecurringRuleTestCase):
    """create() materializes inline (plan decision 8): catch-up plus window fill.

    Dates are clock-RELATIVE so the real timezone.now().date() inside
    create() is deterministic. With the default N=1 the run is exactly two
    rows: today's due occurrence (catch-up, unconditional) plus tomorrow's
    window row - "the next row appears on the previous occurrence's due
    date". A due row NEVER counts toward the window (only planned_date >
    today does).
    """

    def test_first_due_occurrence_materializes_inline(self):
        today = timezone.now().date()
        rule = RecurringTransactionService.create(
            user=self.user,
            workspace_id=self.workspace.id,
            data=self._payload(
                interval_kind='daily',
                interval_count=1,
                start_date=today - timedelta(days=10),
            ),
        )
        dates = list(
            PlannedTransaction.objects.filter(recurring=rule)
            .order_by('planned_date')
            .values_list('planned_date', flat=True)
        )
        self.assertEqual(dates, [today, today + timedelta(days=1)])
        row = PlannedTransaction.objects.get(recurring=rule, planned_date=today)
        self.assertEqual(row.status, 'pending')
        self.assertEqual(row.name, rule.name)
        self.assertEqual(row.amount, rule.amount)
        self.assertEqual(row.account_id, rule.account_id)
        self.assertEqual(row.currency_id, rule.currency_id)
        self.assertEqual(row.created_by, rule.created_by)
        # Wire fact: the response instance is pre-generation (no re-fetch).
        self.assertIsNone(rule.last_generated_date)
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, today + timedelta(days=1))

    def test_create_fills_window_to_upfront_count_inline(self):
        first = timezone.now().date() + timedelta(days=10)
        rule = RecurringTransactionService.create(
            user=self.user,
            workspace_id=self.workspace.id,
            data=self._payload(
                interval_kind='daily',
                interval_count=1,
                start_date=first,
                upfront_count=3,
            ),
        )
        dates = list(
            PlannedTransaction.objects.filter(recurring=rule)
            .order_by('planned_date')
            .values_list('planned_date', flat=True)
        )
        self.assertEqual(dates, [first, first + timedelta(days=1), first + timedelta(days=2)])
        self.assertIsNone(rule.last_generated_date)  # pre-generation wire shape
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, first + timedelta(days=2))

    def test_rule_created_paused_generates_nothing(self):
        today = timezone.now().date()
        rule = RecurringTransactionService.create(
            user=self.user,
            workspace_id=self.workspace.id,
            data=self._payload(
                interval_kind='daily',
                interval_count=1,
                start_date=today - timedelta(days=10),
                is_active=False,
            ),
        )
        self.assertEqual(PlannedTransaction.objects.filter(recurring=rule).count(), 0)
        rule.refresh_from_db()
        self.assertIsNone(rule.last_generated_date)  # locked is_active re-check covers paused-on-create


class TestGenerateDue(RecurringRuleTestCase):
    """The window materialization engine (generate_due / _generate_for_rule).

    Rules come from the factory (never the service - no accidental
    sync-generate path), created_at is pinned via queryset update, and every
    run passes an explicit today. The invariant under test: after a run, a
    non-materialize_all rule holds exactly upfront_count PENDING rows with
    planned_date > today (plus every already-due row, caught up).
    """

    def test_first_run_fills_window_to_upfront_count(self):
        rule = self._rule(interval_kind='daily', interval_count=1, start_date=date(2026, 2, 1), upfront_count=3)
        self._freeze_created_at(rule, timezone.make_aware(datetime(2026, 1, 15, 12, 0)))
        created = RecurringTransactionService.generate_due(today=date(2026, 1, 20))
        self.assertEqual(created, 3)
        dates = list(
            PlannedTransaction.objects.filter(recurring=rule)
            .order_by('planned_date')
            .values_list('planned_date', flat=True)
        )
        self.assertEqual(dates, [date(2026, 2, 1), date(2026, 2, 2), date(2026, 2, 3)])
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2026, 2, 3))

    def test_deadline_day_tops_up_window(self):
        rule = self._rule(interval_kind='daily', interval_count=1, start_date=date(2026, 2, 1), upfront_count=3)
        self._freeze_created_at(rule, timezone.make_aware(datetime(2026, 1, 15, 12, 0)))
        RecurringTransactionService.generate_due(today=date(2026, 1, 20))  # Feb 1-3
        # Feb 1 comes due: it no longer counts (> today fails), the window
        # has room again, and Feb 4 appears - always 3 pending future rows.
        created = RecurringTransactionService.generate_due(today=date(2026, 2, 1))
        self.assertEqual(created, 1)
        dates = list(
            PlannedTransaction.objects.filter(recurring=rule)
            .order_by('planned_date')
            .values_list('planned_date', flat=True)
        )
        self.assertEqual(dates, [date(2026, 2, d) for d in range(1, 5)])

    def test_early_paid_row_frees_its_window_slot(self):
        rule = self._rule(interval_kind='daily', interval_count=1, start_date=date(2026, 2, 1), upfront_count=3)
        self._freeze_created_at(rule, timezone.make_aware(datetime(2026, 1, 15, 12, 0)))
        RecurringTransactionService.generate_due(today=date(2026, 1, 20))  # Feb 1-3
        # Paid early: the row is done, no longer pending - only PENDING rows
        # hold window slots, so the next occurrence tops the window up.
        PlannedTransaction.objects.filter(recurring=rule, planned_date=date(2026, 2, 2)).update(status='done')
        created = RecurringTransactionService.generate_due(today=date(2026, 1, 20))
        self.assertEqual(created, 1)
        pending = set(
            PlannedTransaction.objects.filter(recurring=rule, status='pending').values_list('planned_date', flat=True)
        )
        self.assertEqual(pending, {date(2026, 2, 1), date(2026, 2, 3), date(2026, 2, 4)})

    def test_cancelled_future_row_frees_its_window_slot(self):
        rule = self._rule(interval_kind='daily', interval_count=1, start_date=date(2026, 2, 1), upfront_count=3)
        self._freeze_created_at(rule, timezone.make_aware(datetime(2026, 1, 15, 12, 0)))
        RecurringTransactionService.generate_due(today=date(2026, 1, 20))  # Feb 1-3
        PlannedTransaction.objects.filter(recurring=rule, planned_date=date(2026, 2, 3)).update(status='cancelled')
        created = RecurringTransactionService.generate_due(today=date(2026, 1, 20))
        self.assertEqual(created, 1)
        pending = set(
            PlannedTransaction.objects.filter(recurring=rule, status='pending').values_list('planned_date', flat=True)
        )
        self.assertEqual(pending, {date(2026, 2, 1), date(2026, 2, 2), date(2026, 2, 4)})

    def test_full_window_generates_nothing(self):
        rule = self._rule(interval_kind='daily', interval_count=1, start_date=date(2026, 2, 1), upfront_count=3)
        self._freeze_created_at(rule, timezone.make_aware(datetime(2026, 1, 15, 12, 0)))
        RecurringTransactionService.generate_due(today=date(2026, 1, 20))  # window full: Feb 1-3
        created = RecurringTransactionService.generate_due(today=date(2026, 1, 21))
        self.assertEqual(created, 0)
        self.assertEqual(PlannedTransaction.objects.filter(recurring=rule).count(), 3)
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2026, 2, 3))  # pointer unmoved

    def test_run_twice_same_day_creates_no_duplicates(self):
        rule = self._rule(interval_kind='daily', interval_count=1, start_date=date(2026, 1, 1), upfront_count=2)
        self._freeze_created_at(rule, timezone.make_aware(datetime(2025, 12, 1, 12, 0)))
        # Jan 1-5 are due (catch-up) and Jan 6-7 fill the window of 2.
        self.assertEqual(RecurringTransactionService.generate_due(today=date(2026, 1, 5)), 7)
        self.assertEqual(RecurringTransactionService.generate_due(today=date(2026, 1, 5)), 0)
        self.assertEqual(PlannedTransaction.objects.filter(recurring=rule).count(), 7)
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2026, 1, 7))

    def test_catch_up_after_downtime_generates_all_passed_occurrences(self):
        rule = self._rule(interval_kind='daily', interval_count=1, start_date=date(2026, 1, 1), upfront_count=2)
        self._freeze_created_at(rule, timezone.make_aware(datetime(2025, 12, 1, 12, 0)))
        created = RecurringTransactionService.generate_due(today=date(2026, 1, 5))
        self.assertEqual(created, 7)  # 5 due rows + 2 window rows
        dates = list(
            PlannedTransaction.objects.filter(recurring=rule)
            .order_by('planned_date')
            .values_list('planned_date', flat=True)
        )
        self.assertEqual(dates, [date(2026, 1, d) for d in range(1, 8)])  # no gaps

    def test_never_backfills_before_created_at(self):
        rule = self._rule(interval_kind='monthly', interval_count=1, start_date=date(2026, 1, 31))
        self._freeze_created_at(rule, timezone.make_aware(datetime(2026, 6, 15, 12, 0)))
        created = RecurringTransactionService.generate_due(today=date(2026, 10, 21))
        # Jun-Sep 30 are due catch-up rows; Oct 31 fills the default 1-row
        # window even though the old lead window would have kept it closed.
        self.assertEqual(created, 5)
        self.assertEqual(
            list(
                PlannedTransaction.objects.filter(recurring=rule)
                .order_by('planned_date')
                .values_list('planned_date', flat=True)
            ),
            [date(2026, 6, 30), date(2026, 7, 31), date(2026, 8, 31), date(2026, 9, 30), date(2026, 10, 31)],
        )
        # Seed bound: max(start, created_at.date()) = 2026-06-15, so Jan-May never generate.
        self.assertFalse(PlannedTransaction.objects.filter(recurring=rule, planned_date__lt=date(2026, 6, 1)).exists())

    def test_pointer_predating_created_at_skips_forward(self):
        rule = self._rule(
            interval_kind='monthly',
            interval_count=1,
            start_date=date(2026, 1, 31),
            last_generated_date=date(2026, 3, 31),  # adopt/GDPR-restore style pointer
        )
        self._freeze_created_at(rule, timezone.make_aware(datetime(2026, 6, 15, 12, 0)))
        created = RecurringTransactionService.generate_due(today=date(2026, 8, 10))
        # April 30 and May 31 predate created_at, so the loop SKIPS (no break, no rows)...
        # ...Jun 30 and Jul 31 are due catch-up rows, and Aug 31 fills the window.
        self.assertEqual(created, 3)
        self.assertEqual(
            list(
                PlannedTransaction.objects.filter(recurring=rule)
                .order_by('planned_date')
                .values_list('planned_date', flat=True)
            ),
            [date(2026, 6, 30), date(2026, 7, 31), date(2026, 8, 31)],
        )
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2026, 8, 31))

    def test_end_date_stops_generation_before_window_fills(self):
        rule = self._rule(
            interval_kind='monthly',
            interval_count=1,
            start_date=date(2026, 1, 31),
            end_date=date(2026, 3, 31),
            upfront_count=5,  # window wider than the rule's whole life
        )
        self._freeze_created_at(rule, timezone.make_aware(datetime(2025, 12, 1, 12, 0)))
        created = RecurringTransactionService.generate_due(today=date(2026, 12, 31))
        self.assertEqual(created, 3)  # D == end_date generates; D > end breaks
        self.assertEqual(
            list(
                PlannedTransaction.objects.filter(recurring=rule)
                .order_by('planned_date')
                .values_list('planned_date', flat=True)
            ),
            [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31)],
        )
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2026, 3, 31))

    def test_paused_rule_skipped(self):
        rule = self._rule(interval_kind='monthly', interval_count=1, start_date=date(2026, 1, 31), is_active=False)
        self._freeze_created_at(rule, timezone.make_aware(datetime(2025, 12, 1, 12, 0)))
        created = RecurringTransactionService.generate_due(today=date(2026, 6, 30))
        self.assertEqual(created, 0)
        self.assertEqual(PlannedTransaction.objects.filter(recurring=rule).count(), 0)
        rule.refresh_from_db()
        self.assertIsNone(rule.last_generated_date)  # the is_active scan never reaches the lock

    def test_race_loss_on_due_occurrence_advances_pointer_without_duplicate(self):
        rule = self._rule(
            interval_kind='monthly',
            interval_count=1,
            start_date=date(2026, 1, 31),
            last_generated_date=date(2026, 1, 31),
        )
        self._freeze_created_at(rule, timezone.make_aware(datetime(2025, 12, 1, 12, 0)))
        # The race winner: another generator already created the 2026-02-28
        # occurrence. It lives in the test's outer transaction, so it survives
        # the savepoint rollback that create_from_recurring's IntegrityError
        # triggers. Feb 28 <= today, so the loss consumes no window slot.
        PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='Race winner',
            amount=Decimal('100.00'),
            planned_date=date(2026, 2, 28),
            status='pending',
            recurring=rule,
        )
        created = RecurringTransactionService.generate_due(today=date(2026, 4, 10))
        # Feb 28 lost the race (None); Mar 31 catches up; Apr 30 fills window 1.
        self.assertEqual(created, 2)
        self.assertEqual(
            list(
                PlannedTransaction.objects.filter(recurring=rule)
                .order_by('planned_date')
                .values_list('planned_date', flat=True)
            ),
            [date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)],  # no duplicate
        )
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2026, 4, 30))  # pointer advanced past the loss

    def test_race_loss_on_future_occurrence_consumes_window_slot(self):
        rule = self._rule(
            interval_kind='monthly',
            interval_count=1,
            start_date=date(2026, 1, 31),
            upfront_count=2,
            last_generated_date=date(2026, 1, 31),
        )
        self._freeze_created_at(rule, timezone.make_aware(datetime(2025, 12, 1, 12, 0)))
        # A FUTURE winner: pending Feb 28 > today, so future_pending starts
        # at 1 of the 2 allowed slots.
        PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='Race winner',
            amount=Decimal('100.00'),
            planned_date=date(2026, 2, 28),
            status='pending',
            recurring=rule,
        )
        created = RecurringTransactionService.generate_due(today=date(2026, 2, 10))
        # Feb 28 loses the race but the row exists either way: the slot is
        # consumed (future_pending -> 2) and the window is full - Mar 31
        # never generates.
        self.assertEqual(created, 0)
        self.assertEqual(
            list(PlannedTransaction.objects.filter(recurring=rule).values_list('planned_date', flat=True)),
            [date(2026, 2, 28)],  # no duplicate, no top-up
        )
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2026, 2, 28))  # pointer advanced past the loss


class TestMaterializeAllValidation(RecurringRuleTestCase):
    """The materialize_all guards fire before any INSERT/save (task 1 exceptions)."""

    def test_create_materialize_all_without_end_date_rejected(self):
        with self.assertRaises(RecurringTransactionMaterializeAllWithoutEndDateError):
            RecurringTransactionService.create(
                user=self.user,
                workspace_id=self.workspace.id,
                data=self._payload(materialize_all=True),
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_update_materialize_all_without_end_date_rejected(self):
        rule = self._rule()
        with self.assertRaises(RecurringTransactionMaterializeAllWithoutEndDateError):
            RecurringTransactionService.update(
                user=self.user,
                workspace_id=self.workspace.id,
                rule_id=rule.id,
                data=self._payload(materialize_all=True),
            )
        rule.refresh_from_db()
        self.assertFalse(rule.materialize_all)  # rejected before any mutation

    def test_create_materialize_all_over_cap_rejected(self):
        # Daily 2027-01-01 through 2028-12-31 = 731 occurrences > 500.
        with self.assertRaises(RecurringTransactionMaterializeAllLimitError):
            RecurringTransactionService.create(
                user=self.user,
                workspace_id=self.workspace.id,
                data=self._payload(
                    interval_kind='daily',
                    interval_count=1,
                    start_date=date(2027, 1, 1),
                    end_date=date(2028, 12, 31),
                    materialize_all=True,
                ),
            )
        self.assertEqual(RecurringTransaction.objects.count(), 0)

    def test_update_materialize_all_over_cap_rejected(self):
        rule = self._rule()
        with self.assertRaises(RecurringTransactionMaterializeAllLimitError):
            RecurringTransactionService.update(
                user=self.user,
                workspace_id=self.workspace.id,
                rule_id=rule.id,
                data=self._payload(
                    interval_kind='daily',
                    interval_count=1,
                    start_date=date(2027, 1, 1),
                    end_date=date(2028, 12, 31),
                    materialize_all=True,
                ),
            )
        rule.refresh_from_db()
        self.assertFalse(rule.materialize_all)

    def test_create_materialize_all_within_cap_generates_everything(self):
        rule = RecurringTransactionService.create(
            user=self.user,
            workspace_id=self.workspace.id,
            data=self._payload(
                interval_kind='daily',
                interval_count=1,
                start_date=date(2027, 1, 1),
                end_date=date(2027, 1, 5),
                materialize_all=True,
            ),
        )
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2027, 1, 5))  # everything to end_date
        self.assertEqual(PlannedTransaction.objects.filter(recurring=rule).count(), 5)

    def test_upfront_count_bounds_enforced_by_db_constraint(self):
        # The schema (Field ge=1 le=24) is the API guard; the model check
        # constraint recurring_upfront_count_range is the DB-level one.
        for bad in (0, 25):
            with self.assertRaises(IntegrityError):
                with db_transaction.atomic():
                    self._rule(upfront_count=bad)
        self.assertEqual(RecurringTransaction.objects.count(), 0)


class TestUpdateSyncGenerates(RecurringRuleTestCase):
    """update() re-runs generation after the save (the same call create makes).

    The wire response stays PRE-generation (pointer as of the save) - the
    generator ran on its own locked re-fetch and no re-fetch is added.
    """

    @staticmethod
    def _frozen_now(year, month, day):
        return timezone.make_aware(datetime(year, month, day, 9, 0))

    def test_raising_upfront_count_fills_window_to_new_n(self):
        rule = self._rule(interval_kind='daily', interval_count=1, start_date=date(2026, 2, 1), upfront_count=1)
        self._freeze_created_at(rule, self._frozen_now(2026, 1, 15))
        RecurringTransactionService.generate_due(today=date(2026, 1, 20))  # window 1: Feb 1
        with mock.patch('django.utils.timezone.now', return_value=self._frozen_now(2026, 1, 21)):
            updated = RecurringTransactionService.update(
                user=self.user,
                workspace_id=self.workspace.id,
                rule_id=rule.id,
                data=self._payload(
                    interval_kind='daily', interval_count=1, start_date=date(2026, 2, 1), upfront_count=3
                ),
            )
        self.assertEqual(updated.last_generated_date, date(2026, 2, 1))  # pre-generation wire shape
        rule.refresh_from_db()
        self.assertEqual(rule.upfront_count, 3)
        self.assertEqual(rule.last_generated_date, date(2026, 2, 3))
        self.assertEqual(
            list(
                PlannedTransaction.objects.filter(recurring=rule)
                .order_by('planned_date')
                .values_list('planned_date', flat=True)
            ),
            [date(2026, 2, 1), date(2026, 2, 2), date(2026, 2, 3)],
        )

    def test_toggling_materialize_all_generates_all_remaining(self):
        rule = self._rule(
            interval_kind='daily',
            interval_count=1,
            start_date=date(2026, 2, 1),
            upfront_count=2,
            end_date=date(2026, 2, 5),
        )
        self._freeze_created_at(rule, self._frozen_now(2026, 1, 15))
        RecurringTransactionService.generate_due(today=date(2026, 1, 20))  # window 2: Feb 1-2
        with mock.patch('django.utils.timezone.now', return_value=self._frozen_now(2026, 1, 21)):
            RecurringTransactionService.update(
                user=self.user,
                workspace_id=self.workspace.id,
                rule_id=rule.id,
                data=self._payload(
                    interval_kind='daily',
                    interval_count=1,
                    start_date=date(2026, 2, 1),
                    end_date=date(2026, 2, 5),
                    upfront_count=2,
                    materialize_all=True,
                ),
            )
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2026, 2, 5))
        self.assertEqual(
            list(
                PlannedTransaction.objects.filter(recurring=rule)
                .order_by('planned_date')
                .values_list('planned_date', flat=True)
            ),
            [date(2026, 2, d) for d in range(1, 6)],  # everything to end_date
        )

    def test_extending_end_date_tops_up_materialize_all(self):
        rule = self._rule(
            interval_kind='daily',
            interval_count=1,
            start_date=date(2026, 2, 1),
            materialize_all=True,
            end_date=date(2026, 2, 3),
        )
        self._freeze_created_at(rule, self._frozen_now(2026, 1, 15))
        RecurringTransactionService.generate_due(today=date(2026, 1, 20))  # all 3: Feb 1-3
        with mock.patch('django.utils.timezone.now', return_value=self._frozen_now(2026, 1, 21)):
            RecurringTransactionService.update(
                user=self.user,
                workspace_id=self.workspace.id,
                rule_id=rule.id,
                data=self._payload(
                    interval_kind='daily',
                    interval_count=1,
                    start_date=date(2026, 2, 1),
                    end_date=date(2026, 2, 5),
                    materialize_all=True,
                ),
            )
        rule.refresh_from_db()
        self.assertEqual(rule.last_generated_date, date(2026, 2, 5))
        self.assertEqual(PlannedTransaction.objects.filter(recurring=rule).count(), 5)

    def test_update_saving_paused_rule_generates_nothing(self):
        rule = self._rule(interval_kind='daily', interval_count=1, start_date=date(2026, 2, 1), upfront_count=2)
        self._freeze_created_at(rule, self._frozen_now(2026, 1, 15))
        with mock.patch('django.utils.timezone.now', return_value=self._frozen_now(2026, 1, 21)):
            RecurringTransactionService.update(
                user=self.user,
                workspace_id=self.workspace.id,
                rule_id=rule.id,
                data=self._payload(
                    interval_kind='daily',
                    interval_count=1,
                    start_date=date(2026, 2, 1),
                    upfront_count=2,
                    is_active=False,
                ),
            )
        self.assertEqual(PlannedTransaction.objects.filter(recurring=rule).count(), 0)
        rule.refresh_from_db()
        self.assertIsNone(rule.last_generated_date)  # locked is_active guard


class TestDeleteRule(RecurringRuleTestCase):
    """Rule deletion: SET_NULL survivors by default, pending rows removed only on request."""

    def setUp(self):
        super().setUp()
        self.rule = self._rule()
        for planned_date, status in [
            (date(2026, 2, 28), 'pending'),
            (date(2026, 3, 31), 'pending'),
            (date(2026, 1, 31), 'done'),
            (date(2025, 12, 31), 'cancelled'),
        ]:
            PlannedTransactionFactory(
                workspace=self.workspace,
                account=self.account,
                recurring=self.rule,
                planned_date=planned_date,
                status=status,
                created_by=self.user,
                updated_by=self.user,
            )

    def test_delete_without_delete_pending_keeps_rows_unlinked(self):
        RecurringTransactionService.delete(self.workspace.id, self.rule.id)
        self.assertEqual(RecurringTransaction.objects.count(), 0)
        rows = PlannedTransaction.objects.filter(workspace=self.workspace)
        self.assertEqual(rows.count(), 4)  # all four survive, unlinked (SET_NULL)
        self.assertTrue(all(row.recurring_id is None for row in rows))
        self.assertEqual(rows.filter(status='pending').count(), 2)
        self.assertEqual(rows.filter(status='done').count(), 1)
        self.assertEqual(rows.filter(status='cancelled').count(), 1)

    def test_delete_with_delete_pending_removes_only_pending(self):
        RecurringTransactionService.delete(self.workspace.id, self.rule.id, delete_pending=True)
        self.assertEqual(RecurringTransaction.objects.count(), 0)
        rows = PlannedTransaction.objects.filter(workspace=self.workspace)
        self.assertEqual(rows.count(), 2)  # done + cancelled are history and survive
        self.assertEqual(set(rows.values_list('status', flat=True)), {'done', 'cancelled'})
        self.assertTrue(all(row.recurring_id is None for row in rows))
