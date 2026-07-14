"""Tests for the legacy (v1/v2) import endpoint (design doc §6.1)."""

from decimal import Decimal

from django.test import TestCase

from accounts.models import Account
from accounts.services import AccountService
from budgeting.models import Budget, CategoryBudget, Period
from categories.models import Category
from common.tests.mixins import AuthMixin
from currencies.models import Currency
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction
from transfers.models import Transfer
from users.legacy_import import LegacyImportService
from workspaces.models import Workspace


def _legacy_v2_export():
    """A representative old-format (v2) export with one workspace.

    Includes two currencies, a budget account with one period holding
    categories, an allocation, income/expense transactions, a planned
    transaction, a currency exchange, the two auto-created linked exchange
    transactions (to be deduped), and period balances for the opening solve.
    """
    return {
        'export_version': '2.0',
        'workspaces': [
            {
                'workspace_name': 'Legacy Workspace',
                'currencies': [
                    {'id': 1, 'symbol': 'PLN', 'name': 'Polish Zloty'},
                    {'id': 2, 'symbol': 'USD', 'name': 'US Dollar'},
                ],
                'budget_accounts': [
                    {
                        'name': 'Household',
                        'description': 'Main account',
                        'default_currency': 'PLN',
                        'is_active': True,
                        'periods': [
                            {
                                'name': 'January 2025',
                                'start_date': '2025-01-01',
                                'end_date': '2025-01-31',
                                'categories': [{'id': 1, 'name': 'Food'}, {'id': 2, 'name': 'Salary'}],
                                'budgets': [
                                    {'category_name': 'Food', 'amount': '1500.00', 'currency_symbol': 'PLN'},
                                ],
                                'transactions': [
                                    # Real records
                                    {
                                        'date': '2025-01-10',
                                        'description': 'Salary',
                                        'amount': '5000.00',
                                        'type': 'income',
                                        'category_name': 'Salary',
                                        'currency_symbol': 'PLN',
                                    },
                                    {
                                        'date': '2025-01-12',
                                        'description': 'Groceries',
                                        'amount': '300.00',
                                        'type': 'expense',
                                        'category_name': 'Food',
                                        'currency_symbol': 'PLN',
                                    },
                                    # Linked exchange pair (auto-created by old FE) — must be deduped
                                    {
                                        'date': '2025-01-15',
                                        'description': 'Currency exchange: PLN → USD',
                                        'amount': '400.00',
                                        'type': 'expense',
                                        'category_name': None,
                                        'currency_symbol': 'PLN',
                                    },
                                    {
                                        'date': '2025-01-15',
                                        'description': 'Currency exchange: PLN → USD',
                                        'amount': '100.00',
                                        'type': 'income',
                                        'category_name': None,
                                        'currency_symbol': 'USD',
                                    },
                                ],
                                'planned_transactions': [
                                    {
                                        'name': 'Rent',
                                        'amount': '2000.00',
                                        'planned_date': '2025-01-25',
                                        'payment_date': None,
                                        'status': 'pending',
                                        'currency_symbol': 'PLN',
                                    },
                                ],
                                'currency_exchanges': [
                                    {
                                        'date': '2025-01-15',
                                        'description': 'Currency exchange: PLN → USD',
                                        'from_amount': '400.00',
                                        'to_amount': '100.00',
                                        'exchange_rate': '0.25',
                                        'from_currency_symbol': 'PLN',
                                        'to_currency_symbol': 'USD',
                                    },
                                ],
                                'period_balances': [
                                    {
                                        'currency_symbol': 'PLN',
                                        'opening_balance': '0.00',
                                        'total_income': '5000.00',
                                        'total_expenses': '300.00',
                                        'exchanges_in': '0.00',
                                        'exchanges_out': '400.00',
                                        'closing_balance': '4300.00',
                                        'note': '',
                                    },
                                    {
                                        'currency_symbol': 'USD',
                                        'opening_balance': '0.00',
                                        'total_income': '0.00',
                                        'total_expenses': '0.00',
                                        'exchanges_in': '100.00',
                                        'exchanges_out': '0.00',
                                        'closing_balance': '100.00',
                                        'note': '',
                                    },
                                ],
                            }
                        ],
                    }
                ],
            }
        ],
    }


class TestLegacyImportService(AuthMixin, TestCase):
    def test_import_creates_workspace_and_structure(self):
        report = LegacyImportService.import_legacy(self.user, _legacy_v2_export())

        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')

        budget = Budget.objects.get(workspace=ws, name='Household')
        self.assertEqual(Period.objects.filter(budget=budget).count(), 1)
        self.assertTrue(Period.objects.filter(budget=budget, is_custom=True).exists())

        period = Period.objects.get(budget=budget)
        self.assertEqual(period.name, 'January 2025')
        self.assertEqual(str(period.start_date), '2025-01-01')

        # Categories merged
        self.assertEqual(Category.objects.filter(budget=budget).count(), 2)
        # Allocation → CategoryBudget
        cb = CategoryBudget.objects.get(period=period, category__name='Food')
        self.assertEqual(cb.amount, Decimal('1500.00'))
        self.assertEqual(cb.currency.code, 'PLN')

        self.assertEqual(len(report['workspaces']), 1)
        wr = report['workspaces'][0]
        self.assertEqual(wr['created']['budgets'], 1)
        self.assertEqual(wr['created']['periods'], 1)
        self.assertEqual(wr['created']['categories'], 2)

    def test_income_transaction_keeps_category(self):
        LegacyImportService.import_legacy(self.user, _legacy_v2_export())
        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')

        salary = Transaction.objects.get(workspace=ws, description='Salary')
        self.assertEqual(salary.type, 'income')
        self.assertIsNotNone(salary.category)
        self.assertEqual(salary.category.name, 'Salary')

    def test_report_includes_created_budgets(self):
        report = LegacyImportService.import_legacy(self.user, _legacy_v2_export())
        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')
        budget = Budget.objects.get(workspace=ws, name='Household')

        wr = report['workspaces'][0]
        self.assertEqual(wr['workspace_id'], ws.id)
        self.assertEqual(wr['budgets'], [{'id': budget.id, 'name': 'Household'}])

    def test_accounts_created_per_currency(self):
        LegacyImportService.import_legacy(self.user, _legacy_v2_export())
        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')

        names = set(Account.objects.filter(workspace=ws).values_list('name', flat=True))
        self.assertEqual(names, {'Main PLN', 'Main USD'})

    def test_linked_exchange_transactions_deduped(self):
        report = LegacyImportService.import_legacy(self.user, _legacy_v2_export())
        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')

        # Only the 2 real transactions imported; the linked pair skipped.
        self.assertEqual(Transaction.objects.filter(workspace=ws).count(), 2)
        descriptions = set(Transaction.objects.filter(workspace=ws).values_list('description', flat=True))
        self.assertEqual(descriptions, {'Salary', 'Groceries'})

        # The exchange became a transfer.
        self.assertEqual(Transfer.objects.filter(workspace=ws).count(), 1)
        transfer = Transfer.objects.get(workspace=ws)
        self.assertEqual(transfer.from_account.name, 'Main PLN')
        self.assertEqual(transfer.to_account.name, 'Main USD')
        self.assertEqual(transfer.from_amount, Decimal('400.00'))
        self.assertEqual(transfer.to_amount, Decimal('100.00'))

        wr = report['workspaces'][0]
        self.assertEqual(len(wr['deduped_transactions']), 2)
        self.assertEqual(wr['created']['transfers'], 1)
        self.assertEqual(wr['created']['transactions'], 2)

    def test_manual_convention_description_deduped(self):
        export = _legacy_v2_export()
        txs = export['workspaces'][0]['budget_accounts'][0]['periods'][0]['transactions']
        # Rewrite the linked pair to use the manual "<FROM> to <TO>" convention.
        txs[2]['description'] = 'PLN to USD'
        txs[3]['description'] = 'PLN to USD'

        LegacyImportService.import_legacy(self.user, export)
        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')
        self.assertEqual(Transaction.objects.filter(workspace=ws).count(), 2)

    def test_opening_balances_solved_to_match_closings(self):
        report = LegacyImportService.import_legacy(self.user, _legacy_v2_export())
        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')

        pln = Account.objects.get(workspace=ws, name='Main PLN')
        usd = Account.objects.get(workspace=ws, name='Main USD')

        # Computed balances equal the exported latest closing balances.
        self.assertEqual(AccountService.balance(pln), Decimal('4300.00'))
        self.assertEqual(AccountService.balance(usd), Decimal('100.00'))

        wr = report['workspaces'][0]
        self.assertTrue(all(row['matches'] for row in wr['balances']))
        self.assertEqual(wr['warnings'], [])

    def test_planned_transaction_imported(self):
        LegacyImportService.import_legacy(self.user, _legacy_v2_export())
        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')
        planned = PlannedTransaction.objects.get(workspace=ws, name='Rent')
        self.assertEqual(planned.account.name, 'Main PLN')
        self.assertEqual(planned.amount, Decimal('2000.00'))

    def test_reimport_does_not_duplicate_accounts(self):
        LegacyImportService.import_legacy(self.user, _legacy_v2_export())
        # Re-import with skip: workspace exists, so it's skipped — accounts unchanged.
        LegacyImportService.import_legacy(self.user, _legacy_v2_export(), conflict_strategy='skip')

        ws = Workspace.objects.filter(owner=self.user, name='Legacy Workspace')
        self.assertEqual(ws.count(), 1)
        self.assertEqual(Account.objects.filter(workspace=ws.first(), name='Main PLN').count(), 1)

    def test_rename_strategy_on_conflict(self):
        LegacyImportService.import_legacy(self.user, _legacy_v2_export())
        report = LegacyImportService.import_legacy(self.user, _legacy_v2_export(), conflict_strategy='rename')
        self.assertIn('Legacy Workspace', report['renamed'])
        self.assertEqual(Workspace.objects.filter(owner=self.user, name__startswith='Legacy Workspace').count(), 2)

    def test_conflict_check_scoped_to_own_workspaces(self):
        """Another tenant's workspace with the same name must not trigger a rename (or leak)."""
        from workspaces.factories import WorkspaceFactory

        WorkspaceFactory(name='Legacy Workspace')

        report = LegacyImportService.import_legacy(self.user, _legacy_v2_export())

        self.assertEqual(report['renamed'], {})
        self.assertTrue(Workspace.objects.filter(owner=self.user, name='Legacy Workspace').exists())

    def test_unparseable_amount_warns_instead_of_masking(self):
        """Garbled amounts become 0 with a warning — the opening-balance solve must not hide them."""
        export = _legacy_v2_export()
        export['workspaces'][0]['budget_accounts'][0]['periods'][0]['transactions'][1]['amount'] = 'garbage'

        report = LegacyImportService.import_legacy(self.user, export)

        warnings = report['workspaces'][0]['warnings']
        self.assertTrue(any('unparseable amount' in w for w in warnings), warnings)

    def test_missing_transaction_date_raises_validation_error(self):
        from common.exceptions import ValidationError

        export = _legacy_v2_export()
        export['workspaces'][0]['budget_accounts'][0]['periods'][0]['transactions'][0]['date'] = None

        with self.assertRaises(ValidationError):
            LegacyImportService.import_legacy(self.user, export)

    def test_unknown_transaction_type_skipped_with_warning(self):
        export = _legacy_v2_export()
        export['workspaces'][0]['budget_accounts'][0]['periods'][0]['transactions'][1]['type'] = 'weird'

        report = LegacyImportService.import_legacy(self.user, export)

        warnings = report['workspaces'][0]['warnings']
        self.assertTrue(any('unknown type' in w for w in warnings), warnings)
        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')
        self.assertFalse(Transaction.objects.filter(workspace=ws, description='Groceries').exists())

    def test_unmappable_currency_becomes_custom(self):
        export = _legacy_v2_export()
        # A symbol with no ISO catalog match.
        export['workspaces'][0]['currencies'].append({'id': 3, 'symbol': 'ZZZ', 'name': 'Testcoin'})
        LegacyImportService.import_legacy(self.user, export)

        ws = Workspace.objects.get(owner=self.user, name='Legacy Workspace')
        custom = Currency.objects.get(workspace=ws, code='ZZZ')
        self.assertTrue(custom.is_custom)

    def test_v1_export_normalized(self):
        # v1 used ORM key names; the normalizer renames them.
        v1 = {
            'export_version': '1.0',
            'workspaces': [
                {
                    'workspace_name': 'V1 Workspace',
                    'currencies': [{'symbol': 'PLN', 'name': 'Polish Zloty'}],
                    'budget_accounts': [
                        {
                            'name': 'Main',
                            'default_currency': 'PLN',
                            'periods': [
                                {
                                    'name': 'Jan 2025',
                                    'start_date': '2025-01-01',
                                    'end_date': '2025-01-31',
                                    'categories': [{'name': 'Food'}],
                                    'budgets': [],
                                    'transactions': [
                                        {
                                            'date': '2025-01-10',
                                            'description': 'Shop',
                                            'amount': '50.00',
                                            'type': 'expense',
                                            'category__name': 'Food',
                                            'currency__symbol': 'PLN',
                                        },
                                    ],
                                    'planned_transactions': [],
                                    'currency_exchanges': [],
                                    'period_balances': [],
                                }
                            ],
                        }
                    ],
                }
            ],
        }
        LegacyImportService.import_legacy(self.user, v1)
        ws = Workspace.objects.get(owner=self.user, name='V1 Workspace')
        tx = Transaction.objects.get(workspace=ws, description='Shop')
        self.assertEqual(tx.category.name, 'Food')
        self.assertEqual(tx.account.name, 'Main PLN')


class TestLegacyImportEndpoint(AuthMixin, TestCase):
    def test_endpoint_returns_report(self):
        response = self.client.post(
            '/api/users/import-legacy',
            data={'data': _legacy_v2_export(), 'conflict_strategy': 'rename'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.auth_token}',
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body['workspaces']), 1)
        self.assertEqual(body['workspaces'][0]['created']['transactions'], 2)
        self.assertEqual(len(body['workspaces'][0]['deduped_transactions']), 2)
        self.assertIn('workspace_id', body['workspaces'][0])
        self.assertEqual([b['name'] for b in body['workspaces'][0]['budgets']], ['Household'])

    def test_endpoint_requires_auth(self):
        response = self.client.post(
            '/api/users/import-legacy',
            data={'data': _legacy_v2_export()},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 401)
