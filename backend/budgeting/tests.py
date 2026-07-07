"""Tests for the budgeting app (budgets, cadence math, lazy periods, custom periods)."""

from datetime import date

from django.test import TestCase

from budgeting.exceptions import NoPeriodForDateError, PeriodNotEditableError, PeriodOverlapError
from budgeting.factories import BudgetFactory, PeriodFactory
from budgeting.models import Budget, Cadence, Period
from budgeting.services import PeriodService
from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from workspaces.factories import WorkspaceFactory
from workspaces.services import WorkspaceService


class TestBudgetsAPI(AuthMixin, APIClientMixin, TestCase):
    """Budget CRUD + scoping as owner."""

    def test_create_budget(self):
        payload = {'name': 'Household', 'color': '#10B981', 'icon': '🏠'}
        data = self.post('/api/budgets', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['name'], 'Household')
        self.assertEqual(data['cadence'], 'monthly')
        self.assertIsNone(data['cadence_weeks'])

    def test_create_budget_weeks_cadence(self):
        payload = {'name': 'Fortnight', 'cadence': 'weeks', 'cadence_weeks': 2, 'cadence_anchor': '2026-01-05'}
        data = self.post('/api/budgets', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['cadence'], 'weeks')
        self.assertEqual(data['cadence_weeks'], 2)
        self.assertEqual(data['cadence_anchor'], '2026-01-05')

    def test_create_weeks_cadence_without_config_returns_400(self):
        self.post('/api/budgets', {'name': 'Broken', 'cadence': 'weeks'}, **self.auth_headers())
        self.assertStatus(400)

    def test_create_monthly_with_weeks_config_normalizes_to_null(self):
        payload = {'name': 'Normalized', 'cadence': 'monthly', 'cadence_weeks': 3, 'cadence_anchor': '2026-01-05'}
        data = self.post('/api/budgets', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertIsNone(data['cadence_weeks'])
        self.assertIsNone(data['cadence_anchor'])

    def test_duplicate_name_returns_400(self):
        BudgetFactory(workspace=self.workspace, name='Household')
        self.post('/api/budgets', {'name': 'Household'}, **self.auth_headers())
        self.assertStatus(400)

    def test_get_budget_from_other_workspace_returns_404(self):
        other = BudgetFactory()
        self.get(f'/api/budgets/{other.id}', **self.auth_headers())
        self.assertStatus(404)

    def test_update_budget(self):
        budget = BudgetFactory(workspace=self.workspace, name='Old')
        data = self.put(f'/api/budgets/{budget.id}', {'name': 'New', 'color': '#FF5733'}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['name'], 'New')
        self.assertEqual(data['color'], '#FF5733')

    def test_update_cadence_leaves_existing_periods_untouched(self):
        budget = BudgetFactory(workspace=self.workspace)
        period = PeriodService.get_or_create_for_date(self.user, budget, date(2026, 7, 15))
        rows_before = list(Period.objects.filter(budget=budget).values('id', 'start_date', 'end_date', 'name'))

        self.put(
            f'/api/budgets/{budget.id}',
            {'cadence': 'weeks', 'cadence_weeks': 2, 'cadence_anchor': '2026-01-05'},
            **self.auth_headers(),
        )
        self.assertStatus(200)

        rows_after = list(Period.objects.filter(budget=budget).values('id', 'start_date', 'end_date', 'name'))
        self.assertEqual(rows_before, rows_after)
        self.assertTrue(Period.objects.filter(id=period.id).exists())

    def test_archive_budget(self):
        budget = BudgetFactory(workspace=self.workspace, name='Archive Me')
        data = self.patch(f'/api/budgets/{budget.id}/archive', {'is_active': False}, **self.auth_headers())
        self.assertStatus(200)
        self.assertFalse(data['is_active'])

        names = [b['name'] for b in self.get('/api/budgets', **self.auth_headers())]
        self.assertNotIn('Archive Me', names)

        names = [b['name'] for b in self.get('/api/budgets?include_inactive=true', **self.auth_headers())]
        self.assertIn('Archive Me', names)

    def test_delete_budget_cascades_periods(self):
        budget = BudgetFactory(workspace=self.workspace)
        PeriodFactory(budget=budget)
        self.delete(f'/api/budgets/{budget.id}', **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(Budget.objects.filter(id=budget.id).exists())
        self.assertFalse(Period.objects.filter(budget_id=budget.id).exists())


class TestBudgetRolePermissions(AuthMixin, APIClientMixin, TestCase):
    """Members cannot write budgets."""

    user_role = 'member'

    def test_member_cannot_create(self):
        self.post('/api/budgets', {'name': 'X'}, **self.auth_headers())
        self.assertStatus(403)

    def test_member_cannot_update(self):
        budget = BudgetFactory(workspace=self.workspace)
        self.put(f'/api/budgets/{budget.id}', {'name': 'Y'}, **self.auth_headers())
        self.assertStatus(403)

    def test_member_cannot_delete(self):
        budget = BudgetFactory(workspace=self.workspace)
        self.delete(f'/api/budgets/{budget.id}', **self.auth_headers())
        self.assertStatus(403)

    def test_member_can_view(self):
        BudgetFactory(workspace=self.workspace)
        self.get('/api/budgets', **self.auth_headers())
        self.assertStatus(200)


class TestComputeRangeMonthly(TestCase):
    """compute_range for MONTHLY cadence."""

    def setUp(self):
        self.budget = BudgetFactory(cadence=Cadence.MONTHLY)

    def test_mid_month(self):
        start, end, name = PeriodService.compute_range(self.budget, date(2026, 7, 15))
        self.assertEqual((start, end, name), (date(2026, 7, 1), date(2026, 7, 31), 'July 2026'))

    def test_last_day_of_january(self):
        start, end, _ = PeriodService.compute_range(self.budget, date(2026, 1, 31))
        self.assertEqual((start, end), (date(2026, 1, 1), date(2026, 1, 31)))

    def test_february_non_leap(self):
        start, end, _ = PeriodService.compute_range(self.budget, date(2026, 2, 10))
        self.assertEqual((start, end), (date(2026, 2, 1), date(2026, 2, 28)))

    def test_february_leap(self):
        start, end, _ = PeriodService.compute_range(self.budget, date(2028, 2, 10))
        self.assertEqual((start, end), (date(2028, 2, 1), date(2028, 2, 29)))

    def test_december_name(self):
        _, _, name = PeriodService.compute_range(self.budget, date(2026, 12, 25))
        self.assertEqual(name, 'December 2026')


class TestComputeRangeWeeks(TestCase):
    """compute_range for every-N-weeks cadence, anchored Monday 2026-01-05, weeks=4."""

    def setUp(self):
        self.budget = BudgetFactory(cadence=Cadence.WEEKS, cadence_weeks=4, cadence_anchor=date(2026, 1, 5))

    def test_date_in_first_window(self):
        start, end, _ = PeriodService.compute_range(self.budget, date(2026, 1, 20))
        self.assertEqual((start, end), (date(2026, 1, 5), date(2026, 2, 1)))

    def test_anchor_date_itself(self):
        start, end, _ = PeriodService.compute_range(self.budget, date(2026, 1, 5))
        self.assertEqual((start, end), (date(2026, 1, 5), date(2026, 2, 1)))

    def test_date_in_third_window(self):
        start, end, _ = PeriodService.compute_range(self.budget, date(2026, 3, 10))
        self.assertEqual((start, end), (date(2026, 3, 2), date(2026, 3, 29)))

    def test_date_before_anchor(self):
        start, end, _ = PeriodService.compute_range(self.budget, date(2026, 1, 4))
        self.assertEqual((start, end), (date(2025, 12, 8), date(2026, 1, 4)))

    def test_windows_are_contiguous_and_non_overlapping(self):
        boundaries = [
            date(2025, 12, 8),
            date(2026, 1, 4),
            date(2026, 1, 5),
            date(2026, 2, 1),
            date(2026, 2, 2),
            date(2026, 3, 1),
        ]
        windows = [PeriodService.compute_range(self.budget, d)[:2] for d in boundaries]
        self.assertEqual(windows[0], windows[1])  # both in the pre-anchor window
        self.assertEqual(windows[2], windows[3])  # first anchored window
        self.assertEqual(windows[4], windows[5])  # second window
        self.assertEqual(windows[1][1] + (windows[2][0] - windows[1][1]), windows[2][0])
        self.assertEqual((windows[2][0] - windows[1][1]).days, 1)  # contiguous
        self.assertEqual((windows[4][0] - windows[3][1]).days, 1)  # contiguous

    def test_custom_cadence_raises(self):
        budget = BudgetFactory(cadence=Cadence.CUSTOM)
        with self.assertRaises(NoPeriodForDateError):
            PeriodService.compute_range(budget, date(2026, 7, 15))


class TestGetOrCreateForDate(TestCase):
    """Lazy period materialization."""

    def setUp(self):
        self.user = UserFactory()
        self.budget = BudgetFactory(cadence=Cadence.MONTHLY)

    def test_creates_once_and_reuses(self):
        first = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))
        second = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 31))

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(Period.objects.filter(budget=self.budget).count(), 1)
        self.assertEqual(first.name, 'July 2026')
        self.assertFalse(first.is_custom)

    def test_race_returns_existing_row(self):
        # Pre-insert the row another request would have created.
        existing = Period.objects.create(
            budget=self.budget,
            workspace_id=self.budget.workspace_id,
            name='July 2026',
            start_date=date(2026, 7, 1),
            end_date=date(2026, 7, 31),
            is_custom=False,
        )
        period = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))
        self.assertEqual(period.pk, existing.pk)
        self.assertEqual(Period.objects.filter(budget=self.budget).count(), 1)

    def test_custom_cadence_returns_covering_period(self):
        budget = BudgetFactory(cadence=Cadence.CUSTOM)
        period = Period.objects.create(
            budget=budget,
            workspace_id=budget.workspace_id,
            name='Trip',
            start_date=date(2026, 7, 10),
            end_date=date(2026, 7, 20),
            is_custom=True,
        )

        found = PeriodService.get_or_create_for_date(self.user, budget, date(2026, 7, 15))
        self.assertEqual(found.pk, period.pk)

        with self.assertRaises(NoPeriodForDateError):
            PeriodService.get_or_create_for_date(self.user, budget, date(2026, 8, 1))


class TestPeriodsAPI(AuthMixin, APIClientMixin, TestCase):
    """Period endpoints."""

    def setUp(self):
        super().setUp()
        self.budget = BudgetFactory(workspace=self.workspace)

    def test_current_materializes_period(self):
        data = self.get(f'/api/budgets/{self.budget.id}/periods/current?date=2026-07-15', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['start_date'], '2026-07-01')
        self.assertEqual(data['end_date'], '2026-07-31')
        self.assertEqual(data['name'], 'July 2026')
        self.assertEqual(Period.objects.filter(budget=self.budget).count(), 1)

    def test_current_defaults_to_today(self):
        data = self.get(f'/api/budgets/{self.budget.id}/periods/current', **self.auth_headers())
        self.assertStatus(200)
        today = date.today()
        self.assertEqual(data['start_date'], today.replace(day=1).isoformat())

    def test_current_custom_cadence_without_period_returns_400(self):
        budget = BudgetFactory(workspace=self.workspace, cadence=Cadence.CUSTOM)
        self.get(f'/api/budgets/{budget.id}/periods/current?date=2026-07-15', **self.auth_headers())
        self.assertStatus(400)

    def test_list_periods(self):
        PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 6, 1))
        PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 1))
        data = self.get(f'/api/budgets/{self.budget.id}/periods', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([p['name'] for p in data], ['July 2026', 'June 2026'])

    def test_create_custom_period(self):
        payload = {'name': 'Trip', 'start_date': '2026-07-10', 'end_date': '2026-07-20'}
        data = self.post(f'/api/budgets/{self.budget.id}/periods', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertTrue(data['is_custom'])

    def test_create_overlapping_custom_period_returns_400(self):
        PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))
        payload = {'name': 'Overlap', 'start_date': '2026-07-20', 'end_date': '2026-08-05'}
        self.post(f'/api/budgets/{self.budget.id}/periods', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_edit_auto_created_period_returns_400(self):
        period = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))
        self.put(f'/api/budgets/{self.budget.id}/periods/{period.id}', {'name': 'Renamed'}, **self.auth_headers())
        self.assertStatus(400)

    def test_delete_auto_created_period_returns_400(self):
        period = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))
        self.delete(f'/api/budgets/{self.budget.id}/periods/{period.id}', **self.auth_headers())
        self.assertStatus(400)

    def test_update_and_delete_custom_period(self):
        payload = {'name': 'Trip', 'start_date': '2026-07-10', 'end_date': '2026-07-20'}
        created = self.post(f'/api/budgets/{self.budget.id}/periods', payload, **self.auth_headers())

        data = self.put(
            f'/api/budgets/{self.budget.id}/periods/{created["id"]}',
            {'name': 'Long Trip', 'end_date': '2026-07-25'},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Long Trip')
        self.assertEqual(data['end_date'], '2026-07-25')

        self.delete(f'/api/budgets/{self.budget.id}/periods/{created["id"]}', **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(Period.objects.filter(id=created['id']).exists())

    def test_period_from_other_workspace_budget_returns_404(self):
        other_budget = BudgetFactory()
        self.get(f'/api/budgets/{other_budget.id}/periods', **self.auth_headers())
        self.assertStatus(404)


class TestCustomPeriodServiceRules(TestCase):
    """Service-level custom period rules."""

    def setUp(self):
        self.user = UserFactory()
        self.workspace = WorkspaceFactory()
        self.budget = BudgetFactory(workspace=self.workspace)

    def test_update_custom_overlap_excluding_self(self):
        from budgeting.schemas import PeriodCreate, PeriodUpdate

        first = PeriodService.create_custom(
            self.user,
            self.workspace.id,
            self.budget.id,
            PeriodCreate(name='A', start_date=date(2026, 7, 1), end_date=date(2026, 7, 10)),
        )
        PeriodService.create_custom(
            self.user,
            self.workspace.id,
            self.budget.id,
            PeriodCreate(name='B', start_date=date(2026, 7, 11), end_date=date(2026, 7, 20)),
        )

        # Shrinking A within its own range is fine (overlap check excludes self)
        updated = PeriodService.update_custom(
            self.user,
            self.workspace.id,
            self.budget.id,
            first.id,
            PeriodUpdate(end_date=date(2026, 7, 5)),
        )
        self.assertEqual(updated.end_date, date(2026, 7, 5))

        # Extending A into B overlaps
        with self.assertRaises(PeriodOverlapError):
            PeriodService.update_custom(
                self.user,
                self.workspace.id,
                self.budget.id,
                first.id,
                PeriodUpdate(end_date=date(2026, 7, 15)),
            )

    def test_delete_non_custom_raises(self):
        period = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))
        with self.assertRaises(PeriodNotEditableError):
            PeriodService.delete(self.workspace.id, self.budget.id, period.id)


class TestDefaultGeneralBudget(TestCase):
    """create_workspace provisions the new General Budget alongside the legacy account."""

    def test_new_workspace_has_general_budget_and_legacy_account(self):
        from budget_accounts.models import BudgetAccount

        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='WS')

        budgets = list(Budget.objects.for_workspace(workspace.id))
        self.assertEqual(len(budgets), 1)
        self.assertEqual(budgets[0].name, 'General')
        self.assertEqual(budgets[0].cadence, Cadence.MONTHLY)

        self.assertTrue(BudgetAccount.objects.filter(workspace=workspace, name='General').exists())
