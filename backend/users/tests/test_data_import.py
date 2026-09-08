"""Tests for GDPR v3 data import (same-system restore).

The main import handles v3 only; legacy v1/v2 files go through the legacy
import endpoint (B11). These tests cover v3 version gating, conflict
strategies, hierarchy restore, and the export→wipe→import round-trip.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.factories import AccountFactory
from accounts.models import Account
from budgeting.factories import BudgetFactory
from budgeting.models import Budget, BudgetCurrency, CategoryBudget, Period
from budgeting.services import PeriodService
from categories.factories import CategoryFactory
from categories.models import Category
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.models import WorkspaceCurrency
from currencies.services import CurrencyCatalogService
from planned_transactions.factories import PlannedTransactionFactory
from planned_transactions.models import PlannedTransaction
from transactions.factories import TransactionFactory, TransactionItemFactory
from transactions.models import Transaction
from transfers.factories import TransferFactory
from users.services import UserService
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.models import Workspace

User = get_user_model()


class V3ImportGatingTests(AuthMixin, TestCase):
    """Version gating and workspace conflict strategies."""

    def _make_import_input(self, data, workspaces=None, conflict_strategy='rename'):
        from core.schemas import FullImportIn

        return FullImportIn(data=data, workspaces=workspaces, conflict_strategy=conflict_strategy)

    def _minimal_v3(self, name='Imported Workspace', **ws_extra):
        ws = {'workspace_name': name, 'enabled_currencies': [], 'accounts': [], 'budgets': []}
        ws.update(ws_extra)
        return {'export_version': '3.0', 'workspaces': [ws]}

    def test_import_rejects_v2(self):
        from common.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            UserService.import_all_data(self.user, self._make_import_input({'export_version': '2.0', 'workspaces': []}))

    def test_import_rejects_v1(self):
        from common.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            UserService.import_all_data(self.user, self._make_import_input({'export_version': '1.0', 'workspaces': []}))

    def test_import_accepts_v3(self):
        result = UserService.import_all_data(self.user, self._make_import_input(self._minimal_v3()))
        self.assertEqual(result['imported_workspaces'], 1)

    def test_import_skip_strategy(self):
        UserService.import_all_data(self.user, self._make_import_input(self._minimal_v3()))
        result = UserService.import_all_data(
            self.user, self._make_import_input(self._minimal_v3(), conflict_strategy='skip')
        )
        self.assertEqual(result['imported_workspaces'], 0)
        self.assertIn('Imported Workspace', result['skipped']['workspaces'])

    def test_import_rename_strategy(self):
        UserService.import_all_data(self.user, self._make_import_input(self._minimal_v3()))
        result = UserService.import_all_data(
            self.user, self._make_import_input(self._minimal_v3(), conflict_strategy='rename')
        )
        self.assertEqual(result['imported_workspaces'], 1)
        self.assertIn('Imported Workspace', result['renamed'])

    def test_conflict_check_scoped_to_own_workspaces(self):
        """Another tenant's workspace with the same name must not trigger a rename (or leak)."""
        WorkspaceFactory(name='Imported Workspace')

        result = UserService.import_all_data(self.user, self._make_import_input(self._minimal_v3()))

        self.assertEqual(result['imported_workspaces'], 1)
        self.assertEqual(result['renamed'], {})
        self.assertTrue(Workspace.objects.filter(owner=self.user, name='Imported Workspace').exists())

    def test_invalid_date_raises_validation_error(self):
        from common.exceptions import ValidationError

        export = self._minimal_v3(
            accounts=[{'name': 'Main', 'currency_code': 'PLN'}],
            transactions=[
                {
                    'date': 'not-a-date',
                    'description': 'Bad row',
                    'amount': '10.00',
                    'type': 'expense',
                    'account_name': 'Main',
                }
            ],
        )

        with self.assertRaises(ValidationError):
            UserService.import_all_data(self.user, self._make_import_input(export))

    def test_import_filter_workspaces(self):
        export_data = {
            'export_version': '3.0',
            'workspaces': [
                {'workspace_name': 'Workspace A', 'accounts': [], 'budgets': []},
                {'workspace_name': 'Workspace B', 'accounts': [], 'budgets': []},
            ],
        }
        result = UserService.import_all_data(
            self.user, self._make_import_input(export_data, workspaces=['Workspace A'])
        )
        self.assertEqual(result['imported_workspaces'], 1)


class V3BudgetCurrencyImportTests(AuthMixin, TestCase):
    """currency_codes import: ordered set, dedupe, empty."""

    def _make_import_input(self, data):
        from core.schemas import FullImportIn

        return FullImportIn(data=data)

    def _v3_with_budget(self, **budget_fields):
        budget = {'name': 'Household'}
        budget.update(budget_fields)
        return {
            'export_version': '3.0',
            'workspaces': [
                {
                    'workspace_name': 'Imported Workspace',
                    'enabled_currencies': [],
                    'accounts': [],
                    'budgets': [budget],
                }
            ],
        }

    def test_currency_codes_imported_with_positions(self):
        export = self._v3_with_budget(currency_codes=['PLN', 'USD'])

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_budgets'], 1)
        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        budget = Budget.objects.get(workspace=ws, name='Household')
        self.assertEqual(list(budget.currencies.values_list('position', 'currency__code')), [(0, 'PLN'), (1, 'USD')])

    def test_duplicate_codes_dedupe_preserving_first(self):
        export = self._v3_with_budget(currency_codes=['USD', 'PLN', 'USD'])

        UserService.import_all_data(self.user, self._make_import_input(export))

        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        budget = Budget.objects.get(workspace=ws, name='Household')
        self.assertEqual(list(budget.currencies.values_list('position', 'currency__code')), [(0, 'USD'), (1, 'PLN')])

    def test_no_currency_field_imports_empty_set(self):
        export = self._v3_with_budget()

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_budgets'], 1)
        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        budget = Budget.objects.get(workspace=ws, name='Household')
        self.assertEqual(budget.currencies.count(), 0)

    def test_falsy_code_entry_skips_with_error(self):
        """A falsy currency_codes entry skips just that row, not the whole import."""
        export = self._v3_with_budget(currency_codes=['PLN', None, 'USD'])

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_budgets'], 1)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('budget currency missing code', result['skipped']['errors'][0])
        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        budget = Budget.objects.get(workspace=ws, name='Household')
        # Valid codes import; the skip leaves a sparse position gap, not a renumber.
        self.assertEqual(list(budget.currencies.values_list('position', 'currency__code')), [(0, 'PLN'), (2, 'USD')])


class V3AccountLessImportTests(AuthMixin, TestCase):
    """Null/missing account_name imports: account-less rows with their own currency."""

    def _make_import_input(self, data):
        from core.schemas import FullImportIn

        return FullImportIn(data=data)

    def _v3(self, **ws_extra):
        ws = {'workspace_name': 'Imported Workspace', 'enabled_currencies': [], 'accounts': [], 'budgets': []}
        ws.update(ws_extra)
        return {'export_version': '3.0', 'workspaces': [ws]}

    def test_account_less_transaction_and_planned_import(self):
        export = self._v3(
            transactions=[
                {
                    'date': '2026-07-05',
                    'description': 'Tip jar',
                    'amount': '20.00',
                    'type': 'expense',
                    'account_name': None,
                    'currency_code': 'PLN',
                }
            ],
            planned_transactions=[
                {
                    'name': 'Future tips',
                    'amount': '10.00',
                    'planned_date': '2026-08-01',
                    'status': 'pending',
                    'account_name': None,
                    'currency_code': 'PLN',
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertEqual(result['imported_planned_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        tx = Transaction.objects.get(workspace=ws, description='Tip jar')
        self.assertIsNone(tx.account)
        self.assertEqual(tx.currency.code, 'PLN')
        planned = PlannedTransaction.objects.get(workspace=ws, name='Future tips')
        self.assertIsNone(planned.account)
        self.assertEqual(planned.currency.code, 'PLN')

    def test_missing_account_name_key_imports_account_less(self):
        """A row without the account_name key at all imports account-less too."""
        export = self._v3(
            transactions=[
                {
                    'date': '2026-07-05',
                    'description': 'No key row',
                    'amount': '5.00',
                    'type': 'expense',
                    'currency_code': 'PLN',
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_transactions'], 1)
        tx = Transaction.objects.get(description='No key row')
        self.assertIsNone(tx.account)
        self.assertEqual(tx.currency.code, 'PLN')

    def test_account_having_row_still_binds_account(self):
        export = self._v3(
            accounts=[{'name': 'Main', 'currency_code': 'PLN'}],
            transactions=[
                {
                    'date': '2026-07-05',
                    'description': 'Salary',
                    'amount': '100.00',
                    'type': 'income',
                    'account_name': 'Main',
                    'currency_code': 'PLN',
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_transactions'], 1)
        tx = Transaction.objects.get(description='Salary')
        self.assertEqual(tx.account.name, 'Main')
        self.assertEqual(tx.currency.code, 'PLN')

    def test_unknown_account_name_still_skips_with_error(self):
        export = self._v3(
            transactions=[
                {
                    'date': '2026-07-05',
                    'description': 'Ghost',
                    'amount': '1.00',
                    'type': 'expense',
                    'account_name': 'Nope',
                    'currency_code': 'PLN',
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_transactions'], 0)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('unknown account', result['skipped']['errors'][0])

    def test_account_less_unknown_currency_creates_custom(self):
        export = self._v3(
            transactions=[
                {
                    'date': '2026-07-05',
                    'description': 'Exotic tip',
                    'amount': '7.00',
                    'type': 'expense',
                    'account_name': None,
                    'currency_code': 'GOLD',
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_transactions'], 1)
        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        tx = Transaction.objects.get(description='Exotic tip')
        self.assertEqual(tx.currency.code, 'GOLD')
        self.assertTrue(tx.currency.is_custom)
        self.assertTrue(WorkspaceCurrency.objects.filter(workspace=ws, currency=tx.currency).exists())

    def test_account_less_row_without_currency_skips_with_error(self):
        export = self._v3(
            transactions=[
                {
                    'date': '2026-07-05',
                    'description': 'No currency',
                    'amount': '5.00',
                    'type': 'expense',
                    'account_name': None,
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_transactions'], 0)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('missing currency_code', result['skipped']['errors'][0])


class V3MalformedRowImportTests(AuthMixin, APIClientMixin, TestCase):
    """Rows with a missing currency code skip with an error instead of 500ing.

    A falsy code reaching _resolve_import_currency would attempt
    Currency.objects.create(code=None) inside the import's atomic block -
    an IntegrityError (endpoint 500) and a full rollback for one malformed row.
    """

    def _malformed_export(self):
        return {
            'export_version': '3.0',
            'workspaces': [
                {
                    'workspace_name': 'Imported Workspace',
                    'enabled_currencies': [
                        {'code': 'PLN', 'name': 'Zloty', 'symbol': 'zł', 'decimals': 2},
                        {'name': 'Ghost Currency'},
                    ],
                    'accounts': [
                        {'name': 'Main', 'currency_code': 'PLN'},
                        {'name': 'Broken Account'},
                    ],
                    'budgets': [
                        {
                            'name': 'Household',
                            'categories': [{'name': 'Groceries'}],
                            'periods': [
                                {
                                    'name': 'July 2026',
                                    'start_date': '2026-07-01',
                                    'end_date': '2026-07-31',
                                    'category_budgets': [
                                        {'category_name': 'Groceries', 'currency_code': 'PLN', 'amount': '800.00'},
                                        {'category_name': 'Groceries', 'amount': '5.00'},
                                    ],
                                }
                            ],
                        }
                    ],
                    'transactions': [
                        {
                            'date': '2026-07-05',
                            'description': 'Salary',
                            'amount': '100.00',
                            'type': 'income',
                            'account_name': 'Main',
                            'currency_code': 'PLN',
                        }
                    ],
                }
            ],
        }

    def test_malformed_rows_skip_instead_of_500(self):
        result = self.post('/api/users/me/import', {'data': self._malformed_export()}, **self.auth_headers())
        self.assertStatus(200)

        errors = result['skipped']['errors']
        self.assertEqual(len(errors), 3)
        self.assertIn('enabled currency missing code', errors[0])
        self.assertIn('account missing currency_code', errors[1])
        self.assertIn('category budget missing currency_code', errors[2])
        for error in errors:
            self.assertIn('Imported Workspace', error)

        # Counts exclude the skipped rows; the well-formed rows imported.
        self.assertEqual(result['imported_workspaces'], 1)
        self.assertEqual(result['imported_accounts'], 1)
        self.assertEqual(result['imported_budgets'], 1)
        self.assertEqual(result['imported_categories'], 1)
        self.assertEqual(result['imported_transactions'], 1)

        # Nothing rolled back: the good rows are in the DB, the bad ones are not.
        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        self.assertTrue(Account.objects.filter(workspace=ws, name='Main').exists())
        self.assertFalse(Account.objects.filter(workspace=ws, name='Broken Account').exists())
        self.assertEqual(CategoryBudget.objects.filter(workspace=ws).count(), 1)
        self.assertTrue(Transaction.objects.filter(workspace=ws, description='Salary').exists())


class V3TransactionNoteImportTests(AuthMixin, TestCase):
    """The optional transaction note: export→import round-trip plus legacy note-less v3 files.

    No export_version bump: an additive optional field with a safe default -
    older readers ignore the key, newer readers handle its absence (.get → None).
    """

    def _make_import_input(self, data):
        from core.schemas import FullImportIn

        return FullImportIn(data=data)

    def _noted_workspace(self):
        account = AccountFactory(workspace=self.workspace)
        TransactionFactory(
            account=account,
            workspace=self.workspace,
            description='Noted expense',
            note='Reimbursable',
            amount=Decimal('15.00'),
            type='expense',
        )

    def _imported_workspace(self):
        """The one workspace the import created besides AuthMixin's."""
        return Workspace.objects.filter(owner=self.user).exclude(id=self.workspace.id).get()

    def test_note_survives_export_import_round_trip(self):
        self._noted_workspace()

        export_data = UserService.export_all_data(self.user)
        exported_tx = next(
            t for t in export_data['workspaces'][0]['transactions'] if t['description'] == 'Noted expense'
        )
        self.assertEqual(exported_tx['note'], 'Reimbursable')

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        tx = Transaction.objects.get(workspace=self._imported_workspace(), description='Noted expense')
        self.assertEqual(tx.note, 'Reimbursable')

    def test_legacy_note_less_export_imports_none(self):
        """A v3 export from before the note field existed still imports; note lands None."""
        self._noted_workspace()

        export_data = UserService.export_all_data(self.user)
        for tx in export_data['workspaces'][0]['transactions']:
            tx.pop('note', None)

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        tx = Transaction.objects.get(workspace=self._imported_workspace(), description='Noted expense')
        self.assertIsNone(tx.note)


class V3RoundTripTests(AuthMixin, TestCase):
    """Export → wipe → import reproduces the full hierarchy and balances."""

    def _make_import_input(self, data):
        from core.schemas import FullImportIn

        return FullImportIn(data=data)

    def _build_rich_workspace(self):
        """Populate self.workspace with the whole domain surface."""
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        pln = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')

        checking = AccountFactory(workspace=self.workspace, name='Checking', opening_balance=Decimal('1000.00'))
        savings = AccountFactory(workspace=self.workspace, name='Savings', opening_balance=Decimal('200.00'))
        dollars = AccountFactory(workspace=self.workspace, name='Dollars', currency=usd)

        budget = BudgetFactory(workspace=self.workspace, name='Household')
        BudgetCurrency.objects.create(budget=budget, currency=pln, position=0)
        BudgetCurrency.objects.create(budget=budget, currency=usd, position=1)
        groceries = CategoryFactory(budget=budget, workspace=self.workspace, name='Groceries')
        CategoryFactory(budget=budget, workspace=self.workspace, name='Retired', is_archived=True)
        period = PeriodService.get_or_create_for_date(self.user, budget, date(2026, 7, 15))
        CategoryBudget.objects.create(
            period=period,
            workspace_id=self.workspace.id,
            category=groceries,
            currency=pln,
            amount=Decimal('800.00'),
            created_by=self.user,
        )

        shop = TransactionFactory(
            account=checking,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            description='Weekly shop',
            category=groceries,
            amount=Decimal('120.00'),
            type='expense',
        )
        TransactionItemFactory(
            transaction=shop,
            position=0,
            name='Bread',
            quantity=Decimal('1'),
            unit_price=Decimal('4.99'),
            line_total=Decimal('4.99'),
        )
        TransactionItemFactory(
            transaction=shop,
            position=1,
            name='Tomatoes',
            quantity=Decimal('0.782'),
            unit_price=Decimal('9.99'),
            line_total=Decimal('7.81'),
        )
        TransactionFactory(
            account=dollars,
            workspace=self.workspace,
            date=date(2026, 7, 6),
            description='Converted card payment',
            amount=Decimal('51.20'),
            type='expense',
            original_amount=Decimal('12.99'),
            original_currency=pln,
        )
        TransferFactory(
            from_account=checking,
            to_account=savings,
            workspace=self.workspace,
            from_amount=Decimal('100.00'),
            to_amount=Decimal('100.00'),
            date=date(2026, 7, 7),
        )
        PlannedTransactionFactory(
            account=checking,
            workspace=self.workspace,
            name='Rent',
            amount=Decimal('2000.00'),
            category=groceries,
            planned_date=date(2026, 8, 1),
            status='pending',
        )
        TransactionFactory(
            account=None,
            currency=pln,
            workspace=self.workspace,
            date=date(2026, 7, 8),
            description='Street tips',
            amount=Decimal('20.00'),
            type='expense',
        )
        PlannedTransactionFactory(
            account=None,
            currency=pln,
            workspace=self.workspace,
            name='Cash gift',
            amount=Decimal('50.00'),
            planned_date=date(2026, 8, 15),
            status='pending',
        )
        return checking, dollars

    def test_full_round_trip_reproduces_hierarchy_and_balances(self):
        from accounts.services import AccountService

        checking, dollars = self._build_rich_workspace()
        checking.is_default_for_currency = True
        checking.save()
        checking_balance = AccountService.balance(checking)
        dollars_balance = AccountService.balance(dollars)

        export_data = UserService.export_all_data(self.user)
        self.assertEqual(export_data['export_version'], '3.0')
        # The default-for-currency flag is serialized into the v3 export.
        exported_checking = next(a for a in export_data['workspaces'][0]['accounts'] if a['name'] == 'Checking')
        self.assertTrue(exported_checking['is_default_for_currency'])
        # The budget currency set is serialized in position order.
        exported_budget = next(b for b in export_data['workspaces'][0]['budgets'] if b['name'] == 'Household')
        self.assertEqual(exported_budget['currency_codes'], ['PLN', 'USD'])

        UserService.delete_account(self.user, self.user_password)
        self.assertFalse(User.objects.filter(email=self.user.email).exists())

        from common.tests.factories import UserFactory

        new_user = UserFactory(email='restored@test.com')
        new_user.set_password('newpass123')
        new_user.save()

        result = UserService.import_all_data(new_user, self._make_import_input(export_data))
        self.assertEqual(result['imported_workspaces'], 1)
        self.assertEqual(result['imported_accounts'], 3)
        self.assertEqual(result['imported_budgets'], 1)
        self.assertEqual(result['imported_categories'], 2)
        self.assertEqual(result['imported_transactions'], 3)
        self.assertEqual(result['imported_transfers'], 1)
        self.assertEqual(result['imported_planned_transactions'], 2)

        ws = Workspace.objects.get(owner=new_user)

        # Budgeting hierarchy restored
        budget = Budget.objects.get(workspace=ws, name='Household')
        self.assertEqual(Category.objects.filter(budget=budget).count(), 2)
        self.assertTrue(Category.objects.filter(budget=budget, name='Retired', is_archived=True).exists())
        self.assertEqual(Period.objects.filter(budget=budget).count(), 1)
        self.assertEqual(CategoryBudget.objects.filter(workspace=ws).count(), 1)
        # Budget currency set restored in order with positions.
        self.assertEqual(list(budget.currencies.values_list('position', 'currency__code')), [(0, 'PLN'), (1, 'USD')])

        # Transaction category + original facet restored
        converted = Transaction.objects.get(workspace=ws, description='Converted card payment')
        self.assertEqual(converted.original_amount, Decimal('12.99'))
        self.assertEqual(converted.original_currency.code, 'PLN')
        shop = Transaction.objects.get(workspace=ws, description='Weekly shop')
        self.assertEqual(shop.category.name, 'Groceries')

        # Account-less rows round-trip account-less with their own currency;
        # balances are unaffected (account-less rows enter no balance).
        tips = Transaction.objects.get(workspace=ws, description='Street tips')
        self.assertIsNone(tips.account)
        self.assertEqual(tips.currency.code, 'PLN')
        gift = PlannedTransaction.objects.get(workspace=ws, name='Cash gift')
        self.assertIsNone(gift.account)
        self.assertEqual(gift.currency.code, 'PLN')

        # Line items restored in order
        items = list(shop.items.all())
        self.assertEqual([i.name for i in items], ['Bread', 'Tomatoes'])
        self.assertEqual(items[1].quantity, Decimal('0.782'))
        self.assertEqual(items[1].line_total, Decimal('7.81'))

        # Balances reproduced exactly
        new_checking = Account.objects.get(workspace=ws, name='Checking')
        new_dollars = Account.objects.get(workspace=ws, name='Dollars')
        self.assertEqual(AccountService.balance(new_checking), checking_balance)
        self.assertEqual(AccountService.balance(new_dollars), dollars_balance)
        # The default-for-currency flag survives the export→wipe→import round-trip.
        self.assertTrue(new_checking.is_default_for_currency)
        self.assertFalse(new_dollars.is_default_for_currency)

    def test_multiple_workspaces_round_trip(self):
        self._build_rich_workspace()
        workspace2 = WorkspaceFactory(name='Second Workspace')
        WorkspaceMemberFactory(workspace=workspace2, user=self.user, role='owner')
        workspace2.owner = self.user
        workspace2.save()
        AccountFactory(workspace=workspace2, name='Second Main')

        export_data = UserService.export_all_data(self.user)
        self.assertEqual(len(export_data['workspaces']), 2)

        from common.tests.factories import UserFactory

        new_user = UserFactory(email='multi@test.com')
        new_user.set_password('pass12345')
        new_user.save()
        result = UserService.import_all_data(new_user, self._make_import_input(export_data))
        self.assertEqual(result['imported_workspaces'], 2)


class AccountDeletionOrphanTests(AuthMixin, TestCase):
    """delete_account leaves zero orphans across the PROTECT chains."""

    def test_delete_account_with_custom_currency_and_full_hierarchy(self):
        CurrencyCatalogService.create_custom(self.user, self.workspace.id, code='GOLD', name='Gold', symbol='g')
        gold = CurrencyCatalogService.get_enabled(self.workspace.id, 'GOLD')
        account = AccountFactory(workspace=self.workspace, name='Vault', currency=gold)
        budget = BudgetFactory(workspace=self.workspace)
        category = CategoryFactory(budget=budget, workspace=self.workspace, name='Bars')
        period = PeriodService.get_or_create_for_date(self.user, budget, date(2026, 7, 15))
        CategoryBudget.objects.create(
            period=period,
            workspace_id=self.workspace.id,
            category=category,
            currency=gold,
            amount=Decimal('5.00'),
            created_by=self.user,
        )
        TransactionFactory(
            account=account, workspace=self.workspace, category=category, amount=Decimal('1'), type='expense'
        )

        ws_id = self.workspace.id
        UserService.delete_account(self.user, self.user_password)

        # Everything workspace-scoped is gone; no PROTECT error was raised.
        self.assertFalse(Workspace.objects.filter(id=ws_id).exists())
        self.assertFalse(Account.objects.filter(workspace_id=ws_id).exists())
        self.assertFalse(Transaction.objects.filter(workspace_id=ws_id).exists())
        self.assertFalse(CategoryBudget.objects.filter(workspace_id=ws_id).exists())
        # The workspace-custom currency row is cleaned up too
        from currencies.models import Currency, WorkspaceCurrency

        self.assertFalse(Currency.objects.filter(workspace_id=ws_id).exists())
        self.assertFalse(WorkspaceCurrency.objects.filter(workspace_id=ws_id).exists())
        # Global catalog rows survive
        self.assertTrue(Currency.objects.filter(workspace__isnull=True, code='PLN').exists())

    def test_delete_account_with_account_less_rows_and_custom_currency(self):
        """Account-less rows + the own-currency FK add no orphan class to deletion."""
        CurrencyCatalogService.create_custom(self.user, self.workspace.id, code='GOLD', name='Gold', symbol='g')
        gold = CurrencyCatalogService.get_enabled(self.workspace.id, 'GOLD')
        TransactionFactory(account=None, currency=gold, workspace=self.workspace, amount=Decimal('1'), type='expense')
        PlannedTransactionFactory(account=None, currency=gold, workspace=self.workspace, amount=Decimal('2'))

        ws_id = self.workspace.id
        UserService.delete_account(self.user, self.user_password)

        self.assertFalse(Workspace.objects.filter(id=ws_id).exists())
        self.assertFalse(Transaction.objects.filter(workspace_id=ws_id).exists())
        self.assertFalse(PlannedTransaction.objects.filter(workspace_id=ws_id).exists())
        from currencies.models import Currency

        self.assertFalse(Currency.objects.filter(workspace_id=ws_id).exists())
