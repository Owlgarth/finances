"""Tests for reports API endpoints (rebuilt on the account/budgeting models)."""

from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounts.factories import AccountFactory
from budgeting.factories import BudgetFactory
from budgeting.models import CategoryBudget
from budgeting.services import PeriodService
from categories.factories import CategoryFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService
from transactions.factories import TransactionFactory


class ReportsTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base setup: PLN + USD accounts, a monthly budget, categories."""

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')

        self.checking = AccountFactory(workspace=self.workspace, name='Checking', opening_balance=Decimal('1000.00'))
        self.dollars = AccountFactory(workspace=self.workspace, name='Dollars', currency=usd)

        self.budget = BudgetFactory(workspace=self.workspace)
        self.groceries = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Groceries')
        self.transport = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Transport')
        self.period = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 7, 15))
        self.pln = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')


class TestBudgetSummary(ReportsTestCase):
    def setUp(self):
        super().setUp()
        CategoryBudget.objects.create(
            period=self.period,
            workspace_id=self.workspace.id,
            category=self.groceries,
            currency=self.pln,
            amount=Decimal('1000.00'),
            created_by=self.user,
        )
        CategoryBudget.objects.create(
            period=self.period,
            workspace_id=self.workspace.id,
            category=self.transport,
            currency=self.pln,
            amount=Decimal('500.00'),
            created_by=self.user,
        )

    def test_budget_summary_planned_vs_actual(self):
        TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            category=self.groceries,
            amount=Decimal('250.00'),
            type='expense',
        )
        TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 10),
            category=self.transport,
            amount=Decimal('50.00'),
            type='expense',
        )

        data = self.get(
            f'/api/reports/budget-summary?budget_id={self.budget.id}&period_id={self.period.id}',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['budget']['id'], self.budget.id)
        self.assertEqual(data['period']['id'], self.period.id)

        by_category = {item['category_name']: item for item in data['items']}
        self.assertEqual(by_category['Groceries']['planned'], '1000.00')
        self.assertEqual(by_category['Groceries']['actual'], '250.00')
        self.assertEqual(by_category['Groceries']['remaining'], '750.00')
        self.assertEqual(by_category['Transport']['actual'], '50.00')

        self.assertEqual(data['totals']['PLN']['planned'], '1500.00')
        self.assertEqual(data['totals']['PLN']['actual'], '300.00')

    def test_budget_summary_excludes_adjustments_and_income(self):
        TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            category=self.groceries,
            amount=Decimal('100.00'),
            type='expense',
        )
        # Adjustments are uncategorized and excluded; income is not an actual.
        TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 6),
            amount=Decimal('-30.00'),
            type='adjustment',
        )

        data = self.get(
            f'/api/reports/budget-summary?budget_id={self.budget.id}&period_id={self.period.id}',
            **self.auth_headers(),
        )
        by_category = {item['category_name']: item for item in data['items']}
        self.assertEqual(by_category['Groceries']['actual'], '100.00')

    def test_budget_summary_actual_outside_period_ignored(self):
        TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 8, 5),  # next month
            category=self.groceries,
            amount=Decimal('999.00'),
            type='expense',
        )

        data = self.get(
            f'/api/reports/budget-summary?budget_id={self.budget.id}&period_id={self.period.id}',
            **self.auth_headers(),
        )
        by_category = {item['category_name']: item for item in data['items']}
        self.assertEqual(by_category['Groceries']['actual'], '0.00')

    def test_budget_summary_period_not_found(self):
        self.get(
            f'/api/reports/budget-summary?budget_id={self.budget.id}&period_id=99999',
            **self.auth_headers(),
        )
        self.assertStatus(404)

    def test_budget_summary_without_auth_fails(self):
        self.get(f'/api/reports/budget-summary?budget_id={self.budget.id}&period_id={self.period.id}')
        self.assertStatus(401)


class TestCurrentBalances(ReportsTestCase):
    def test_current_balances_per_account_and_currency(self):
        TransactionFactory(account=self.checking, workspace=self.workspace, amount=Decimal('200.00'), type='income')
        TransactionFactory(account=self.dollars, workspace=self.workspace, amount=Decimal('50.00'), type='income')

        data = self.get('/api/reports/current-balances', **self.auth_headers())
        self.assertStatus(200)

        by_account = {row['account_name']: row for row in data['accounts']}
        self.assertEqual(by_account['Checking']['balance'], '1200.00')  # 1000 opening + 200
        self.assertEqual(by_account['Dollars']['balance'], '50.00')

        self.assertEqual(data['totals']['PLN'], '1200.00')
        self.assertEqual(data['totals']['USD'], '50.00')

    def test_current_balances_excludes_archived_by_default(self):
        self.dollars.is_archived = True
        self.dollars.save()

        data = self.get('/api/reports/current-balances', **self.auth_headers())
        names = [row['account_name'] for row in data['accounts']]
        self.assertNotIn('Dollars', names)

        data = self.get('/api/reports/current-balances?include_archived=true', **self.auth_headers())
        names = [row['account_name'] for row in data['accounts']]
        self.assertIn('Dollars', names)

    def test_current_balances_without_auth_fails(self):
        self.get('/api/reports/current-balances')
        self.assertStatus(401)
