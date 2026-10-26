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
from bookmarks.factories import BookmarkFactory
from bookmarks.models import Bookmark
from budgeting.factories import BudgetFactory
from budgeting.models import Budget, BudgetCurrency, CategoryBudget, Period
from budgeting.services import PeriodService
from categories.factories import CategoryFactory
from categories.models import Category
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.models import WorkspaceCurrency
from currencies.services import CurrencyCatalogService
from planned_transactions.factories import PlannedTransactionFactory, RecurringTransactionFactory
from planned_transactions.models import PlannedTransaction, RecurringTransaction
from planned_transactions.services import RecurringTransactionService
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


class V3FacetAdjustmentImportTests(AuthMixin, TestCase):
    """Linked auto-adjustments round-trip: the export skips the derived row, the
    import regenerates it via the create-path helper. Additive field with a
    safe default - no export_version bump (same contract as the note)."""

    def _make_import_input(self, data):
        from core.schemas import FullImportIn

        return FullImportIn(data=data)

    def _imported_workspace(self):
        """The one workspace the import created besides AuthMixin's."""
        return Workspace.objects.filter(owner=self.user).exclude(id=self.workspace.id).get()

    def _linked_pair(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        pln = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')
        cash_pln = AccountFactory(workspace=self.workspace, name='Cash PLN', currency=pln)
        card_usd = AccountFactory(workspace=self.workspace, name='Card USD', currency=usd)
        source = TransactionFactory(
            account=card_usd,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            description='Converted card payment',
            amount=Decimal('51.20'),
            type='expense',
            original_amount=Decimal('200.00'),
            original_currency=pln,
        )
        TransactionFactory(
            account=cash_pln,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            description='Auto adjustment',
            amount=Decimal('-200.00'),
            type='adjustment',
            source_transaction=source,
        )
        return cash_pln, card_usd

    def _exported_source(self, export_data):
        return next(
            t for t in export_data['workspaces'][0]['transactions'] if t['description'] == 'Converted card payment'
        )

    def test_pair_round_trips_with_link_and_balances(self):
        from accounts.services import AccountService

        cash_pln, card_usd = self._linked_pair()
        TransactionFactory(
            account=card_usd,
            workspace=self.workspace,
            description='Plain expense',
            amount=Decimal('10.00'),
            type='expense',
        )
        cash_balance = AccountService.balance(cash_pln)
        card_balance = AccountService.balance(card_usd)

        export_data = UserService.export_all_data(self.user)
        # Derived adjustment is NOT serialized; source carries the facet account.
        rows = export_data['workspaces'][0]['transactions']
        self.assertEqual(len(rows), 2)
        self.assertEqual(self._exported_source(export_data)['original_account_name'], 'Cash PLN')

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))
        self.assertEqual(result['imported_transactions'], 2)
        self.assertEqual(result['skipped']['errors'], [])

        ws = self._imported_workspace()
        new_source = Transaction.objects.get(workspace=ws, description='Converted card payment')
        adjustment = Transaction.objects.get(workspace=ws, type='adjustment')
        self.assertEqual(adjustment.source_transaction_id, new_source.id)
        self.assertEqual(adjustment.account.name, 'Cash PLN')
        self.assertEqual(adjustment.amount, Decimal('-200.00'))
        self.assertEqual(adjustment.date, new_source.date)
        # Balance parity: the regenerated pair reproduces both account balances.
        self.assertEqual(AccountService.balance(Account.objects.get(workspace=ws, name='Cash PLN')), cash_balance)
        self.assertEqual(AccountService.balance(Account.objects.get(workspace=ws, name='Card USD')), card_balance)

    def test_pair_round_trips_through_json_file(self):
        """The real download/upload path: GDPREncoder writes Decimals as strings,
        so the importer hands the adjustment helper a raw "200.00" - the signed
        amount must still come out as Decimal('-200.00') for an expense."""
        import json

        from common.json_encoder import GDPREncoder

        self._linked_pair()
        export_data = json.loads(json.dumps(UserService.export_all_data(self.user), cls=GDPREncoder))

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['skipped']['errors'], [])
        ws = self._imported_workspace()
        adjustment = Transaction.objects.get(workspace=ws, type='adjustment')
        self.assertEqual(adjustment.amount, Decimal('-200.00'))
        self.assertEqual(adjustment.source_transaction.description, 'Converted card payment')

    def test_informational_facet_stays_informational(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        pln = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')
        card_usd = AccountFactory(workspace=self.workspace, currency=usd)
        TransactionFactory(
            account=card_usd,
            workspace=self.workspace,
            description='Info facet',
            amount=Decimal('10.00'),
            type='expense',
            original_amount=Decimal('40.00'),
            original_currency=pln,
        )

        export_data = UserService.export_all_data(self.user)
        self.assertIsNone(self._exported_source_like(export_data, 'Info facet')['original_account_name'])

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        ws = self._imported_workspace()
        self.assertFalse(Transaction.objects.filter(workspace=ws, type='adjustment').exists())
        source = Transaction.objects.get(workspace=ws, description='Info facet')
        self.assertEqual(source.original_amount, Decimal('40.00'))

    def _exported_source_like(self, export_data, description):
        return next(t for t in export_data['workspaces'][0]['transactions'] if t['description'] == description)

    def test_legacy_export_without_original_account_name_key(self):
        """A v3 export from before the field existed still imports: facet lands,
        no adjustment, no crash (old-reader/old-writer backward compat)."""
        self._linked_pair()

        export_data = UserService.export_all_data(self.user)
        for tx in export_data['workspaces'][0]['transactions']:
            tx.pop('original_account_name', None)

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        ws = self._imported_workspace()
        source = Transaction.objects.get(workspace=ws, description='Converted card payment')
        self.assertEqual(source.original_amount, Decimal('200.00'))
        self.assertEqual(source.original_currency.code, 'PLN')
        self.assertFalse(Transaction.objects.filter(workspace=ws, type='adjustment').exists())

    def test_unresolvable_facet_account_records_error_and_imports_source(self):
        self._linked_pair()

        export_data = UserService.export_all_data(self.user)
        self._exported_source(export_data)['original_account_name'] = 'Ghost Account'

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertTrue(result['skipped']['errors'])
        ws = self._imported_workspace()
        source = Transaction.objects.get(workspace=ws, description='Converted card payment')
        self.assertEqual(source.original_amount, Decimal('200.00'))
        self.assertFalse(Transaction.objects.filter(workspace=ws, type='adjustment').exists())

    def test_facet_account_currency_mismatch_records_error(self):
        """Hand-edited file only: a resolvable name on the wrong-currency
        account imports the facet informational and reports the mismatch."""
        self._linked_pair()

        export_data = UserService.export_all_data(self.user)
        self._exported_source(export_data)['original_account_name'] = 'Card USD'  # USD, facet is PLN

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertTrue(result['skipped']['errors'])
        ws = self._imported_workspace()
        self.assertFalse(Transaction.objects.filter(workspace=ws, type='adjustment').exists())


class V3ItemCategoryImportTests(AuthMixin, TestCase):
    """Item categories + remainder rows round-trip; additive keys are optional.

    No export_version bump: category_name/is_remainder are additive with safe
    defaults - older v3 exports import with category None (inherit) and no
    remainder rows, and per-transaction coverage normalization tops the items
    up to the transaction amount (same contract family as the note field).
    """

    def _make_import_input(self, data):
        from core.schemas import FullImportIn

        return FullImportIn(data=data)

    def _imported_workspace(self):
        """The one workspace the import created besides AuthMixin's."""
        return Workspace.objects.filter(owner=self.user).exclude(id=self.workspace.id).get()

    def _categorized_workspace(self):
        """One tx: two explicitly categorized items + a remainder row."""
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace)
        budget = BudgetFactory(workspace=self.workspace, name='Household')
        food = CategoryFactory(budget=budget, workspace=self.workspace, name='Food')
        home = CategoryFactory(budget=budget, workspace=self.workspace, name='Home')
        shop = TransactionFactory(
            account=account,
            workspace=self.workspace,
            date=date(2026, 7, 5),
            description='Weekly shop',
            category=food,
            amount=Decimal('20.00'),
            type='expense',
        )
        TransactionItemFactory(transaction=shop, position=0, name='Bread', line_total=Decimal('3.00'), category=food)
        TransactionItemFactory(
            transaction=shop, position=1, name='Detergent', line_total=Decimal('5.00'), category=home
        )
        TransactionItemFactory(
            transaction=shop,
            position=2,
            name='Rest',
            quantity=Decimal('1'),
            unit_price=None,
            line_total=Decimal('12.00'),
            category=None,
            is_remainder=True,
        )
        return budget

    def _exported_shop(self, export_data, description='Weekly shop'):
        return next(t for t in export_data['workspaces'][0]['transactions'] if t['description'] == description)

    def test_item_categories_and_remainder_round_trip(self):
        self._categorized_workspace()

        export_data = UserService.export_all_data(self.user)
        self.assertEqual(
            [(i['category_name'], i['is_remainder']) for i in self._exported_shop(export_data)['items']],
            [('Food', False), ('Home', False), (None, True)],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        ws = self._imported_workspace()
        new_food = Category.objects.get(workspace=ws, name='Food')
        new_home = Category.objects.get(workspace=ws, name='Home')
        shop = Transaction.objects.get(workspace=ws, description='Weekly shop')
        # Categories resolved by name against the NEW workspace's categories.
        items = list(shop.items.order_by('position', 'id'))
        self.assertEqual(
            [(i.name, i.category_id) for i in items[:2]], [('Bread', new_food.id), ('Detergent', new_home.id)]
        )
        # The remainder row round-trips as a remainder with its name and size.
        remainder = items[2]
        self.assertTrue(remainder.is_remainder)
        self.assertEqual(remainder.name, 'Rest')
        self.assertIsNone(remainder.category_id)
        self.assertEqual(remainder.line_total, Decimal('12.00'))
        # Coverage invariant: exactly one remainder, items sum to the amount.
        self.assertEqual(shop.items.filter(is_remainder=True).count(), 1)
        self.assertEqual(sum(i.line_total for i in items), Decimal('20.00'))

    def test_legacy_export_without_item_category_keys(self):
        """A v3 export from before item categories existed still imports:
        categories land None (inherit) and normalization tops the item set
        up to coverage with a fresh remainder row."""
        self._categorized_workspace()

        export_data = UserService.export_all_data(self.user)
        exported_items = self._exported_shop(export_data)['items']
        # A pre-item-category export predates remainder rows entirely - drop
        # the remainder from the export, then strip the additive keys.
        exported_items[:] = [i for i in exported_items if not i['is_remainder']]
        for item in exported_items:
            item.pop('category_name', None)
            item.pop('is_remainder', None)

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        ws = self._imported_workspace()
        shop = Transaction.objects.get(workspace=ws, description='Weekly shop')
        self.assertEqual(shop.items.filter(is_remainder=False).count(), 2)
        self.assertTrue(all(i.category_id is None for i in shop.items.all()))
        # 20.00 - 3.00 - 5.00: the top-up remainder fills the gap.
        remainder = shop.items.get(is_remainder=True)
        self.assertEqual(remainder.line_total, Decimal('12.00'))

    def test_unresolvable_item_category_self_heals_to_inherit(self):
        """Hand-edited files only: an unknown category name imports the item
        NULL-inherit and records one skip error - the tx still imports."""
        self._categorized_workspace()

        export_data = UserService.export_all_data(self.user)
        self._exported_shop(export_data)['items'][1]['category_name'] = 'Ghost Category'

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('unknown category', result['skipped']['errors'][0])
        ws = self._imported_workspace()
        shop = Transaction.objects.get(workspace=ws, description='Weekly shop')
        detergent = shop.items.get(name='Detergent')
        self.assertIsNone(detergent.category_id)
        # Coverage still holds with the self-healed row.
        self.assertEqual(sum(i.line_total for i in shop.items.all()), Decimal('20.00'))

    def test_cross_budget_item_category_self_heals_to_inherit(self):
        """A category name that exists only in a DIFFERENT budget of the same
        export does not resolve: resolution is scoped to the tx's own budget
        (D5), so the item imports NULL-inherit with a skip error."""
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace)
        household = BudgetFactory(workspace=self.workspace, name='Household')
        food = CategoryFactory(budget=household, workspace=self.workspace, name='Food')
        trips = BudgetFactory(workspace=self.workspace, name='Trips')
        CategoryFactory(budget=trips, workspace=self.workspace, name='Fuel')
        shop = TransactionFactory(
            account=account,
            workspace=self.workspace,
            description='Mixed shop',
            category=food,
            amount=Decimal('10.00'),
            type='expense',
        )
        TransactionItemFactory(transaction=shop, position=0, name='Bread', line_total=Decimal('10.00'), category=food)
        # Hand-edit: claim the other budget's category.
        export_data = UserService.export_all_data(self.user)
        self._exported_shop(export_data, 'Mixed shop')['items'][0]['category_name'] = 'Fuel'

        result = UserService.import_all_data(self.user, self._make_import_input(export_data))

        self.assertEqual(result['imported_transactions'], 1)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('unknown category', result['skipped']['errors'][0])
        ws = self._imported_workspace()
        shop = Transaction.objects.get(workspace=ws, description='Mixed shop')
        self.assertIsNone(shop.items.get(name='Bread').category_id)


class V3RecurringImportTests(AuthMixin, TestCase):
    """Recurring rules round-trip; the occurrence pointer survives restore."""

    def _make_import_input(self, data):
        from core.schemas import FullImportIn

        return FullImportIn(data=data)

    def _v3(self, **ws_extra):
        ws = {'workspace_name': 'Imported Workspace', 'enabled_currencies': [], 'accounts': [], 'budgets': []}
        ws.update(ws_extra)
        return {'export_version': '3.0', 'workspaces': [ws]}

    def test_recurring_round_trip_preserves_last_generated_date(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace, name='Cash')
        RecurringTransactionFactory(
            account=account,
            workspace=self.workspace,
            currency=account.currency,
            name='Rent',
            interval_kind='monthly',
            start_date=date(2026, 1, 5),
            upfront_count=3,
            last_generated_date=date(2026, 10, 5),
        )

        export = UserService.export_all_data(self.user)
        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_recurring_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        restored = (
            RecurringTransaction.objects.filter(name='Rent', workspace__owner=self.user)
            .exclude(workspace=self.workspace)
            .get()
        )
        # The pointer survives verbatim: next_occurrence_date lands strictly
        # after it, so the restored rule never re-generates a past occurrence.
        self.assertEqual(restored.last_generated_date, date(2026, 10, 5))
        self.assertEqual(restored.next_occurrence_date, date(2026, 11, 5))
        self.assertEqual(restored.account.name, 'Cash')
        self.assertTrue(restored.is_active)
        self.assertEqual(restored.upfront_count, 3)
        self.assertFalse(restored.materialize_all)

    def test_legacy_export_without_recurring_section_imports_clean(self):
        """Older v3 files (pre-recurring) lack the key entirely - no errors, no rules."""
        export = self._v3(
            accounts=[{'name': 'Main', 'currency_code': 'PLN'}],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_recurring_transactions'], 0)
        self.assertEqual(result['skipped']['errors'], [])
        self.assertEqual(RecurringTransaction.objects.filter(workspace__owner=self.user).count(), 0)

    def test_account_less_recurring_rule_imports_account_less(self):
        export = self._v3(
            recurring_transactions=[
                {
                    'name': 'Tip rule',
                    'amount': '5.00',
                    'account_name': None,
                    'currency_code': 'PLN',
                    'budget_name': None,
                    'category_name': None,
                    'interval_kind': 'weekly',
                    'interval_count': 2,
                    'start_date': '2026-10-01',
                    'upfront_count': 2,
                    'end_date': None,
                    'is_active': False,
                    'last_generated_date': None,
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_recurring_transactions'], 1)
        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        rule = RecurringTransaction.objects.get(workspace=ws, name='Tip rule')
        self.assertIsNone(rule.account)
        self.assertEqual(rule.currency.code, 'PLN')
        self.assertEqual(rule.interval_kind, 'weekly')
        self.assertEqual(rule.interval_count, 2)
        self.assertFalse(rule.is_active)
        self.assertIsNone(rule.last_generated_date)
        self.assertEqual(rule.upfront_count, 2)
        self.assertFalse(rule.materialize_all)

    def test_unknown_account_name_skips_with_error(self):
        export = self._v3(
            recurring_transactions=[
                {
                    'name': 'Ghost rule',
                    'amount': '1.00',
                    'account_name': 'Nope',
                    'currency_code': 'PLN',
                    'interval_kind': 'monthly',
                    'interval_count': 1,
                    'start_date': '2026-01-05',
                    'is_active': True,
                    'last_generated_date': None,
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_recurring_transactions'], 0)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('unknown account', result['skipped']['errors'][0])

    def test_legacy_export_without_upfront_fields_imports_defaults(self):
        """Pre-change v3 files carry lead_days and lack both new keys - the
        legacy key is ignored (the field is gone) and the new fields land on
        the model defaults."""
        export = self._v3(
            recurring_transactions=[
                {
                    'name': 'Old rule',
                    'amount': '5.00',
                    'account_name': None,
                    'currency_code': 'PLN',
                    'budget_name': None,
                    'category_name': None,
                    'interval_kind': 'monthly',
                    'interval_count': 1,
                    'start_date': '2026-01-05',
                    'lead_days': 4,
                    'end_date': None,
                    'is_active': True,
                    'last_generated_date': None,
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_recurring_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        rule = RecurringTransaction.objects.get(workspace__owner=self.user, name='Old rule')
        self.assertEqual(rule.upfront_count, 1)
        self.assertFalse(rule.materialize_all)

    def test_materialize_all_without_end_date_coerces_to_false(self):
        """A hand-edited materialize_all=true with no end_date would
        IntegrityError the whole atomic import (the
        recurring_materialize_all_requires_end check) - the flag degrades to
        False instead of skipping the rule (category-resolution precedent)."""
        export = self._v3(
            recurring_transactions=[
                {
                    'name': 'Hand edited',
                    'amount': '5.00',
                    'account_name': None,
                    'currency_code': 'PLN',
                    'interval_kind': 'monthly',
                    'interval_count': 1,
                    'start_date': '2026-01-05',
                    'upfront_count': 2,
                    'materialize_all': True,
                    'end_date': None,
                    'is_active': True,
                    'last_generated_date': None,
                }
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_recurring_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        rule = RecurringTransaction.objects.get(workspace__owner=self.user, name='Hand edited')
        self.assertFalse(rule.materialize_all)
        self.assertEqual(rule.upfront_count, 2)

    def test_materialize_all_rule_round_trip_generates_nothing(self):
        """A materialize_all rule whose pointer covers every occurrence up to
        end_date restores WITHOUT generating: the importer uses plain
        objects.create (never the service create), so restored rules never
        re-materialize what the source system generated."""
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace, name='Cash')
        RecurringTransactionFactory(
            account=account,
            workspace=self.workspace,
            currency=account.currency,
            name='Gym',
            interval_kind='monthly',
            start_date=date(2026, 1, 5),
            upfront_count=1,
            materialize_all=True,
            end_date=date(2026, 6, 5),
            last_generated_date=date(2026, 6, 5),
        )

        export = UserService.export_all_data(self.user)
        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_recurring_transactions'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        restored = (
            RecurringTransaction.objects.filter(name='Gym', workspace__owner=self.user)
            .exclude(workspace=self.workspace)
            .get()
        )
        self.assertTrue(restored.materialize_all)
        self.assertEqual(restored.end_date, date(2026, 6, 5))
        self.assertEqual(restored.last_generated_date, date(2026, 6, 5))
        # Import generated nothing on its own (no planned rows anywhere).
        self.assertEqual(PlannedTransaction.objects.count(), 0)
        # The pointer holds, mirroring the round-trip pointer test above:
        # the next occurrence would fall past end_date...
        self.assertIsNone(restored.next_occurrence_date)
        # ...and an explicit-clock pass over every rule (source and restored -
        # both exhausted) creates nothing further.
        self.assertEqual(RecurringTransactionService.generate_due(today=date(2026, 12, 31)), 0)
        self.assertEqual(PlannedTransaction.objects.count(), 0)


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

        # Line items restored in order; the source fixtures predate remainder
        # rows, so import-time normalization tops the item set up to coverage
        # (120.00 - 4.99 - 7.81) with a fresh remainder row.
        items = list(shop.items.filter(is_remainder=False))
        self.assertEqual([i.name for i in items], ['Bread', 'Tomatoes'])
        self.assertEqual(items[1].quantity, Decimal('0.782'))
        self.assertEqual(items[1].line_total, Decimal('7.81'))
        remainder = shop.items.get(is_remainder=True)
        self.assertEqual(remainder.line_total, Decimal('107.20'))

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

    def _source_and_adjustment_rows(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        pln = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')
        cash_pln = AccountFactory(workspace=self.workspace, currency=pln)
        card_usd = AccountFactory(workspace=self.workspace, currency=usd)
        source = TransactionFactory(
            account=card_usd,
            workspace=self.workspace,
            amount=Decimal('51.20'),
            type='expense',
            original_amount=Decimal('200.00'),
            original_currency=pln,
        )
        TransactionFactory(
            account=cash_pln,
            workspace=self.workspace,
            amount=Decimal('-200.00'),
            type='adjustment',
            source_transaction=source,
        )

    def test_delete_account_with_source_and_adjustment_rows(self):
        """The self-referential CASCADE inside the transactions table (linked
        auto-adjustments) adds no orphan class to account deletion."""
        self._source_and_adjustment_rows()

        ws_id = self.workspace.id
        UserService.delete_account(self.user, self.user_password)

        self.assertFalse(Workspace.objects.filter(id=ws_id).exists())
        self.assertFalse(Transaction.objects.filter(workspace_id=ws_id).exists())
        self.assertFalse(Account.objects.filter(workspace_id=ws_id).exists())

    def test_delete_workspace_financial_records_with_linked_adjustments(self):
        """Direct pin on the bulk delete: mixed source + generated rows in one
        table delete cleanly (the ordering invariant the workspace-delete and
        reset flows rely on - pinned per the data-deletion skill even though
        this task changes no production deletion code)."""
        self._source_and_adjustment_rows()

        from common.services.base import delete_workspace_financial_records

        ws_id = self.workspace.id
        delete_workspace_financial_records(ws_id)

        self.assertFalse(Transaction.objects.filter(workspace_id=ws_id).exists())
        self.assertFalse(Account.objects.filter(workspace_id=ws_id).exists())

    def test_delete_workspace_financial_records_with_recurring_rules(self):
        """A rule + a materialized row + the PROTECT-referenced account clear in
        one helper call (ordering invariant: rules delete after planned rows and
        before category budgets/accounts - pinned per the data-deletion skill so
        the NEXT FK change stays provable)."""
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace, name='Cash')
        rule = RecurringTransactionFactory(
            account=account,
            workspace=self.workspace,
            currency=account.currency,
            name='Rent',
            last_generated_date=date(2026, 10, 5),
        )
        PlannedTransactionFactory(
            account=account,
            workspace=self.workspace,
            currency=account.currency,
            name='Rent occurrence',
            recurring=rule,
        )

        from common.services.base import delete_workspace_financial_records

        ws_id = self.workspace.id
        delete_workspace_financial_records(ws_id)

        self.assertFalse(RecurringTransaction.objects.filter(workspace_id=ws_id).exists())
        self.assertFalse(PlannedTransaction.objects.filter(workspace_id=ws_id).exists())
        self.assertFalse(Account.objects.filter(workspace_id=ws_id).exists())


class V3BookmarkImportTests(AuthMixin, TestCase):
    """Bookmark round-trip, stale-file tolerance, hand-edited degradation."""

    def _make_import_input(self, data):
        from core.schemas import FullImportIn

        return FullImportIn(data=data)

    def _v3(self, **ws_extra):
        ws = {'workspace_name': 'Imported Workspace', 'enabled_currencies': [], 'accounts': [], 'budgets': []}
        ws.update(ws_extra)
        return {'export_version': '3.0', 'workspaces': [ws]}

    def _bookmark_row(self, **overrides):
        row = {
            'name': 'Card spends',
            'icon': 'bookmark',
            'color': 'neutral',
            'kind': 'transactions',
            'budget_name': None,
            'currency_code': None,
            'params_names': {},
            'position': 0,
            'is_active': True,
            'is_archived': False,
        }
        row.update(overrides)
        return row

    def test_bookmarks_round_trip_preserves_targets_order_flags_and_cap(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        cash = AccountFactory(workspace=self.workspace, name='Cash')
        card = AccountFactory(workspace=self.workspace, name='Card', currency=cash.currency)
        budget = BudgetFactory(workspace=self.workspace, name='Household')
        food = CategoryFactory(budget=budget, workspace=self.workspace, name='Food')
        BookmarkFactory(
            user=self.user,
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            budget=budget,
            currency_code='PLN',
            name='Household PLN',
            position=0,
        )
        BookmarkFactory(
            user=self.user,
            budget=None,
            currency_code=None,
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            kind='transactions',
            name='Card spends',
            position=1,
            is_active=False,
            params={'account': f'{cash.id},{card.id}', 'category': str(food.id), 'type': 'expense'},
        )
        BookmarkFactory(
            user=self.user,
            budget=None,
            currency_code=None,
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user,
            kind='planned',
            name='All planned',
            position=2,
            is_archived=True,
        )
        preferences = UserService.get_or_create_preferences(self.user)
        preferences.bookmark_visible_limit = 8
        preferences.save(update_fields=['bookmark_visible_limit'])

        export = UserService.export_all_data(self.user)
        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_bookmarks'], 3)
        self.assertEqual(result['skipped']['errors'], [])
        # Workspace ambiguity (skill rule): the imported copy is renamed, so
        # exclude the AuthMixin workspace instead of matching the new name.
        imported_ws = Workspace.objects.filter(owner=self.user).exclude(id=self.workspace.id).get()
        restored = list(Bookmark.objects.filter(user=self.user, workspace=imported_ws).order_by('position', 'id'))
        self.assertEqual([b.name for b in restored], ['Household PLN', 'Card spends', 'All planned'])
        self.assertEqual([b.position for b in restored], [0, 1, 2])
        budget_bm, tx_bm, planned_bm = restored
        # SAME resolved ids, derived from the RECREATED entities (names in
        # the new workspace), not from the source workspace's ids.
        new_cash = Account.objects.get(workspace=imported_ws, name='Cash')
        new_card = Account.objects.get(workspace=imported_ws, name='Card')
        new_food = Category.objects.get(workspace=imported_ws, name='Food')
        self.assertEqual(budget_bm.budget_id, Budget.objects.get(workspace=imported_ws, name='Household').id)
        self.assertEqual(budget_bm.currency_code, 'PLN')
        self.assertEqual(
            tx_bm.params,
            {'account': f'{new_cash.id},{new_card.id}', 'category': str(new_food.id), 'type': 'expense'},
        )
        self.assertFalse(tx_bm.is_active)
        self.assertTrue(planned_bm.is_archived)
        self.assertEqual(planned_bm.params, {})
        preferences.refresh_from_db()
        self.assertEqual(preferences.bookmark_visible_limit, 8)

    def test_legacy_export_without_bookmarks_section_imports_clean(self):
        """Pre-bookmarks v3 files lack the key (and the preferences key) - no crash, no rows."""
        export = self._v3(accounts=[{'name': 'Main', 'currency_code': 'PLN'}])

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_bookmarks'], 0)
        self.assertEqual(result['skipped']['errors'], [])
        self.assertEqual(Bookmark.objects.filter(user=self.user).exclude(workspace=self.workspace).count(), 0)

    def test_unresolvable_account_in_params_drops_id_with_error(self):
        """The recorded divergence: one bad id drops, the bookmark still imports."""
        export = self._v3(
            accounts=[{'name': 'Main', 'currency_code': 'PLN'}],
            bookmarks=[self._bookmark_row(params_names={'account': 'Main, Ghost', 'type': 'expense'})],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_bookmarks'], 1)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('unknown account', result['skipped']['errors'][0])
        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        bm = Bookmark.objects.get(workspace=ws, name='Card spends')
        main = Account.objects.get(workspace=ws, name='Main')
        self.assertEqual(bm.params, {'account': str(main.id), 'type': 'expense'})

    def test_all_unresolvable_category_drops_the_key_entirely(self):
        """A translated key with zero resolvable ids is removed - an empty CSV
        filter would narrow the bookmark to nothing."""
        export = self._v3(bookmarks=[self._bookmark_row(params_names={'category': 'A::B', 'type': 'expense'})])

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_bookmarks'], 1)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('unknown category', result['skipped']['errors'][0])
        ws = Workspace.objects.get(owner=self.user, name='Imported Workspace')
        self.assertEqual(Bookmark.objects.get(workspace=ws, name='Card spends').params, {'type': 'expense'})

    def test_unresolvable_budget_name_on_budget_bookmark_skips_row(self):
        export = self._v3(
            bookmarks=[self._bookmark_row(kind='budget', budget_name='Nope', currency_code='PLN')],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_bookmarks'], 0)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('unknown budget', result['skipped']['errors'][0])
        self.assertEqual(Bookmark.objects.filter(user=self.user).exclude(workspace=self.workspace).count(), 0)

    def test_unknown_kind_skips_row(self):
        export = self._v3(bookmarks=[self._bookmark_row(kind='weather')])

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_bookmarks'], 0)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('invalid kind', result['skipped']['errors'][0])

    def test_missing_name_or_kind_skips_row(self):
        export = self._v3(
            bookmarks=[
                self._bookmark_row(name=None),
                self._bookmark_row(name='No kind', kind=None),
            ],
        )

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_bookmarks'], 0)
        self.assertEqual(len(result['skipped']['errors']), 2)
        self.assertIn('missing name or kind', result['skipped']['errors'][0])
        self.assertIn('missing name or kind', result['skipped']['errors'][1])

    def test_duplicate_names_within_file_skip_second_row(self):
        """The CI unique constraint would IntegrityError the whole atomic
        import; the guard degrades to skipping the duplicate row."""
        export = self._v3(bookmarks=[self._bookmark_row(), self._bookmark_row(name='card spends')])

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['imported_bookmarks'], 1)
        self.assertEqual(len(result['skipped']['errors']), 1)
        self.assertIn('duplicate name', result['skipped']['errors'][0])

    def test_bookmark_visible_limit_degrades_on_invalid_value(self):
        export = self._v3()
        export['preferences'] = {'bookmark_visible_limit': 'lots'}

        result = UserService.import_all_data(self.user, self._make_import_input(export))

        self.assertEqual(result['skipped']['errors'], [])
        preferences = UserService.get_or_create_preferences(self.user)
        self.assertEqual(preferences.bookmark_visible_limit, 5)
