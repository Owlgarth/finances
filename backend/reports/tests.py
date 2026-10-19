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
from transactions.factories import TransactionFactory, TransactionItemFactory


def _covered_transaction(**kwargs):
    """TransactionFactory wrapper giving non-adjustment rows a full-coverage
    remainder item, so item-based aggregates see the transaction's amount."""
    tx = TransactionFactory(**kwargs)
    if tx.type != 'adjustment':
        TransactionItemFactory(
            transaction=tx,
            position=0,
            name='',
            quantity=Decimal('1'),
            unit_price=None,
            line_total=tx.amount,
            is_remainder=True,
        )
    return tx


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
        _covered_transaction(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            category=self.groceries,
            amount=Decimal('250.00'),
            type='expense',
        )
        _covered_transaction(
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

    def test_budget_summary_counts_account_less_actuals_by_own_currency(self):
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        _covered_transaction(
            account=None,
            currency=usd,
            workspace=self.workspace,
            date=date(2026, 7, 8),
            category=self.groceries,
            amount=Decimal('80.00'),
            type='expense',
        )

        data = self.get(
            f'/api/reports/budget-summary?budget_id={self.budget.id}&period_id={self.period.id}',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        by_key = {(i['category_name'], i['currency_code']): i for i in data['items']}
        self.assertEqual(by_key[('Groceries', 'USD')]['actual'], '80.00')
        self.assertEqual(by_key[('Groceries', 'USD')]['planned'], '0.00')
        self.assertEqual(data['totals']['USD']['actual'], '80.00')
        self.assertEqual(data['totals']['PLN']['planned'], '1500.00')

    def test_budget_summary_excludes_adjustments_and_income(self):
        _covered_transaction(
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
        _covered_transaction(
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

    def test_budget_summary_splits_transaction_items_across_categories(self):
        tx = TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            category=self.groceries,
            amount=Decimal('100.00'),
            type='expense',
        )
        # Remainder carries the uncovered 30.00 and inherits groceries.
        TransactionItemFactory(
            transaction=tx,
            position=0,
            name='',
            is_remainder=True,
            quantity=Decimal('1'),
            unit_price=None,
            line_total=Decimal('30.00'),
        )
        # Inherited item, no line_total: effective total = quantity x unit_price.
        TransactionItemFactory(
            transaction=tx,
            position=1,
            name='Apples',
            quantity=Decimal('2'),
            unit_price=Decimal('20.00'),
            line_total=None,
        )
        # Explicit per-item category in the same budget.
        TransactionItemFactory(
            transaction=tx,
            position=2,
            name='Bus ticket',
            line_total=Decimal('30.00'),
            category=self.transport,
        )

        data = self.get(
            f'/api/reports/budget-summary?budget_id={self.budget.id}&period_id={self.period.id}',
            **self.auth_headers(),
        )
        self.assertStatus(200)
        by_category = {item['category_name']: item for item in data['items']}
        # 40.00 inherited apples + 30.00 remainder under groceries; 30.00 explicit transport.
        self.assertEqual(by_category['Groceries']['actual'], '70.00')
        self.assertEqual(by_category['Groceries']['remaining'], '930.00')
        self.assertEqual(by_category['Transport']['actual'], '30.00')
        self.assertEqual(data['totals']['PLN']['actual'], '100.00')

    def test_budget_summary_excludes_cross_budget_explicit_items(self):
        other_budget = BudgetFactory(workspace=self.workspace)
        rent = CategoryFactory(budget=other_budget, workspace=self.workspace, name='Rent')
        other_period = PeriodService.get_or_create_for_date(self.user, other_budget, date(2026, 7, 15))
        # Read-side fixture only: the write paths reject cross-budget item
        # categories (D5/D6); the aggregation must still attribute by the
        # item's own category, never the transaction's.
        tx = TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            category=self.groceries,
            amount=Decimal('100.00'),
            type='expense',
        )
        TransactionItemFactory(
            transaction=tx,
            position=0,
            name='',
            is_remainder=True,
            quantity=Decimal('1'),
            unit_price=None,
            line_total=Decimal('75.00'),
        )
        TransactionItemFactory(
            transaction=tx,
            position=1,
            name='Rent share',
            line_total=Decimal('25.00'),
            category=rent,
        )

        data = self.get(
            f'/api/reports/budget-summary?budget_id={self.budget.id}&period_id={self.period.id}',
            **self.auth_headers(),
        )
        by_category = {item['category_name']: item for item in data['items']}
        self.assertEqual(by_category['Groceries']['actual'], '75.00')
        self.assertNotIn('Rent', by_category)

        other = self.get(
            f'/api/reports/budget-summary?budget_id={other_budget.id}&period_id={other_period.id}',
            **self.auth_headers(),
        )
        other_by = {item['category_name']: item for item in other['items']}
        self.assertEqual(other_by['Rent']['actual'], '25.00')

    def test_budget_summary_excludes_income_items(self):
        income = TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 6),
            category=self.groceries,
            amount=Decimal('500.00'),
            type='income',
        )
        TransactionItemFactory(
            transaction=income,
            position=0,
            name='',
            is_remainder=True,
            quantity=Decimal('1'),
            unit_price=None,
            line_total=Decimal('500.00'),
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

    def test_current_balances_ignore_account_less_transactions(self):
        """Account-less rows contribute to no balance (reverse-FK exclusion is structural)."""
        TransactionFactory(
            account=None,
            currency=self.pln,
            workspace=self.workspace,
            amount=Decimal('500.00'),
            type='income',
        )

        data = self.get('/api/reports/current-balances', **self.auth_headers())
        self.assertStatus(200)
        # Checking stays at its 1000.00 opening balance; the 500.00 account-less
        # income moves nothing. Totals come from accounts only.
        self.assertEqual(data['totals'], {'PLN': '1000.00', 'USD': '0.00'})


class TestBudgetHistory(ReportsTestCase):
    def setUp(self):
        super().setUp()
        self.june = PeriodService.get_or_create_for_date(self.user, self.budget, date(2026, 6, 15))
        for period, amount in ((self.june, '900.00'), (self.period, '1000.00')):
            CategoryBudget.objects.create(
                period=period,
                workspace_id=self.workspace.id,
                category=self.groceries,
                currency=self.pln,
                amount=Decimal(amount),
                created_by=self.user,
            )
        _covered_transaction(
            account=self.checking,
            workspace=self.workspace,
            category=self.groceries,
            date=date(2026, 6, 20),
            amount=Decimal('850.00'),
            type='expense',
        )
        _covered_transaction(
            account=self.checking,
            workspace=self.workspace,
            category=self.groceries,
            date=date(2026, 7, 5),
            amount=Decimal('300.00'),
            type='expense',
        )

    def test_history_returns_periods_oldest_first_with_totals(self):
        data = self.get(f'/api/reports/budget-history?budget_id={self.budget.id}', **self.auth_headers())
        self.assertStatus(200)

        self.assertEqual(data['budget']['name'], self.budget.name)
        self.assertEqual([p['name'] for p in data['periods']], ['June 2026', 'July 2026'])

        june, july = data['periods']
        self.assertEqual(june['totals']['PLN'], {'planned': '900.00', 'actual': '850.00'})
        self.assertEqual(july['totals']['PLN'], {'planned': '1000.00', 'actual': '300.00'})

    def test_history_respects_limit(self):
        data = self.get(f'/api/reports/budget-history?budget_id={self.budget.id}&limit=1', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([p['name'] for p in data['periods']], ['July 2026'])

    def test_history_excludes_income_and_uncategorized(self):
        TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 6),
            amount=Decimal('99.00'),
            type='income',
        )
        TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 7),
            amount=Decimal('77.00'),
            type='expense',
        )
        data = self.get(f'/api/reports/budget-history?budget_id={self.budget.id}', **self.auth_headers())
        july = data['periods'][-1]
        self.assertEqual(july['totals']['PLN']['actual'], '300.00')

    def test_history_unknown_budget_404(self):
        self.get('/api/reports/budget-history?budget_id=999999', **self.auth_headers())
        self.assertStatus(404)

    def test_history_counts_account_less_actuals_by_own_currency(self):
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        _covered_transaction(
            account=None,
            currency=usd,
            workspace=self.workspace,
            date=date(2026, 7, 9),
            category=self.groceries,
            amount=Decimal('40.00'),
            type='expense',
        )

        data = self.get(f'/api/reports/budget-history?budget_id={self.budget.id}', **self.auth_headers())
        self.assertStatus(200)
        july = data['periods'][-1]
        self.assertEqual(july['totals']['USD'], {'planned': '0.00', 'actual': '40.00'})
        self.assertEqual(july['totals']['PLN']['actual'], '300.00')

    def test_history_actuals_sum_item_effective_totals_not_amounts(self):
        # Legacy under-summed row (no remainder): item sums diverge from the
        # stored amount and the difference is accepted (D8 tolerance).
        legacy = TransactionFactory(
            account=self.checking,
            workspace=self.workspace,
            date=date(2026, 7, 20),
            category=self.groceries,
            amount=Decimal('400.00'),
            type='expense',
        )
        TransactionItemFactory(transaction=legacy, position=0, name='Apples', line_total=Decimal('150.00'))
        TransactionItemFactory(
            transaction=legacy,
            position=1,
            name='Bus ticket',
            line_total=Decimal('100.00'),
            category=self.transport,
        )

        data = self.get(f'/api/reports/budget-history?budget_id={self.budget.id}', **self.auth_headers())
        self.assertStatus(200)
        july = data['periods'][-1]
        # setUp's fully covered 300.00 + this row's item sum 250.00; the 400.00
        # transaction amount itself is never read.
        self.assertEqual(july['totals']['PLN']['actual'], '550.00')
