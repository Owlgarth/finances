"""Tests for account-based planned transactions (B7 semantics)."""

import json
from datetime import date
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from accounts.factories import AccountFactory
from budgeting.factories import BudgetFactory
from categories.factories import CategoryFactory
from common.enums import TotalsLabel
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService
from planned_transactions.factories import PlannedTransactionFactory
from planned_transactions.models import PlannedTransaction
from planned_transactions.services import PlannedTransactionService
from planned_transactions.tasks import execute_planned_transaction
from transactions.models import Transaction
from workspaces.models import WorkspaceMember


class PlannedTransactionTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base: one active PLN account + one USD account + categories."""

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        self.account = AccountFactory(workspace=self.workspace, name='Main')
        self.usd_account = AccountFactory(workspace=self.workspace, name='Dollars', currency=usd)

        self.budget = BudgetFactory(workspace=self.workspace)
        self.groceries = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Groceries')
        self.rent = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Rent')

        self.planned1 = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='Monthly Rent',
            amount=Decimal('1200.00'),
            category=self.rent,
            planned_date=date(2025, 1, 5),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )
        self.planned2 = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.account,
            name='Grocery Shopping',
            amount=Decimal('150.00'),
            category=self.groceries,
            planned_date=date(2025, 1, 15),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )
        self.planned3 = PlannedTransactionFactory(
            workspace=self.workspace,
            account=self.usd_account,
            name='US Subscription',
            amount=Decimal('30.00'),
            planned_date=date(2025, 2, 5),
            status='pending',
            created_by=self.user,
            updated_by=self.user,
        )

    def _payload(self, **overrides):
        payload = {
            'name': 'New Planned',
            'amount': '100.00',
            'account_id': self.account.id,
            'planned_date': '2025-01-20',
        }
        payload.update(overrides)
        return payload


class TestListPlannedTransactions(PlannedTransactionTestCase):
    def test_list_returns_all_planned_in_workspace(self):
        data = self.get('/api/planned-transactions', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data['items']), 3)

    def test_list_filtered_by_account(self):
        data = self.get(f'/api/planned-transactions?account_id={self.account.id}', **self.auth_headers())
        self.assertEqual(len(data['items']), 2)

        data = self.get(f'/api/planned-transactions?account_id={self.usd_account.id}', **self.auth_headers())
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(data['items'][0]['currency_code'], 'USD')

    def test_list_filtered_by_status(self):
        self.planned1.status = 'done'
        self.planned1.save()

        data = self.get('/api/planned-transactions?status=pending', **self.auth_headers())
        self.assertEqual(len(data['items']), 2)

        data = self.get('/api/planned-transactions?status=done', **self.auth_headers())
        self.assertEqual(len(data['items']), 1)

    def test_list_filtered_by_date_range(self):
        data = self.get('/api/planned-transactions?start_date=2025-01-01&end_date=2025-01-31', **self.auth_headers())
        self.assertEqual(len(data['items']), 2)

    def test_list_ordering_by_amount(self):
        data = self.get('/api/planned-transactions?ordering=-amount', **self.auth_headers())
        amounts = [item['amount'] for item in data['items']]
        self.assertEqual(amounts, ['1200.00', '150.00', '30.00'])

    def test_list_includes_account_and_category_fields(self):
        data = self.get(f'/api/planned-transactions?account_id={self.account.id}', **self.auth_headers())
        rent = next(item for item in data['items'] if item['name'] == 'Monthly Rent')
        self.assertEqual(rent['account_name'], 'Main')
        self.assertEqual(rent['currency_code'], 'PLN')
        self.assertEqual(rent['category']['name'], 'Rent')

    def test_list_filtered_by_search(self):
        data = self.get('/api/planned-transactions?search=RENT', **self.auth_headers())
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(data['items'][0]['name'], 'Monthly Rent')

    def test_list_filtered_by_category(self):
        data = self.get(f'/api/planned-transactions?category_id={self.groceries.id}', **self.auth_headers())
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(data['items'][0]['name'], 'Grocery Shopping')

        data = self.get(
            f'/api/planned-transactions?category_id={self.groceries.id}&category_id={self.rent.id}',
            **self.auth_headers(),
        )
        self.assertEqual(len(data['items']), 2)

    def test_list_filtered_by_budget(self):
        # planned3 has no category, so it falls outside any budget filter.
        data = self.get(f'/api/planned-transactions?budget_id={self.budget.id}', **self.auth_headers())
        self.assertEqual(len(data['items']), 2)

        other_budget = BudgetFactory(workspace=self.workspace)
        data = self.get(f'/api/planned-transactions?budget_id={other_budget.id}', **self.auth_headers())
        self.assertEqual(len(data['items']), 0)

    def test_list_filtered_by_multiple_accounts(self):
        data = self.get(
            f'/api/planned-transactions?account_id={self.account.id}&account_id={self.usd_account.id}',
            **self.auth_headers(),
        )
        self.assertEqual(len(data['items']), 3)

    def test_list_filtered_by_amount_range(self):
        data = self.get('/api/planned-transactions?amount_gte=100&amount_lte=200', **self.auth_headers())
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(data['items'][0]['name'], 'Grocery Shopping')

    def test_workspace_scoping(self):
        foreign = PlannedTransactionFactory()
        data = self.get('/api/planned-transactions', **self.auth_headers())
        self.assertNotIn(foreign.id, [item['id'] for item in data['items']])

    def test_list_without_auth_returns_401(self):
        self.get('/api/planned-transactions')
        self.assertStatus(401)


class TestPlannedTransactionTotals(PlannedTransactionTestCase):
    def test_totals_grouped_by_currency(self):
        data = self.get('/api/planned-transactions/totals', **self.auth_headers())
        self.assertStatus(200)
        as_map = {t['currency']: t['total'] for t in data['totals']}
        self.assertEqual(as_map['PLN'], '1350.00')  # 1200 + 150
        self.assertEqual(as_map['USD'], '30.00')

    def test_totals_grouped_by_category(self):
        data = self.get('/api/planned-transactions/totals?group_by=category', **self.auth_headers())
        groups = {t['group']: t['total'] for t in data['totals']}
        self.assertEqual(groups['Rent'], '1200.00')
        self.assertEqual(groups['Groceries'], '150.00')
        self.assertEqual(groups[str(TotalsLabel.UNCATEGORIZED)], '30.00')

    def test_totals_filtered_by_status_and_account(self):
        self.planned1.status = 'cancelled'
        self.planned1.save()

        data = self.get(
            f'/api/planned-transactions/totals?status=pending&account_id={self.account.id}',
            **self.auth_headers(),
        )
        self.assertEqual(len(data['totals']), 1)
        self.assertEqual(data['totals'][0]['total'], '150.00')

    def test_totals_filtered_by_budget(self):
        # The uncategorized USD subscription falls outside any budget filter.
        data = self.get(f'/api/planned-transactions/totals?budget_id={self.budget.id}', **self.auth_headers())
        as_map = {t['currency']: t['total'] for t in data['totals']}
        self.assertEqual(as_map, {'PLN': '1350.00'})

    def test_totals_filtered_by_search_and_amount(self):
        data = self.get('/api/planned-transactions/totals?search=rent&amount_gte=1000', **self.auth_headers())
        self.assertEqual(len(data['totals']), 1)
        self.assertEqual(data['totals'][0]['total'], '1200.00')

    def test_totals_filtered_by_multiple_accounts(self):
        data = self.get(
            f'/api/planned-transactions/totals?account_id={self.account.id}&account_id={self.usd_account.id}',
            **self.auth_headers(),
        )
        as_map = {t['currency']: t['total'] for t in data['totals']}
        self.assertEqual(as_map, {'PLN': '1350.00', 'USD': '30.00'})

    def test_totals_cross_workspace_isolation(self):
        PlannedTransactionFactory(amount=Decimal('9999.00'))
        data = self.get('/api/planned-transactions/totals', **self.auth_headers())
        totals = [t['total'] for t in data['totals']]
        self.assertNotIn('9999.00', totals)


class TestCreatePlannedTransaction(PlannedTransactionTestCase):
    def test_create_with_explicit_account(self):
        data = self.post('/api/planned-transactions', self._payload(), **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['account_id'], self.account.id)
        self.assertEqual(data['currency_code'], 'PLN')
        self.assertEqual(data['status'], 'pending')

    def test_create_defaults_to_single_active_account(self):
        self.usd_account.is_archived = True
        self.usd_account.save()

        payload = self._payload()
        payload.pop('account_id')
        data = self.post('/api/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['account_id'], self.account.id)

    def test_create_without_account_and_two_active_accounts_returns_400(self):
        payload = self._payload()
        payload.pop('account_id')
        self.post('/api/planned-transactions', payload, **self.auth_headers())
        self.assertStatus(400)

    def test_create_on_archived_account_returns_400(self):
        self.account.is_archived = True
        self.account.save()
        self.post('/api/planned-transactions', self._payload(), **self.auth_headers())
        self.assertStatus(400)

    def test_create_on_foreign_account_returns_404(self):
        foreign = AccountFactory()
        self.post('/api/planned-transactions', self._payload(account_id=foreign.id), **self.auth_headers())
        self.assertStatus(404)

    def test_create_with_archived_category_returns_400(self):
        archived = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Old', is_archived=True)
        self.post('/api/planned-transactions', self._payload(category_id=archived.id), **self.auth_headers())
        self.assertStatus(400)

    def test_create_with_status_done_creates_transaction(self):
        initial_count = Transaction.objects.count()

        data = self.post(
            '/api/planned-transactions',
            self._payload(name='Paid Bill', amount='200.00', status='done'),
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertEqual(data['status'], 'done')
        self.assertEqual(data['payment_date'], '2025-01-20')
        self.assertIsNotNone(data['transaction_id'])
        self.assertEqual(Transaction.objects.count(), initial_count + 1)

        created = Transaction.objects.get(id=data['transaction_id'])
        self.assertEqual(created.account_id, self.account.id)

    def test_viewer_cannot_create(self):
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.post('/api/planned-transactions', self._payload(), **self.auth_headers())
        self.assertStatus(403)


class TestUpdatePlannedTransaction(PlannedTransactionTestCase):
    def test_update_planned(self):
        data = self.put(
            f'/api/planned-transactions/{self.planned1.id}',
            self._payload(name='Updated Rent', amount='1300.00'),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Updated Rent')
        self.assertEqual(data['amount'], '1300.00')

    def test_update_moves_between_accounts(self):
        data = self.put(
            f'/api/planned-transactions/{self.planned1.id}',
            self._payload(account_id=self.usd_account.id),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['account_id'], self.usd_account.id)
        self.assertEqual(data['currency_code'], 'USD')

    def test_update_status_to_done_creates_transaction(self):
        initial_count = Transaction.objects.count()

        data = self.put(
            f'/api/planned-transactions/{self.planned1.id}',
            self._payload(name='Monthly Rent', amount='1200.00', planned_date='2025-01-05', status='done'),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['status'], 'done')
        self.assertIsNotNone(data['transaction_id'])
        self.assertEqual(Transaction.objects.count(), initial_count + 1)

    def test_update_done_recategorizes_without_revert_or_reexecution(self):
        """Editing a done planned (status echoed back) recategorizes it without
        tripping the revert guard and without executing again."""
        self.planned1.status = 'done'
        self.planned1.save()
        initial_count = Transaction.objects.count()

        data = self.put(
            f'/api/planned-transactions/{self.planned1.id}',
            self._payload(status='done', category_id=self.groceries.id),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['status'], 'done')
        self.assertEqual(data['category']['name'], 'Groceries')
        self.assertEqual(Transaction.objects.count(), initial_count)

    def test_update_cannot_revert_from_done(self):
        self.planned1.status = 'done'
        self.planned1.save()

        self.put(
            f'/api/planned-transactions/{self.planned1.id}',
            self._payload(status='pending'),
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_update_foreign_planned_returns_404(self):
        foreign = PlannedTransactionFactory()
        self.put(f'/api/planned-transactions/{foreign.id}', self._payload(), **self.auth_headers())
        self.assertStatus(404)


class TestDeletePlannedTransaction(PlannedTransactionTestCase):
    def test_delete(self):
        self.delete(f'/api/planned-transactions/{self.planned1.id}', **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(PlannedTransaction.objects.filter(id=self.planned1.id).exists())

    def test_viewer_cannot_delete(self):
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.delete(f'/api/planned-transactions/{self.planned1.id}', **self.auth_headers())
        self.assertStatus(403)


class TestExecutePlannedTransaction(PlannedTransactionTestCase):
    def test_execute_planned_success(self):
        initial_count = Transaction.objects.count()

        data = self.post(
            f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05',
            {},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['status'], 'done')
        self.assertEqual(data['payment_date'], '2025-01-05')
        self.assertIsNotNone(data['transaction_id'])

        self.assertEqual(Transaction.objects.count(), initial_count + 1)
        created = Transaction.objects.get(id=data['transaction_id'])
        self.assertEqual(created.account_id, self.planned1.account_id)
        self.assertEqual(created.amount, Decimal('1200.00'))
        self.assertEqual(created.type, 'expense')
        self.assertEqual(created.category_id, self.rent.id)

    def test_execute_planned_twice_fails(self):
        self.post(
            f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05',
            {},
            **self.auth_headers(),
        )
        self.post(
            f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-06',
            {},
            **self.auth_headers(),
        )
        self.assertStatus(400)

    def test_execute_planned_not_found(self):
        self.post('/api/planned-transactions/99999/execute?payment_date=2025-01-05', {}, **self.auth_headers())
        self.assertStatus(404)

    def test_execute_as_viewer_fails(self):
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self.post(
            f'/api/planned-transactions/{self.planned1.id}/execute?payment_date=2025-01-05',
            {},
            **self.auth_headers(),
        )
        self.assertStatus(403)


class TestExecutePlannedTransactionTask(PlannedTransactionTestCase):
    """Direct task invocation tests."""

    def test_task_creates_transaction_on_planned_account(self):
        initial_count = Transaction.objects.count()

        self.planned3.status = 'done'
        self.planned3.payment_date = date(2025, 2, 5)
        self.planned3.save()

        execute_planned_transaction(self.planned3.id)

        self.assertEqual(Transaction.objects.count(), initial_count + 1)
        self.planned3.refresh_from_db()
        created = Transaction.objects.get(id=self.planned3.transaction_id)
        # Lands on the planned row's own account, even with multiple accounts
        self.assertEqual(created.account_id, self.usd_account.id)

    def test_task_idempotent_on_duplicate_call(self):
        self.planned1.status = 'done'
        self.planned1.payment_date = date(2025, 1, 5)
        self.planned1.save()

        execute_planned_transaction(self.planned1.id)
        count_after_first = Transaction.objects.count()

        execute_planned_transaction(self.planned1.id)
        self.assertEqual(Transaction.objects.count(), count_after_first)

    def test_task_handles_missing_planned_transaction_gracefully(self):
        initial_count = Transaction.objects.count()
        execute_planned_transaction(99999)
        self.assertEqual(Transaction.objects.count(), initial_count)

    def test_task_skips_without_payment_date(self):
        initial_count = Transaction.objects.count()
        execute_planned_transaction(self.planned1.id)  # payment_date is None
        self.assertEqual(Transaction.objects.count(), initial_count)
        self.planned1.refresh_from_db()
        self.assertIsNone(self.planned1.transaction_id)


class TestExecutePlannedTransactionDispatch(PlannedTransactionTestCase):
    """Service.execute dispatches the task (CELERY_TASK_ALWAYS_EAGER)."""

    def test_execute_dispatches_task_and_creates_transaction(self):
        initial_count = Transaction.objects.count()

        PlannedTransactionService.execute(
            user=self.user,
            workspace_id=self.workspace.id,
            planned_id=self.planned1.id,
            payment_date=date(2025, 1, 5),
        )

        self.assertEqual(Transaction.objects.count(), initial_count + 1)
        self.planned1.refresh_from_db()
        self.assertEqual(self.planned1.status, 'done')
        self.assertEqual(self.planned1.payment_date, date(2025, 1, 5))
        self.assertIsNotNone(self.planned1.transaction_id)

    def test_execute_returns_planned_with_transaction_id(self):
        result = PlannedTransactionService.execute(
            user=self.user,
            workspace_id=self.workspace.id,
            planned_id=self.planned1.id,
            payment_date=date(2025, 1, 5),
        )
        self.assertEqual(result.status, 'done')
        self.assertIsNotNone(result.transaction_id)


class TestExecutePlannedTransactionConfig(TestCase):
    """Task retry configuration stays unchanged."""

    def test_retry_config(self):
        self.assertEqual(execute_planned_transaction.max_retries, 3)
        self.assertEqual(execute_planned_transaction.autoretry_for, (Exception,))
        self.assertTrue(execute_planned_transaction.retry_backoff)


class TestExportImportPlanned(PlannedTransactionTestCase):
    def test_export_includes_account_and_currency(self):
        response = self.client.get('/api/planned-transactions/export/', **self.auth_headers())
        self.assertEqual(response.status_code, 200)
        rows = json.loads(response.content)
        self.assertEqual(len(rows), 3)
        rent = next(r for r in rows if r['name'] == 'Monthly Rent')
        self.assertEqual(rent['account_name'], 'Main')
        self.assertEqual(rent['currency_code'], 'PLN')
        self.assertEqual(rent['category_name'], 'Rent')

    def test_export_with_status_filter(self):
        self.planned1.status = 'done'
        self.planned1.save()
        response = self.client.get('/api/planned-transactions/export/?status=pending', **self.auth_headers())
        rows = json.loads(response.content)
        self.assertEqual(len(rows), 2)

    def test_import_lands_rows_in_given_account(self):
        rows = [
            {'name': 'Imported A', 'amount': '10.00', 'planned_date': '2025-03-01'},
            {'name': 'Imported B', 'amount': '20.00', 'planned_date': '2025-03-02', 'category_name': 'Groceries'},
        ]
        upload = SimpleUploadedFile('rows.json', json.dumps(rows).encode(), content_type='application/json')
        response = self.client.post(
            '/api/planned-transactions/import',
            {'account_id': self.account.id, 'budget_id': self.budget.id, 'file': upload},
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 201)

        imported = PlannedTransaction.objects.filter(account=self.account, name__startswith='Imported')
        self.assertEqual(imported.count(), 2)
        self.assertEqual(imported.get(name='Imported B').category_id, self.groceries.id)
        self.assertTrue(all(pt.status == 'pending' for pt in imported))

    def test_import_invalid_json_returns_400(self):
        upload = SimpleUploadedFile('rows.json', b'not json', content_type='application/json')
        response = self.client.post(
            '/api/planned-transactions/import',
            {'account_id': self.account.id, 'file': upload},
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 400)


class TestPlannedPagination(PlannedTransactionTestCase):
    def test_pagination(self):
        for i in range(30):
            PlannedTransactionFactory(
                workspace=self.workspace,
                account=self.account,
                name=f'Bulk {i}',
                planned_date=date(2025, 3, 1),
            )

        data = self.get('/api/planned-transactions?page_size=25', **self.auth_headers())
        self.assertEqual(len(data['items']), 25)
        self.assertEqual(data['total'], 33)
        self.assertEqual(data['total_pages'], 2)

        data = self.get('/api/planned-transactions?page=2&page_size=25', **self.auth_headers())
        self.assertEqual(len(data['items']), 8)
