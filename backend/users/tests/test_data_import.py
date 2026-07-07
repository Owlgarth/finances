"""Tests for GDPR data import (account-based model).

Full v3 round-trip and legacy v1/v2 coverage arrive in B10/B11; these tests
cover import version handling, workspace conflict strategies, and importing
the v2-new export shape (accounts / transactions / transfers / planned).
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.factories import AccountFactory
from accounts.models import Account
from common.tests.mixins import AuthMixin
from planned_transactions.factories import PlannedTransactionFactory
from planned_transactions.models import PlannedTransaction
from transactions.factories import TransactionFactory
from transactions.models import Transaction
from transfers.models import Transfer
from users.services import UserService
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.models import Workspace

User = get_user_model()


class DataImportTests(AuthMixin, TestCase):
    """Tests for UserService.import_all_data."""

    def _make_import_input(self, data, workspaces=None, conflict_strategy='rename'):
        from core.schemas import FullImportIn

        return FullImportIn(data=data, workspaces=workspaces, conflict_strategy=conflict_strategy)

    def _minimal_export(self, name='Imported Workspace', **ws_extra):
        ws = {'workspace_name': name, 'accounts': [], 'transactions': [], 'transfers': [], 'planned_transactions': []}
        ws.update(ws_extra)
        return {'export_version': '2.0', 'workspaces': [ws]}

    def test_import_rejects_incompatible_version(self):
        from common.exceptions import ValidationError

        export_data = {'export_version': '9.0', 'workspaces': []}
        with self.assertRaises(ValidationError):
            UserService.import_all_data(self.user, self._make_import_input(export_data))

    def test_import_accepts_version_1_0(self):
        export_data = {'export_version': '1.0', 'workspaces': []}
        result = UserService.import_all_data(self.user, self._make_import_input(export_data))
        self.assertEqual(result['imported_workspaces'], 0)

    def test_import_accepts_version_2_0(self):
        export_data = {'export_version': '2.0', 'workspaces': []}
        result = UserService.import_all_data(self.user, self._make_import_input(export_data))
        self.assertEqual(result['imported_workspaces'], 0)

    def test_import_creates_workspace(self):
        result = UserService.import_all_data(self.user, self._make_import_input(self._minimal_export()))
        self.assertEqual(result['imported_workspaces'], 1)
        self.assertTrue(Workspace.objects.filter(owner=self.user, name='Imported Workspace').exists())

    def test_import_skips_existing_workspace_with_skip_strategy(self):
        UserService.import_all_data(self.user, self._make_import_input(self._minimal_export()))
        result = UserService.import_all_data(
            self.user, self._make_import_input(self._minimal_export(), conflict_strategy='skip')
        )
        self.assertEqual(result['imported_workspaces'], 0)
        self.assertIn('Imported Workspace', result['skipped']['workspaces'])

    def test_import_renames_workspace_with_rename_strategy(self):
        UserService.import_all_data(self.user, self._make_import_input(self._minimal_export()))
        result = UserService.import_all_data(
            self.user, self._make_import_input(self._minimal_export(), conflict_strategy='rename')
        )
        self.assertEqual(result['imported_workspaces'], 1)
        self.assertIn('Imported Workspace', result['renamed'])

    def test_import_filter_workspaces(self):
        export_data = {
            'export_version': '2.0',
            'workspaces': [
                {'workspace_name': 'Workspace A', 'accounts': [], 'transactions': []},
                {'workspace_name': 'Workspace B', 'accounts': [], 'transactions': []},
            ],
        }
        result = UserService.import_all_data(
            self.user, self._make_import_input(export_data, workspaces=['Workspace A'])
        )
        self.assertEqual(result['imported_workspaces'], 1)

    def test_import_creates_accounts(self):
        export_data = self._minimal_export(
            accounts=[
                {
                    'name': 'Checking',
                    'type': 'bank',
                    'currency_code': 'PLN',
                    'opening_balance': '100.00',
                    'is_archived': False,
                },
                {
                    'name': 'Dollars',
                    'type': 'bank',
                    'currency_code': 'USD',
                    'opening_balance': '0.00',
                    'is_archived': False,
                },
            ]
        )
        result = UserService.import_all_data(self.user, self._make_import_input(export_data))
        self.assertEqual(result['imported_accounts'], 2)

        workspace = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        checking = Account.objects.get(workspace=workspace, name='Checking')
        self.assertEqual(checking.currency.code, 'PLN')
        self.assertEqual(checking.opening_balance, Decimal('100.00'))

    def test_import_lands_transactions_on_named_accounts(self):
        export_data = self._minimal_export(
            accounts=[{'name': 'Checking', 'type': 'bank', 'currency_code': 'PLN'}],
            transactions=[
                {
                    'date': '2025-01-15',
                    'description': 'Groceries',
                    'amount': '40.00',
                    'type': 'expense',
                    'account_name': 'Checking',
                    'currency_code': 'PLN',
                },
            ],
        )
        result = UserService.import_all_data(self.user, self._make_import_input(export_data))
        self.assertEqual(result['imported_transactions'], 1)

        workspace = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        tx = Transaction.objects.get(workspace=workspace, description='Groceries')
        self.assertEqual(tx.account.name, 'Checking')

    def test_import_transactions_without_named_account_use_main_account(self):
        # Older exports carry only a currency_code — land in per-currency 'Main <CODE>'.
        export_data = self._minimal_export(
            transactions=[
                {
                    'date': '2025-01-15',
                    'description': 'Legacy tx',
                    'amount': '10.00',
                    'type': 'expense',
                    'currency_code': 'USD',
                },
            ]
        )
        result = UserService.import_all_data(self.user, self._make_import_input(export_data))
        self.assertEqual(result['imported_transactions'], 1)

        workspace = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        tx = Transaction.objects.get(workspace=workspace, description='Legacy tx')
        self.assertEqual(tx.account.name, 'Main USD')

    def test_import_creates_transfers(self):
        export_data = self._minimal_export(
            accounts=[
                {'name': 'Checking', 'type': 'bank', 'currency_code': 'PLN'},
                {'name': 'Savings', 'type': 'bank', 'currency_code': 'PLN'},
            ],
            transfers=[
                {
                    'date': '2025-01-20',
                    'description': 'Savings',
                    'from_account_name': 'Checking',
                    'from_amount': '50.00',
                    'to_account_name': 'Savings',
                    'to_amount': '50.00',
                },
            ],
        )
        result = UserService.import_all_data(self.user, self._make_import_input(export_data))
        self.assertEqual(result['imported_transfers'], 1)

        workspace = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        transfer = Transfer.objects.get(workspace=workspace)
        self.assertEqual(transfer.from_account.name, 'Checking')
        self.assertEqual(transfer.to_account.name, 'Savings')

    def test_import_creates_planned_transactions(self):
        export_data = self._minimal_export(
            accounts=[{'name': 'Checking', 'type': 'bank', 'currency_code': 'PLN'}],
            planned_transactions=[
                {
                    'name': 'Rent',
                    'amount': '2000.00',
                    'planned_date': '2025-02-01',
                    'status': 'pending',
                    'account_name': 'Checking',
                    'currency_code': 'PLN',
                },
            ],
        )
        result = UserService.import_all_data(self.user, self._make_import_input(export_data))
        self.assertEqual(result['imported_planned_transactions'], 1)

        workspace = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        self.assertTrue(PlannedTransaction.objects.filter(workspace=workspace, name='Rent').exists())


class FullCycleImportExportTests(AuthMixin, TestCase):
    """Export → wipe → import round-trip on the account-based model."""

    def _make_import_input(self, data, workspaces=None, conflict_strategy='rename'):
        from core.schemas import FullImportIn

        return FullImportIn(data=data, workspaces=workspaces, conflict_strategy=conflict_strategy)

    def test_full_export_import_cycle(self):
        from workspaces.demo_fixtures import create_demo_fixtures

        create_demo_fixtures(workspace_id=self.workspace.id, user_id=self.user.id)

        original_tx = Transaction.objects.for_workspace(self.workspace.id).count()
        original_transfers = Transfer.objects.for_workspace(self.workspace.id).count()
        original_planned = PlannedTransaction.objects.for_workspace(self.workspace.id).count()
        original_accounts = Account.objects.for_workspace(self.workspace.id).count()

        export_data = UserService.export_all_data(self.user)
        self.assertEqual(export_data['export_version'], '2.0')

        UserService.delete_account(self.user, self.user_password)
        self.assertFalse(User.objects.filter(email=self.user.email).exists())

        from common.tests.factories import UserFactory

        new_user = UserFactory(email='restored@test.com', full_name='Restored User')
        new_user.set_password('newpass123')
        new_user.save()

        result = UserService.import_all_data(new_user, self._make_import_input(export_data))
        self.assertEqual(result['imported_workspaces'], 1)
        self.assertEqual(result['imported_accounts'], original_accounts)
        self.assertEqual(result['imported_transactions'], original_tx)
        self.assertEqual(result['imported_transfers'], original_transfers)
        self.assertEqual(result['imported_planned_transactions'], original_planned)

        restored = Workspace.objects.filter(owner=new_user).first()
        self.assertEqual(Account.objects.for_workspace(restored.id).count(), original_accounts)
        self.assertEqual(Transaction.objects.for_workspace(restored.id).count(), original_tx)

    def test_full_cycle_with_multiple_workspaces(self):
        workspace2 = WorkspaceFactory(name='Second Workspace')
        WorkspaceMemberFactory(workspace=workspace2, user=self.user, role='owner')
        workspace2.owner = self.user
        workspace2.save()
        account2 = AccountFactory(workspace=workspace2, name='Second Main')
        TransactionFactory(account=account2, workspace=workspace2, amount=Decimal('200.00'), type='income')

        export_data = UserService.export_all_data(self.user)
        self.assertEqual(len(export_data['workspaces']), 2)

        from common.tests.factories import UserFactory

        new_user = UserFactory(email='multi@test.com')
        new_user.set_password('pass12345')
        new_user.save()
        result = UserService.import_all_data(new_user, self._make_import_input(export_data))

        self.assertEqual(result['imported_workspaces'], 2)
        self.assertEqual(Workspace.objects.filter(owner=new_user).count(), 2)

    def test_import_preserves_workspace_scoped_data_integrity(self):
        account = AccountFactory(workspace=self.workspace, name='Integrity Main')
        TransactionFactory(account=account, workspace=self.workspace, amount=Decimal('50.00'), type='expense')
        PlannedTransactionFactory(account=account, workspace=self.workspace, amount=Decimal('100.00'))

        export_data = UserService.export_all_data(self.user)

        UserService.delete_account(self.user, self.user_password)
        from common.tests.factories import UserFactory

        new_user = UserFactory(email='integrity@test.com')
        new_user.set_password('pass12345')
        new_user.save()
        UserService.import_all_data(new_user, self._make_import_input(export_data))

        restored = Workspace.objects.filter(owner=new_user).first()
        ws_id = restored.id
        self.assertEqual(Transaction.objects.filter(workspace_id=ws_id).count(), 1)
        self.assertEqual(PlannedTransaction.objects.filter(workspace_id=ws_id).count(), 1)
        self.assertTrue(all(a.workspace_id == ws_id for a in Account.objects.filter(workspace_id=ws_id)))
