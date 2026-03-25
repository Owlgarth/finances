"""Tests for GDPR data import."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from budgets.models import Budget
from categories.models import Category
from common.tests.mixins import AuthMixin
from currency_exchanges.models import CurrencyExchange
from period_balances.models import PeriodBalance
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction
from users.services import UserService
from workspaces.factories import WorkspaceFactory
from workspaces.models import Workspace, WorkspaceMember

User = get_user_model()


class DataImportTests(AuthMixin, TestCase):
    """Tests for GDPR data import service."""

    def test_import_rejects_incompatible_version(self):
        """Import should reject exports with version 1.x."""
        export_data = {
            'export_version': '1.0',
            'workspaces': [],
        }

        from common.exceptions import ValidationError

        with self.assertRaises(ValidationError) as ctx:
            UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertIn('Incompatible export version', str(ctx.exception.message))

    def test_import_accepts_version_2_0(self):
        """Import should accept exports with version 2.0."""
        export_data = {
            'export_version': '2.0',
            'workspaces': [],
        }

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_workspaces'], 0)

    def test_import_creates_workspace(self):
        """Import should create a new workspace."""
        export_data = self._create_sample_export()

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_workspaces'], 1)
        self.assertTrue(User.objects.filter(email=self.user.email).first().current_workspace is not None)

    def test_import_skips_existing_workspace_with_skip_strategy(self):
        """Import with skip strategy should skip existing workspace."""
        export_data = self._create_sample_export()

        result = UserService.import_all_data(
            self.user,
            self._make_import_input(export_data, conflict_strategy='skip'),
        )

        self.assertEqual(result['imported_workspaces'], 1)

        result2 = UserService.import_all_data(
            self.user,
            self._make_import_input(export_data, conflict_strategy='skip'),
        )

        self.assertEqual(result2['imported_workspaces'], 0)
        self.assertIn('Test Import Workspace', result2['skipped']['workspaces'])

    def test_import_renames_workspace_with_rename_strategy(self):
        """Import with rename strategy should rename conflicting workspace."""
        export_data = self._create_sample_export()

        UserService.import_all_data(self.user, self._make_import_input(export_data))

        result = UserService.import_all_data(
            self.user,
            self._make_import_input(export_data, conflict_strategy='rename'),
        )

        self.assertEqual(result['imported_workspaces'], 1)
        self.assertIn('Test Import Workspace', result['renamed'])

    def test_import_filter_workspaces(self):
        """Import should filter workspaces when workspaces parameter is provided."""
        export_data = {
            'export_version': '2.0',
            'workspaces': [
                {'workspace_name': 'Workspace A', 'currencies': [], 'budget_accounts': []},
                {'workspace_name': 'Workspace B', 'currencies': [], 'budget_accounts': []},
            ],
        }

        result = UserService.import_all_data(
            self.user,
            self._make_import_input(export_data, workspaces=['Workspace A']),
        )

        self.assertEqual(result['imported_workspaces'], 1)

    def test_import_creates_budget_account_and_period(self):
        """Import should create budget accounts and periods."""
        export_data = self._create_sample_export_with_account()

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_budget_accounts'], 1)
        self.assertEqual(result['imported_budget_periods'], 1)

    def test_import_creates_transactions(self):
        """Import should create transactions."""
        export_data = self._create_sample_export_with_transactions()

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 2)
        self.assertEqual(result['imported_categories'], 1)

    def test_import_creates_budgets(self):
        """Import should create budgets."""
        export_data = self._create_sample_export_with_budgets()

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_budgets'], 1)

    def test_import_creates_planned_transactions(self):
        """Import should create planned transactions."""
        export_data = self._create_sample_export_with_planned_transactions()

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_planned_transactions'], 1)

    def test_import_creates_currency_exchanges(self):
        """Import should create currency exchanges."""
        export_data = self._create_sample_export_with_currency_exchanges()

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_currency_exchanges'], 1)

    def _make_import_input(self, data, workspaces=None, conflict_strategy='rename'):
        """Create FullImportIn-like object."""
        from core.schemas import FullImportIn

        return FullImportIn(data=data, workspaces=workspaces, conflict_strategy=conflict_strategy)

    def _create_sample_export(self):
        """Create a minimal valid export for testing."""
        return {
            'export_version': '2.0',
            'workspaces': [
                {
                    'workspace_name': 'Test Import Workspace',
                    'currencies': [],
                    'budget_accounts': [],
                }
            ],
        }

    def _create_sample_export_with_account(self):
        """Create an export with budget account and period."""
        return {
            'export_version': '2.0',
            'workspaces': [
                {
                    'workspace_name': 'Test Import Workspace',
                    'currencies': [{'symbol': 'USD', 'name': 'US Dollar'}],
                    'budget_accounts': [
                        {
                            'name': 'Test Account',
                            'description': 'Test description',
                            'default_currency': 'USD',
                            'is_active': True,
                            'periods': [
                                {
                                    'name': 'January 2024',
                                    'start_date': '2024-01-01',
                                    'end_date': '2024-01-31',
                                    'categories': [],
                                    'budgets': [],
                                    'transactions': [],
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

    def _create_sample_export_with_transactions(self):
        """Create an export with transactions."""
        return {
            'export_version': '2.0',
            'workspaces': [
                {
                    'workspace_name': 'Test Import Workspace',
                    'currencies': [{'symbol': 'USD', 'name': 'US Dollar'}],
                    'budget_accounts': [
                        {
                            'name': 'Test Account',
                            'description': 'Test description',
                            'default_currency': 'USD',
                            'is_active': True,
                            'periods': [
                                {
                                    'name': 'January 2024',
                                    'start_date': '2024-01-01',
                                    'end_date': '2024-01-31',
                                    'categories': [{'id': 1, 'name': 'Food'}],
                                    'budgets': [],
                                    'transactions': [
                                        {
                                            'date': '2024-01-15',
                                            'description': 'Groceries',
                                            'amount': '50.00',
                                            'type': 'expense',
                                            'category_name': 'Food',
                                            'currency_symbol': 'USD',
                                        },
                                        {
                                            'date': '2024-01-20',
                                            'description': 'Salary',
                                            'amount': '1000.00',
                                            'type': 'income',
                                            'category_name': None,
                                            'currency_symbol': 'USD',
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

    def _create_sample_export_with_budgets(self):
        """Create an export with budgets."""
        return {
            'export_version': '2.0',
            'workspaces': [
                {
                    'workspace_name': 'Test Import Workspace',
                    'currencies': [{'symbol': 'USD', 'name': 'US Dollar'}],
                    'budget_accounts': [
                        {
                            'name': 'Test Account',
                            'description': 'Test description',
                            'default_currency': 'USD',
                            'is_active': True,
                            'periods': [
                                {
                                    'name': 'January 2024',
                                    'start_date': '2024-01-01',
                                    'end_date': '2024-01-31',
                                    'categories': [{'id': 1, 'name': 'Food'}],
                                    'budgets': [
                                        {
                                            'category_name': 'Food',
                                            'amount': '500.00',
                                            'currency_symbol': 'USD',
                                        }
                                    ],
                                    'transactions': [],
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

    def _create_sample_export_with_planned_transactions(self):
        """Create an export with planned transactions."""
        return {
            'export_version': '2.0',
            'workspaces': [
                {
                    'workspace_name': 'Test Import Workspace',
                    'currencies': [{'symbol': 'USD', 'name': 'US Dollar'}],
                    'budget_accounts': [
                        {
                            'name': 'Test Account',
                            'description': 'Test description',
                            'default_currency': 'USD',
                            'is_active': True,
                            'periods': [
                                {
                                    'name': 'January 2024',
                                    'start_date': '2024-01-01',
                                    'end_date': '2024-01-31',
                                    'categories': [],
                                    'budgets': [],
                                    'transactions': [],
                                    'planned_transactions': [
                                        {
                                            'name': 'Rent',
                                            'amount': '1000.00',
                                            'planned_date': '2024-01-01',
                                            'payment_date': None,
                                            'status': 'pending',
                                            'currency_symbol': 'USD',
                                        }
                                    ],
                                    'currency_exchanges': [],
                                    'period_balances': [],
                                }
                            ],
                        }
                    ],
                }
            ],
        }

    def _create_sample_export_with_currency_exchanges(self):
        """Create an export with currency exchanges."""
        return {
            'export_version': '2.0',
            'workspaces': [
                {
                    'workspace_name': 'Test Import Workspace',
                    'currencies': [
                        {'symbol': 'USD', 'name': 'US Dollar'},
                        {'symbol': 'EUR', 'name': 'Euro'},
                    ],
                    'budget_accounts': [
                        {
                            'name': 'Test Account',
                            'description': 'Test description',
                            'default_currency': 'USD',
                            'is_active': True,
                            'periods': [
                                {
                                    'name': 'January 2024',
                                    'start_date': '2024-01-01',
                                    'end_date': '2024-01-31',
                                    'categories': [],
                                    'budgets': [],
                                    'transactions': [],
                                    'planned_transactions': [],
                                    'currency_exchanges': [
                                        {
                                            'date': '2024-01-10',
                                            'description': 'USD to EUR',
                                            'from_amount': '100.00',
                                            'to_amount': '92.00',
                                            'exchange_rate': '0.92',
                                            'from_currency_symbol': 'USD',
                                            'to_currency_symbol': 'EUR',
                                        }
                                    ],
                                    'period_balances': [],
                                }
                            ],
                        }
                    ],
                }
            ],
        }


class FullCycleImportExportTests(AuthMixin, TestCase):
    """Integration tests for complete export-import cycle."""

    def test_full_export_import_cycle(self):
        """Test complete cycle: export -> delete -> create user -> import -> verify."""
        from workspaces.demo_fixtures import create_demo_fixtures

        create_demo_fixtures(workspace_id=self.workspace.id, user_id=self.user.id)

        export_data = UserService.export_all_data(self.user)
        self.assertEqual(export_data['export_version'], '2.0')
        self.assertEqual(len(export_data['workspaces']), 1)

        original_workspace_id = self.workspace.id
        original_counts = self._count_records(original_workspace_id)

        UserService.delete_account(self.user, self.user_password)

        self.assertFalse(User.objects.filter(email=self.user.email).exists())
        self.assertFalse(Workspace.objects.filter(id=original_workspace_id).exists())

        new_user = User.objects.create_user(email='restored@test.com', password='newpass123', full_name='Restored User')

        import_input = self._make_import_input(export_data)
        result = UserService.import_all_data(new_user, import_input)

        self.assertEqual(result['imported_workspaces'], 1)
        self.assertEqual(result['imported_budget_accounts'], original_counts['accounts'])
        self.assertEqual(result['imported_budget_periods'], original_counts['periods'])
        self.assertEqual(result['imported_transactions'], original_counts['transactions'])

        restored_workspace = Workspace.objects.filter(owner=new_user).first()
        self.assertIsNotNone(restored_workspace)

        restored_counts = self._count_records(restored_workspace.id)
        self.assertEqual(restored_counts['accounts'], original_counts['accounts'])
        self.assertEqual(restored_counts['periods'], original_counts['periods'])
        self.assertEqual(restored_counts['transactions'], original_counts['transactions'])
        self.assertEqual(restored_counts['categories'], original_counts['categories'])
        self.assertEqual(restored_counts['budgets'], original_counts['budgets'])

    def test_full_cycle_with_multiple_workspaces(self):
        """Test export/import cycle with multiple workspaces."""
        workspace2 = WorkspaceFactory(name='Second Workspace')
        WorkspaceMember.objects.create(workspace=workspace2, user=self.user, role='owner')
        workspace2.owner = self.user
        workspace2.save()

        usd = workspace2.currencies.filter(symbol='USD').first()
        account2 = BudgetAccount.objects.create(
            workspace=workspace2, name='Account 2', default_currency=usd, created_by=self.user
        )
        period2 = BudgetPeriod.objects.create(
            workspace=workspace2,
            budget_account=account2,
            name='Period 2',
            start_date='2024-01-01',
            end_date='2024-01-31',
            created_by=self.user,
        )
        Transaction.objects.create(
            workspace=workspace2,
            budget_period=period2,
            date='2024-01-15',
            description='Transaction 2',
            amount=Decimal('200.00'),
            currency=usd,
            type='income',
            created_by=self.user,
        )

        export_data = UserService.export_all_data(self.user)
        self.assertEqual(len(export_data['workspaces']), 2)

        new_user = User.objects.create_user(email='multi@test.com', password='pass12345')
        result = UserService.import_all_data(new_user, self._make_import_input(export_data))

        self.assertEqual(result['imported_workspaces'], 2)
        self.assertEqual(Workspace.objects.filter(owner=new_user).count(), 2)

    def test_partial_import_single_workspace(self):
        """Test importing only specific workspaces."""
        from workspaces.demo_fixtures import create_demo_fixtures

        create_demo_fixtures(workspace_id=self.workspace.id, user_id=self.user.id)

        workspace2 = WorkspaceFactory(name='Target Workspace')
        WorkspaceMember.objects.create(workspace=workspace2, user=self.user, role='owner')
        workspace2.owner = self.user
        workspace2.save()

        export_data = UserService.export_all_data(self.user)
        self.assertEqual(len(export_data['workspaces']), 2)

        UserService.delete_account(self.user, self.user_password)

        new_user = User.objects.create_user(email='partial@test.com', password='pass12345')
        result = UserService.import_all_data(
            new_user, self._make_import_input(export_data, workspaces=['Target Workspace'])
        )

        self.assertEqual(result['imported_workspaces'], 1)
        restored = Workspace.objects.filter(owner=new_user)
        self.assertEqual(restored.count(), 1)
        self.assertEqual(restored.first().name, 'Target Workspace')

    def test_period_balance_preserved_on_import(self):
        """Test that period balances are preserved during import."""
        pln = self.workspace.currencies.filter(symbol='PLN').first()
        account = BudgetAccount.objects.create(
            workspace=self.workspace, name='Balance Test', default_currency=pln, created_by=self.user
        )
        period = BudgetPeriod.objects.create(
            workspace=self.workspace,
            budget_account=account,
            name='Balance Period',
            start_date='2024-01-01',
            end_date='2024-01-31',
            created_by=self.user,
        )

        PeriodBalance.objects.create(
            workspace=self.workspace,
            budget_period=period,
            currency=pln,
            opening_balance=Decimal('1000.00'),
            total_income=Decimal('500.00'),
            total_expenses=Decimal('300.00'),
            exchanges_in=Decimal('0'),
            exchanges_out=Decimal('0'),
            closing_balance=Decimal('1200.00'),
            created_by=self.user,
        )

        export_data = UserService.export_all_data(self.user)

        UserService.delete_account(self.user, self.user_password)
        new_user = User.objects.create_user(email='balance@test.com', password='pass12345')
        UserService.import_all_data(new_user, self._make_import_input(export_data))

        restored_workspace = Workspace.objects.filter(owner=new_user).first()
        restored_balance = PeriodBalance.objects.filter(workspace=restored_workspace).first()

        self.assertIsNotNone(restored_balance)
        self.assertEqual(restored_balance.opening_balance, Decimal('1000.00'))
        self.assertEqual(restored_balance.total_income, Decimal('500.00'))
        self.assertEqual(restored_balance.total_expenses, Decimal('300.00'))
        self.assertEqual(restored_balance.closing_balance, Decimal('1200.00'))

    def test_import_preserves_workspace_scoped_data_integrity(self):
        """Test that all imported records have correct workspace_id FK."""
        pln = self.workspace.currencies.filter(symbol='PLN').first()
        account = BudgetAccount.objects.create(
            workspace=self.workspace, name='Integrity Test', default_currency=pln, created_by=self.user
        )
        period = BudgetPeriod.objects.create(
            workspace=self.workspace,
            budget_account=account,
            name='Integrity Period',
            start_date='2024-01-01',
            end_date='2024-01-31',
            created_by=self.user,
        )
        category = Category.objects.create(
            workspace=self.workspace, budget_period=period, name='Integrity Category', created_by=self.user
        )
        Transaction.objects.create(
            workspace=self.workspace,
            budget_period=period,
            date='2024-01-15',
            description='Test',
            amount=Decimal('50.00'),
            currency=pln,
            type='expense',
            category=category,
            created_by=self.user,
        )
        Budget.objects.create(
            workspace=self.workspace,
            budget_period=period,
            category=category,
            currency=pln,
            amount=Decimal('500.00'),
            created_by=self.user,
        )
        PlannedTransaction.objects.create(
            workspace=self.workspace,
            budget_period=period,
            name='Planned',
            amount=Decimal('100.00'),
            currency=pln,
            planned_date='2024-01-20',
            status='pending',
            created_by=self.user,
        )

        export_data = UserService.export_all_data(self.user)

        UserService.delete_account(self.user, self.user_password)
        new_user = User.objects.create_user(email='integrity@test.com', password='pass12345')
        UserService.import_all_data(new_user, self._make_import_input(export_data))

        restored_workspace = Workspace.objects.filter(owner=new_user).first()
        ws_id = restored_workspace.id

        self.assertEqual(BudgetAccount.objects.filter(workspace_id=ws_id).count(), 2)
        self.assertEqual(BudgetPeriod.objects.filter(workspace_id=ws_id).count(), 1)
        self.assertEqual(Category.objects.filter(workspace_id=ws_id).count(), 1)
        self.assertEqual(Transaction.objects.filter(workspace_id=ws_id).count(), 1)
        self.assertEqual(Budget.objects.filter(workspace_id=ws_id).count(), 1)
        self.assertEqual(PlannedTransaction.objects.filter(workspace_id=ws_id).count(), 1)

    def _count_records(self, workspace_id: int) -> dict:
        """Count all records for a workspace."""
        return {
            'accounts': BudgetAccount.objects.filter(workspace_id=workspace_id).count(),
            'periods': BudgetPeriod.objects.filter(workspace_id=workspace_id).count(),
            'categories': Category.objects.filter(workspace_id=workspace_id).count(),
            'transactions': Transaction.objects.filter(workspace_id=workspace_id).count(),
            'budgets': Budget.objects.filter(workspace_id=workspace_id).count(),
            'planned': PlannedTransaction.objects.filter(workspace_id=workspace_id).count(),
            'exchanges': CurrencyExchange.objects.filter(workspace_id=workspace_id).count(),
            'balances': PeriodBalance.objects.filter(workspace_id=workspace_id).count(),
        }

    def _make_import_input(self, data, workspaces=None, conflict_strategy='rename'):
        """Create FullImportIn-like object."""
        from core.schemas import FullImportIn

        return FullImportIn(data=data, workspaces=workspaces, conflict_strategy=conflict_strategy)
