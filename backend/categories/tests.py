"""Tests for budget-scoped persistent categories (endpoints live under /budgets)."""

from datetime import date

from django.test import TestCase

from budgeting.factories import BudgetFactory
from budgeting.models import CategoryBudget
from budgeting.services import PeriodService
from categories.factories import CategoryFactory
from categories.models import Category
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService


class TestCategoriesAPI(AuthMixin, APIClientMixin, TestCase):
    """Category CRUD nested under a budget."""

    def setUp(self):
        super().setUp()
        self.budget = BudgetFactory(workspace=self.workspace)

    def test_create_category(self):
        data = self.post(f'/api/budgets/{self.budget.id}/categories', {'name': 'Food'}, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['name'], 'Food')
        self.assertEqual(data['budget_id'], self.budget.id)
        self.assertFalse(data['is_archived'])

    def test_create_duplicate_name_case_insensitive_returns_400(self):
        CategoryFactory(budget=self.budget, name='Food')
        self.post(f'/api/budgets/{self.budget.id}/categories', {'name': 'food'}, **self.auth_headers())
        self.assertStatus(400)

    def test_same_name_across_budgets_ok(self):
        other_budget = BudgetFactory(workspace=self.workspace)
        CategoryFactory(budget=other_budget, name='Food')
        self.post(f'/api/budgets/{self.budget.id}/categories', {'name': 'Food'}, **self.auth_headers())
        self.assertStatus(201)

    def test_list_excludes_archived_by_default(self):
        CategoryFactory(budget=self.budget, name='Active')
        CategoryFactory(budget=self.budget, name='Retired', is_archived=True)

        names = [c['name'] for c in self.get(f'/api/budgets/{self.budget.id}/categories', **self.auth_headers())]
        self.assertEqual(names, ['Active'])

        names = [
            c['name']
            for c in self.get(f'/api/budgets/{self.budget.id}/categories?include_archived=true', **self.auth_headers())
        ]
        self.assertEqual(names, ['Active', 'Retired'])

    def test_rename_category(self):
        category = CategoryFactory(budget=self.budget, name='Old')
        data = self.put(
            f'/api/budgets/{self.budget.id}/categories/{category.id}', {'name': 'New'}, **self.auth_headers()
        )
        self.assertStatus(200)
        self.assertEqual(data['name'], 'New')

    def test_rename_to_ci_duplicate_returns_400(self):
        CategoryFactory(budget=self.budget, name='Food')
        category = CategoryFactory(budget=self.budget, name='Transport')
        self.put(f'/api/budgets/{self.budget.id}/categories/{category.id}', {'name': 'FOOD'}, **self.auth_headers())
        self.assertStatus(400)

    def test_rename_changing_only_case_ok(self):
        category = CategoryFactory(budget=self.budget, name='food')
        data = self.put(
            f'/api/budgets/{self.budget.id}/categories/{category.id}', {'name': 'Food'}, **self.auth_headers()
        )
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Food')

    def test_archive_category(self):
        category = CategoryFactory(budget=self.budget, name='Food')
        data = self.patch(
            f'/api/budgets/{self.budget.id}/categories/{category.id}/archive',
            {'is_archived': True},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertTrue(data['is_archived'])

    def test_delete_category(self):
        category = CategoryFactory(budget=self.budget, name='Food')
        self.delete(f'/api/budgets/{self.budget.id}/categories/{category.id}', **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(Category.objects.filter(id=category.id).exists())

    def test_category_from_other_workspace_returns_404(self):
        other = CategoryFactory()
        self.put(f'/api/budgets/{other.budget_id}/categories/{other.id}', {'name': 'Hacked'}, **self.auth_headers())
        self.assertStatus(404)

    def test_category_persists_across_periods(self):
        category = CategoryFactory(budget=self.budget, name='Food')
        PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 6, 15))
        PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))

        self.assertEqual(Category.objects.filter(budget=self.budget).count(), 1)
        self.assertTrue(Category.objects.filter(id=category.id).exists())


class TestWorkspaceCategoriesAPI(AuthMixin, APIClientMixin, TestCase):
    """Workspace-wide category listing at /budgets/categories (cross-budget filters)."""

    def setUp(self):
        super().setUp()
        self.budget_a = BudgetFactory(workspace=self.workspace)
        self.budget_b = BudgetFactory(workspace=self.workspace)

    def test_lists_categories_across_budgets(self):
        CategoryFactory(budget=self.budget_a, name='Food')
        CategoryFactory(budget=self.budget_b, name='Travel')

        data = self.get('/api/budgets/categories', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(
            {(c['name'], c['budget_id']) for c in data},
            {('Food', self.budget_a.id), ('Travel', self.budget_b.id)},
        )

    def test_excludes_archived_by_default(self):
        CategoryFactory(budget=self.budget_a, name='Active')
        CategoryFactory(budget=self.budget_a, name='Retired', is_archived=True)

        names = [c['name'] for c in self.get('/api/budgets/categories', **self.auth_headers())]
        self.assertEqual(names, ['Active'])

        names = [c['name'] for c in self.get('/api/budgets/categories?include_archived=true', **self.auth_headers())]
        self.assertEqual(sorted(names), ['Active', 'Retired'])

    def test_workspace_scoping(self):
        foreign = CategoryFactory()
        data = self.get('/api/budgets/categories', **self.auth_headers())
        self.assertNotIn(foreign.id, [c['id'] for c in data])


class TestCategoryRolePermissions(AuthMixin, APIClientMixin, TestCase):
    """Members can write categories (WRITE_ROLES); viewers cannot."""

    user_role = 'viewer'

    def setUp(self):
        super().setUp()
        self.budget = BudgetFactory(workspace=self.workspace)

    def test_viewer_cannot_create(self):
        self.post(f'/api/budgets/{self.budget.id}/categories', {'name': 'Food'}, **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_can_list(self):
        self.get(f'/api/budgets/{self.budget.id}/categories', **self.auth_headers())
        self.assertStatus(200)


class TestCategoryBudgetsAPI(AuthMixin, APIClientMixin, TestCase):
    """Planned amounts (CategoryBudget) upsert/list/delete."""

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        self.budget = BudgetFactory(workspace=self.workspace)
        self.category = CategoryFactory(budget=self.budget, name='Food')
        self.period = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))

    def _put_amount(self, category_id, amount, currency='PLN'):
        return self.put(
            f'/api/budgets/{self.budget.id}/periods/{self.period.id}/category-budgets',
            {'category_id': category_id, 'currency_code': currency, 'amount': amount},
            **self.auth_headers(),
        )

    def test_upsert_creates_then_overwrites(self):
        data = self._put_amount(self.category.id, '100.00')
        self.assertStatus(200)
        self.assertEqual(data['amount'], '100.00')

        data = self._put_amount(self.category.id, '250.00')
        self.assertStatus(200)
        self.assertEqual(data['amount'], '250.00')
        self.assertEqual(CategoryBudget.objects.filter(period=self.period).count(), 1)

    def test_category_from_another_budget_returns_400(self):
        other_budget = BudgetFactory(workspace=self.workspace)
        foreign_category = CategoryFactory(budget=other_budget, name='Foreign')
        self._put_amount(foreign_category.id, '100.00')
        self.assertStatus(400)

    def test_disabled_currency_returns_404(self):
        self._put_amount(self.category.id, '100.00', currency='USD')
        self.assertStatus(404)

    def test_negative_amount_returns_422(self):
        self._put_amount(self.category.id, '-5.00')
        self.assertStatus(422)

    def test_list_category_budgets(self):
        self._put_amount(self.category.id, '100.00')
        data = self.get(
            f'/api/budgets/{self.budget.id}/periods/{self.period.id}/category-budgets', **self.auth_headers()
        )
        self.assertStatus(200)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['currency_code'], 'PLN')

    def test_delete_category_budget(self):
        created = self._put_amount(self.category.id, '100.00')
        self.delete(
            f'/api/budgets/{self.budget.id}/periods/{self.period.id}/category-budgets/{created["id"]}',
            **self.auth_headers(),
        )
        self.assertStatus(204)
        self.assertEqual(CategoryBudget.objects.filter(period=self.period).count(), 0)


class TestCopyForward(AuthMixin, APIClientMixin, TestCase):
    """Copy-forward pre-fills new periods from the most recent earlier period."""

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        self.budget = BudgetFactory(workspace=self.workspace)
        self.food = CategoryFactory(budget=self.budget, name='Food')
        self.transport = CategoryFactory(budget=self.budget, name='Transport')
        self.retired = CategoryFactory(budget=self.budget, name='Retired', is_archived=True)
        self.june = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 6, 15))
        self.currency = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')

        for category, amount in ((self.food, '100.00'), (self.transport, '50.00'), (self.retired, '10.00')):
            CategoryBudget.objects.create(
                period=self.june,
                workspace_id=self.workspace.id,
                category=category,
                currency=self.currency,
                amount=amount,
                created_by=self.user,
            )

    def test_copy_forward_skips_archived_categories(self):
        july = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))

        copied = CategoryBudget.objects.filter(period=july)
        self.assertEqual(copied.count(), 2)
        self.assertEqual({cb.category_id for cb in copied}, {self.food.id, self.transport.id})

    def test_no_predecessor_no_copy(self):
        may = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 5, 15))
        self.assertEqual(CategoryBudget.objects.filter(period=may).count(), 0)

    def test_amounts_editable_independently_per_period(self):
        july = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))

        self.put(
            f'/api/budgets/{self.budget.id}/periods/{july.id}/category-budgets',
            {'category_id': self.food.id, 'currency_code': 'PLN', 'amount': '999.00'},
            **self.auth_headers(),
        )
        self.assertStatus(200)

        june_amount = CategoryBudget.objects.get(period=self.june, category=self.food).amount
        july_amount = CategoryBudget.objects.get(period=july, category=self.food).amount
        self.assertEqual(str(june_amount), '100.00')
        self.assertEqual(str(july_amount), '999.00')
