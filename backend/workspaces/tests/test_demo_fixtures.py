"""Tests for workspaces.demo_fixtures - starter categories and demo sample data.

All date bounds are derived from ``date.today()`` at runtime (no freezegun in
the dependency set), mirroring the module's own relative-to-today math so the
suite stays valid on any run date. Asserts the two-month demo coverage, the
'Dining Out' starter-category swap, uncategorized income, upcoming planned
transactions, and CategoryBudget estimates for both covered periods.
"""

import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.test import SimpleTestCase, TestCase

from accounts.models import Account
from budgeting.models import Budget, CategoryBudget, Period
from categories.models import Category
from common.tests.factories import UserFactory
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction
from transfers.models import Transfer
from workspaces.demo_fixtures import STARTER_CATEGORIES, _clamp_to
from workspaces.services import WorkspaceService


def _month_range(anchor: date) -> tuple[date, date]:
    """First and last day of anchor's calendar month (mirrors period math)."""
    last_day = calendar.monthrange(anchor.year, anchor.month)[1]
    return anchor.replace(day=1), anchor.replace(day=last_day)


class TestStarterCategories(TestCase):
    """Both workspace flavors get the same 7 starter categories - no 'Salary'."""

    def _assert_starter_categories(self, workspace):
        general = Budget.objects.get(workspace=workspace, name='General')
        names = set(Category.objects.filter(budget=general).values_list('name', flat=True))

        # Literal 7 on purpose: pins the count independently of STARTER_CATEGORIES.
        self.assertEqual(Category.objects.filter(budget=general).count(), 7)
        self.assertNotIn('Salary', names)
        self.assertIn('Dining Out', names)
        self.assertEqual(names, set(STARTER_CATEGORIES))

    def test_demo_workspace_starter_categories(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Demo WS', create_demo=True)
        self._assert_starter_categories(workspace)

    def test_non_demo_workspace_starter_categories(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Plain WS', create_demo=False)
        self._assert_starter_categories(workspace)


class TestDemoFixtures(TestCase):
    """create_demo=True: two months of sample data, estimates, upcoming planned."""

    def setUp(self):
        # Bounds first, mirroring get_previous_month_date_range() locally so
        # the module's date logic is verified independently of the module.
        self.today = date.today()
        self.current_month_start, self.current_month_end = _month_range(self.today)
        previous_month_tail = self.current_month_start - timedelta(days=1)
        self.prev_month_start, self.prev_month_end = _month_range(previous_month_tail)
        _, self.next_month_end = _month_range(self.current_month_end + timedelta(days=1))

        self.user = UserFactory()
        self.workspace = WorkspaceService.create_workspace(user=self.user, name='Demo WS', create_demo=True)

    def test_previous_month_expense_in_every_starter_category(self):
        expenses = Transaction.objects.for_workspace(self.workspace.id).filter(
            type='expense', date__range=(self.prev_month_start, self.prev_month_end)
        )
        names = set(expenses.values_list('category__name', flat=True))
        self.assertTrue(set(STARTER_CATEGORIES).issubset(names))

    def test_previous_month_income_is_uncategorized(self):
        income = Transaction.objects.for_workspace(self.workspace.id).filter(
            type='income', date__range=(self.prev_month_start, self.prev_month_end)
        )
        self.assertEqual(income.count(), 2)
        self.assertEqual(income.filter(category__isnull=True).count(), 2)

    def test_current_month_has_at_least_eight_transactions_and_none_in_the_future(self):
        current = Transaction.objects.for_workspace(self.workspace.id).filter(
            date__gte=self.current_month_start, date__lte=self.today
        )
        self.assertGreaterEqual(current.count(), 8)
        # Every current-month transaction satisfies date <= today (globally:
        # no fixture transaction ever postdates today).
        self.assertFalse(Transaction.objects.for_workspace(self.workspace.id).filter(date__gt=self.today).exists())

    def test_current_month_has_uncategorized_monthly_salary_income(self):
        salary = Transaction.objects.for_workspace(self.workspace.id).filter(
            type='income',
            description='Monthly Salary',
            date__gte=self.current_month_start,
            date__lte=self.today,
        )
        self.assertGreaterEqual(salary.count(), 1)
        self.assertIsNone(salary.first().category)

    def test_current_month_expenses_cover_at_least_five_categories(self):
        distinct = (
            Transaction.objects.for_workspace(self.workspace.id)
            .filter(
                type='expense',
                category__isnull=False,
                date__gte=self.current_month_start,
                date__lte=self.today,
            )
            .values('category__name')
            .distinct()
            .count()
        )
        self.assertGreaterEqual(distinct, 5)

    def test_transfers_one_per_month_between_main_and_savings(self):
        transfers = Transfer.objects.for_workspace(self.workspace.id)
        self.assertEqual(transfers.count(), 2)

        previous = transfers.filter(date__range=(self.prev_month_start, self.prev_month_end))
        self.assertEqual(previous.count(), 1)
        current = transfers.filter(date__gte=self.current_month_start, date__lte=self.today)
        self.assertEqual(current.count(), 1)

        for transfer in transfers:
            self.assertEqual(transfer.from_account.name, 'Main')
            self.assertEqual(transfer.to_account.name, 'Savings')
            self.assertEqual(transfer.from_amount, Decimal('500.00'))
            self.assertEqual(transfer.to_amount, Decimal('500.00'))

    def test_single_done_planned_transaction_in_previous_month(self):
        done = PlannedTransaction.objects.for_workspace(self.workspace.id).filter(status='done')
        self.assertEqual(done.count(), 1)

        planned = done.first()
        self.assertIsNotNone(planned)
        self.assertIsNotNone(planned.payment_date)
        self.assertGreaterEqual(planned.planned_date, self.prev_month_start)
        self.assertLessEqual(planned.planned_date, self.prev_month_end)

    def test_pending_planned_transactions_are_upcoming(self):
        pending = PlannedTransaction.objects.for_workspace(self.workspace.id).filter(status='pending')
        self.assertGreaterEqual(pending.count(), 3)

        for planned in pending:
            self.assertGreaterEqual(planned.planned_date, self.today)
            self.assertLessEqual(planned.planned_date, self.next_month_end)

    def test_general_budget_periods_cover_both_months(self):
        general = Budget.objects.get(workspace=self.workspace, name='General')

        previous = Period.objects.filter(
            budget=general, start_date__lte=self.prev_month_start, end_date__gte=self.prev_month_end
        ).first()
        current = Period.objects.filter(
            budget=general, start_date__lte=self.current_month_start, end_date__gte=self.current_month_end
        ).first()

        self.assertIsNotNone(previous)
        self.assertIsNotNone(current)

    def test_category_budget_estimates_for_both_periods(self):
        general = Budget.objects.get(workspace=self.workspace, name='General')
        main = Account.objects.get(workspace=self.workspace, name='Main')

        estimates = CategoryBudget.objects.for_workspace(self.workspace.id)
        self.assertEqual(estimates.count(), 14)

        previous_period = Period.objects.filter(
            budget=general, start_date__lte=self.prev_month_start, end_date__gte=self.prev_month_end
        ).first()
        current_period = Period.objects.filter(
            budget=general, start_date__lte=self.current_month_start, end_date__gte=self.current_month_end
        ).first()
        self.assertIsNotNone(previous_period)
        self.assertIsNotNone(current_period)

        for period in (previous_period, current_period):
            rows = CategoryBudget.objects.filter(period=period)
            self.assertEqual(rows.count(), 7)
            self.assertEqual(set(rows.values_list('category__name', flat=True)), set(STARTER_CATEGORIES))
            for row in rows:
                self.assertGreater(row.amount, 0)
                self.assertEqual(row.currency_id, main.currency_id)


class TestStarterOnlyWorkspace(TestCase):
    """create_demo=False leaves the workspace empty but usable."""

    def test_non_demo_workspace_has_no_sample_records(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Plain WS', create_demo=False)
        ws_id = workspace.id

        self.assertEqual(Transaction.objects.for_workspace(ws_id).count(), 0)
        self.assertEqual(Transfer.objects.for_workspace(ws_id).count(), 0)
        self.assertEqual(PlannedTransaction.objects.for_workspace(ws_id).count(), 0)
        self.assertEqual(CategoryBudget.objects.for_workspace(ws_id).count(), 0)

        accounts = Account.objects.filter(workspace=workspace)
        self.assertEqual(accounts.count(), 1)
        self.assertEqual(accounts.first().name, 'Main')

        general = Budget.objects.get(workspace=workspace, name='General')
        self.assertEqual(Category.objects.filter(budget=general).count(), 7)

        # Starter behavior unchanged: exactly one period, covering the current month.
        periods = Period.objects.filter(budget=general)
        self.assertEqual(periods.count(), 1)
        month_start, month_end = _month_range(date.today())
        self.assertEqual(periods.first().start_date, month_start)
        self.assertEqual(periods.first().end_date, month_end)


class TestClampToHelper(SimpleTestCase):
    """Direct unit test of the demo-fixtures date clamp (fixed dates, no DB).

    Exercises the early-month branch deterministically: when run late in a
    month, the service-level tests never see clamping happen.
    """

    def test_returns_today_when_today_is_before_day(self):
        month_start = date(2026, 8, 1)
        today = date(2026, 8, 3)
        self.assertEqual(_clamp_to(15, month_start, today), today)

    def test_returns_day_when_day_is_on_or_before_today(self):
        month_start = date(2026, 8, 1)
        today = date(2026, 8, 3)
        self.assertEqual(_clamp_to(2, month_start, today), date(2026, 8, 2))
