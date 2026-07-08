"""Tests for account-based transactions (B5 semantics)."""

import json
from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounts.factories import AccountFactory
from accounts.services import AccountService
from budgeting.factories import BudgetFactory
from budgeting.models import Cadence, Period
from budgeting.services import PeriodService
from categories.factories import CategoryFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService
from transactions.factories import TransactionFactory
from transactions.models import Transaction, TransactionItem
from transactions.services import TransactionService


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

    def test_create_defaults_to_single_active_account(self):
        data = self.post('/api/transactions', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['account_id'], self.account.id)

    def test_create_without_account_and_two_active_accounts_returns_400(self):
        AccountFactory(workspace=self.workspace, name='Second')
        self.post('/api/transactions', self._payload(), **self.auth_headers())
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

    def test_filter_by_budget(self):
        data = self.get(f'/api/transactions?budget_id={self.budget.id}', **self.auth_headers())
        self.assertEqual(data['total'], 1)
        self.assertEqual(data['items'][0]['category_name'], 'Groceries')

    def test_filter_by_type(self):
        data = self.get('/api/transactions?transaction_type=income', **self.auth_headers())
        self.assertEqual(data['total'], 1)

    def test_totals_grouped_per_account_currency(self):
        totals = self.get('/api/transactions/totals?group_by=type', **self.auth_headers())['totals']
        as_map = {(t['group'], t['currency']): t['total'] for t in totals}
        self.assertEqual(as_map[('expense', 'PLN')], '40.00')
        self.assertEqual(as_map[('expense', 'USD')], '30.00')
        self.assertEqual(as_map[('income', 'PLN')], '500.00')
        self.assertNotIn(('adjustment', 'PLN'), as_map)

    def test_totals_combined_excludes_adjustments(self):
        data = self.get('/api/transactions/totals?group_by=type,category', **self.auth_headers())
        by_type_groups = {t['group'] for t in data['by_type']}
        self.assertEqual(by_type_groups, {'income', 'expense'})

    def test_workspace_scoping(self):
        foreign = TransactionFactory()
        data = self.get('/api/transactions', **self.auth_headers())
        self.assertNotIn(foreign.id, [t['id'] for t in data['items']])


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

    def test_update_keeps_account_when_not_sent(self):
        AccountFactory(workspace=self.workspace, name='Second')  # two accounts now
        created = self.post('/api/transactions', self._payload(account_id=self.account.id), **self.auth_headers())

        data = self.put(
            f'/api/transactions/{created["id"]}', self._payload(description='Edited'), **self.auth_headers()
        )
        self.assertStatus(200)
        self.assertEqual(data['account_id'], self.account.id)

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


class TestDerivedPeriodServiceLevel(TestCase):
    """get_or_create_for_date is invoked with the transaction's own date."""

    def test_period_touch_uses_transaction_date(self):
        from common.tests.factories import UserFactory
        from workspaces.factories import WorkspaceFactory

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
