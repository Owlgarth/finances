"""Tests for the read-time receipt values: suggestions, duplicates and the possible-duplicate flag."""

from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.factories import AccountFactory
from accounts.models import Account
from budgeting.factories import BudgetFactory
from categories.factories import CategoryFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService
from transactions.factories import ReceiptCaptureFactory, TransactionFactory, TransactionItemFactory
from transactions.models import ReceiptCapture
from transactions.receipts import ReceiptService, normalize_item_name
from workspaces.factories import WorkspaceFactory


def parsed(**overrides) -> dict:
    """A fresh parser-contract result (docs/parser-contract.md success example); every field can be overridden."""
    result = {
        'schema_version': '1',
        'merchant': 'Biedronka 4381',
        'date': '2026-06-28',
        'currency': 'PLN',
        'total': '87.43',
        'items': [{'name': 'Mleko UHT 3.2% 1L', 'quantity': '2', 'unit_price': '3.99', 'line_total': '7.98'}],
        'confidence': {'merchant': 0.88, 'date': 0.95, 'currency': 0.99, 'total': 0.97, 'items': 0.91},
        'warnings': [],
    }
    result.update(overrides)
    return result


class ReceiptSuggestionsTestCase(AuthMixin, APIClientMixin, TestCase):
    """An owner in a workspace with PLN enabled, one PLN account (not flagged default), a budget, two categories."""

    def setUp(self):
        super().setUp()
        self.pln = CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        self.account = AccountFactory(workspace=self.workspace, name='Main')
        self.budget = BudgetFactory(workspace=self.workspace)
        self.groceries = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Groceries')
        self.dairy = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Dairy')

    def _ready(self, result, merchant_key='biedronka'):
        """An open receipt that holds `result`."""
        return ReceiptCaptureFactory(
            workspace=self.workspace,
            created_by=self.user,
            state=ReceiptCapture.READY,
            result=result,
            merchant_key=merchant_key,
        )

    def _transaction(self, **overrides):
        """A PLN expense of 87.43 on 2026-06-28 on the workspace account; every field can be overridden.

        The date keyword is `day` (the model column is `date`, which reads as a
        Python keyword collision in these tests' call shapes).
        """
        day = overrides.pop('day', None)
        fields = {
            'account': self.account,
            'workspace': self.workspace,
            'description': 'Biedronka',
            'date': day if day is not None else date(2026, 6, 28),
            'amount': Decimal('87.43'),
            'type': 'expense',
            'created_by': self.user,
            'updated_by': self.user,
        }
        fields.update(overrides)
        return TransactionFactory(**fields)

    def _item(self, name, category=None, transaction_category=None, day=date(2026, 5, 1)):
        """One stored line item on a transaction of its own."""
        trans = self._transaction(day=day, category=transaction_category)
        return TransactionItemFactory(transaction=trans, position=0, name=name, category=category)

    def _saved(self, merchant_key, description, category=None, day=date(2026, 6, 1), result=None):
        """Merchant history: a transaction and the saved receipt that produced it."""
        trans = self._transaction(description=description, category=category, day=day)
        return ReceiptCaptureFactory(
            workspace=self.workspace,
            created_by=self.user,
            state=ReceiptCapture.SAVED,
            file_key='',
            transaction=trans,
            merchant_key=merchant_key,
            result=result,
        )

    def _other_workspace(self):
        """A second workspace with its own PLN account and budget."""
        workspace = WorkspaceFactory()
        return workspace, AccountFactory(workspace=workspace), BudgetFactory(workspace=workspace)

    def _ids(self, *names):
        """item_category_ids for a receipt whose line items are exactly `names`."""
        receipt = self._ready(parsed(items=[{'name': name} for name in names]))
        return ReceiptService.suggestions(self.workspace.id, receipt)['item_category_ids']

    def _account_id(self, result):
        """The suggested account for a receipt holding `result`."""
        return ReceiptService.suggestions(self.workspace.id, self._ready(result))['account_id']

    def _duplicate_ids(self, receipt):
        """Ids of a receipt's possible duplicates, newest first."""
        return [row['id'] for row in ReceiptService.duplicates(self.workspace.id, receipt)]


class TestNormalizeItemName(TestCase):
    def test_vectors(self):
        # Python only: str.lower() folds every Unicode letter (the SQL side follows the database locale).
        vectors = {
            'Mleko  UHT\t3,2%': 'mleko uht 3,2%',
            '  Mleko\tUHT\n ': 'mleko uht',
            '  Żabka\n ': 'żabka',
            'Chleb Pszenny': 'chleb pszenny',
            '   ': '',
            '': '',
            None: '',
            7: '',
        }
        for value, expected in vectors.items():
            with self.subTest(value=value):
                self.assertEqual(normalize_item_name(value), expected)


class TestMerchantSuggestions(ReceiptSuggestionsTestCase):
    """Merchant history: the (description, category_id) pair of the latest save with the receipt's key."""

    def _pair(self):
        suggestions = ReceiptService.suggestions(self.workspace.id, self._ready(parsed()))
        return suggestions['description'], suggestions['category_id']

    def test_saved_history_suggests_its_description_and_category(self):
        self._saved('biedronka', 'Biedronka groceries', category=self.groceries)
        # The account is the single-active fallback; nothing matches the one item.
        suggestions = ReceiptService.suggestions(self.workspace.id, self._ready(parsed()))
        self.assertEqual(
            suggestions,
            {
                'description': 'Biedronka groceries',
                'category_id': self.groceries.id,
                'account_id': self.account.id,
                'item_category_ids': [None],
            },
        )

    def test_latest_save_wins_even_when_its_transaction_is_older(self):
        first = self._saved('biedronka', 'Biedronka fresh', category=self.groceries, day=date(2026, 6, 20))
        self._saved('biedronka', 'Biedronka back-dated', category=self.dairy, day=date(2026, 5, 2))
        # updated_at is auto_now, so only .update() can set it.
        ReceiptCapture.objects.filter(id=first.id).update(updated_at=timezone.now() - timedelta(days=1))

        self.assertEqual(self._pair(), ('Biedronka back-dated', self.dairy.id))

    def test_same_timestamp_tiebreak_uses_newest_id(self):
        first = self._saved('biedronka', 'Biedronka first', category=self.groceries)
        second = self._saved('biedronka', 'Biedronka second', category=self.dairy)
        ReceiptCapture.objects.filter(id__in=[first.id, second.id]).update(updated_at=timezone.now())

        self.assertEqual(self._pair(), ('Biedronka second', self.dairy.id))

    def test_transaction_without_a_category_suggests_the_description_only(self):
        self._saved('biedronka', 'Biedronka')

        self.assertEqual(self._pair(), ('Biedronka', None))

    def test_archived_category_is_not_suggested(self):
        old = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Old', is_archived=True)
        self._saved('biedronka', 'Biedronka', category=old)

        self.assertEqual(self._pair(), ('Biedronka', None))

    def test_another_or_missing_merchant_key_is_no_history(self):
        self._saved('biedronka', 'Biedronka', category=self.groceries)
        for merchant_key in ('zabka', None):
            with self.subTest(merchant_key=merchant_key):
                suggestions = ReceiptService.suggestions(
                    self.workspace.id, self._ready(parsed(), merchant_key=merchant_key)
                )
                self.assertEqual((suggestions['description'], suggestions['category_id']), (None, None))

    def test_history_never_crosses_workspaces(self):
        other, other_account, other_budget = self._other_workspace()
        foreign = TransactionFactory(
            account=other_account,
            workspace=other,
            description='Foreign Biedronka',
            date=date(2026, 9, 9),
            amount=Decimal('1.00'),
            category=CategoryFactory(budget=other_budget, workspace=other, name='Foreign'),
        )
        ReceiptCaptureFactory(
            workspace=other, state=ReceiptCapture.SAVED, file_key='', transaction=foreign, merchant_key='biedronka'
        )

        self.assertEqual(self._pair(), (None, None))

    def test_no_history_gives_nulls_never_an_error(self):
        suggestions = ReceiptService.suggestions(self.workspace.id, self._ready(parsed()))
        self.assertEqual(
            suggestions,
            {'description': None, 'category_id': None, 'account_id': self.account.id, 'item_category_ids': [None]},
        )


class TestAccountSuggestion(ReceiptSuggestionsTestCase):
    """The account rule: flagged default for the receipt's currency, else the only active account."""

    def test_flagged_default_account_is_suggested(self):
        second = AccountFactory(workspace=self.workspace, name='Second', is_default_for_currency=True)

        self.assertEqual(self._account_id(parsed()), second.id)

    def test_the_only_active_account_is_the_fallback(self):
        self.assertEqual(self._account_id(parsed()), self.account.id)

    def test_no_default_and_several_active_accounts_gives_none(self):
        AccountFactory(workspace=self.workspace, name='Second')

        self.assertIsNone(self._account_id(parsed()))

    def test_an_archived_default_is_skipped(self):
        AccountFactory(workspace=self.workspace, name='Old', is_archived=True, is_default_for_currency=True)

        self.assertEqual(self._account_id(parsed()), self.account.id)

    def test_only_archived_accounts_gives_none(self):
        Account.objects.filter(id=self.account.id).update(is_archived=True)

        self.assertIsNone(self._account_id(parsed()))

    def test_account_follows_the_receipt_currency(self):
        usd = CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        dollars = AccountFactory(workspace=self.workspace, name='Dollars', currency=usd)
        Account.objects.filter(id=self.account.id).update(is_default_for_currency=True)

        self.assertEqual(self._account_id(parsed(currency='USD')), dollars.id)
        self.assertEqual(self._account_id(parsed()), self.account.id)

    def test_other_workspace_accounts_are_never_suggested(self):
        AccountFactory(workspace=WorkspaceFactory(), is_default_for_currency=True)

        self.assertEqual(self._account_id(parsed()), self.account.id)

    def test_no_currency_gives_no_account(self):
        self.assertIsNone(self._account_id(parsed(currency=None)))


class TestItemSuggestions(ReceiptSuggestionsTestCase):
    """item_category_ids: one line per receipt item, from the newest stored item of the same name."""

    def test_align_by_position_ignoring_case_and_whitespace(self):
        older = self._transaction(day=date(2026, 5, 1), category=self.groceries)
        TransactionItemFactory(transaction=older, position=0, name='Mleko UHT 3.2% 1L')
        newer = self._transaction(day=date(2026, 5, 2), category=self.dairy)
        TransactionItemFactory(transaction=newer, position=0, name='  CHLEB   ZYTNI 500G ', category=self.dairy)
        receipt = self._ready(
            parsed(items=[{'name': 'mleko uht  3.2% 1L'}, {'name': 'Chleb zytni 500g'}, {'name': 'Maslo'}])
        )

        suggestions = ReceiptService.suggestions(self.workspace.id, receipt)

        self.assertEqual(suggestions['item_category_ids'], [self.groceries.id, self.dairy.id, None])

    def test_stored_name_with_an_edge_tab_or_newline_still_pairs(self):
        # The SQL twin collapses first and trims after, so both keys equal the receipt's.
        trans = self._transaction(day=date(2026, 5, 1), category=self.groceries)
        TransactionItemFactory(transaction=trans, position=0, name='\tMleko UHT\n', category=self.dairy)
        TransactionItemFactory(transaction=trans, position=1, name='Maslo 500g\t', category=self.dairy)
        receipt = self._ready(parsed(items=[{'name': 'mleko uht'}, {'name': 'maslo 500g'}]))

        suggestions = ReceiptService.suggestions(self.workspace.id, receipt)

        self.assertEqual(suggestions['item_category_ids'], [self.dairy.id, self.dairy.id])

    def test_own_category_wins_over_the_transactions(self):
        self._item('Mleko', category=self.dairy, transaction_category=self.groceries)

        self.assertEqual(self._ids('Mleko'), [self.dairy.id])

    def test_newest_item_wins_by_transaction_date(self):
        self._item('Mleko', category=self.groceries, day=date(2026, 5, 1))
        self._item('Mleko', category=self.dairy, day=date(2026, 5, 2))

        self.assertEqual(self._ids('Mleko'), [self.dairy.id])

    def test_same_date_tiebreak_newest_transaction_then_newest_item(self):
        self._item('Mleko', category=self.groceries)
        self._item('Mleko', category=self.dairy)
        self.assertEqual(self._ids('Mleko'), [self.dairy.id])

        trans = self._transaction(day=date(2026, 5, 1))
        TransactionItemFactory(transaction=trans, position=0, name='Maslo', category=self.dairy)
        TransactionItemFactory(transaction=trans, position=1, name='Maslo', category=self.groceries)
        self.assertEqual(self._ids('Maslo'), [self.groceries.id])

    def test_archived_category_gives_none_without_fallback(self):
        archived = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Old', is_archived=True)
        self._item('Mleko', category=self.groceries, day=date(2026, 5, 1))
        self._item('Mleko', category=archived, day=date(2026, 5, 2))

        self.assertEqual(self._ids('Mleko'), [None])

    def test_no_items_gives_an_empty_list(self):
        without_key = parsed()
        del without_key['items']
        for result in (parsed(items=[]), parsed(items='Mleko'), without_key):
            with self.subTest(result=result):
                suggestions = ReceiptService.suggestions(self.workspace.id, self._ready(result))
                self.assertEqual(suggestions['item_category_ids'], [])

    def test_blank_name_never_matches_a_remainder_row(self):
        trans = self._transaction(category=self.groceries)
        TransactionItemFactory(transaction=trans, position=0, name='', is_remainder=True)

        self.assertEqual(self._ids('   ', ''), [None, None])

    def test_repeated_names_share_one_category(self):
        self._item('Mleko', category=self.groceries)

        self.assertEqual(self._ids('Mleko', 'MLEKO', 'mleko'), [self.groceries.id] * 3)

    def test_malformed_items_are_absent_never_an_error(self):
        receipt = self._ready(parsed(items=['Mleko', 5, None, {'name': 7}]))

        suggestions = ReceiptService.suggestions(self.workspace.id, receipt)

        self.assertEqual(suggestions['item_category_ids'], [None, None, None, None])

    def test_item_suggestions_never_cross_workspaces(self):
        other, other_account, other_budget = self._other_workspace()
        TransactionItemFactory(
            transaction=TransactionFactory(account=other_account, workspace=other, date=date(2026, 5, 1)),
            position=0,
            name='Mleko',
            category=CategoryFactory(budget=other_budget, workspace=other, name='Foreign'),
        )

        self.assertEqual(self._ids('Mleko'), [None])


class TestDuplicates(ReceiptSuggestionsTestCase):
    """duplicates: same currency, same absolute amount, dated within one day on both sides (D18)."""

    def test_matches_both_signs_including_adjustments(self):
        expense = self._transaction()
        adjustment = self._transaction(type='adjustment', amount=Decimal('-87.43'))
        receipt = self._ready(parsed())

        self.assertEqual(self._duplicate_ids(receipt), [adjustment.id, expense.id])
        self.assertEqual(self._duplicate_ids(self._ready(parsed(total='-87.43'))), [adjustment.id, expense.id])

    def test_window_is_one_day_on_each_side_inclusive(self):
        made = [self._transaction(day=date(2026, 6, 26) + timedelta(days=offset)) for offset in range(5)]
        receipt = self._ready(parsed())

        self.assertEqual(self._duplicate_ids(receipt), [made[3].id, made[2].id, made[1].id])

    def test_stops_at_three_newest_first(self):
        self._transaction(day=date(2026, 6, 27))
        self._transaction(day=date(2026, 6, 27))
        first_29th = self._transaction(day=date(2026, 6, 29))
        day_28 = self._transaction(day=date(2026, 6, 28))
        second_29th = self._transaction(day=date(2026, 6, 29))
        receipt = self._ready(parsed())

        self.assertEqual(self._duplicate_ids(receipt), [second_29th.id, first_29th.id, day_28.id])

    def test_matches_the_stored_own_currency_by_code(self):
        usd = CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        dollars = AccountFactory(workspace=self.workspace, name='Dollars', currency=usd)
        self._transaction(account=dollars)
        accountless = self._transaction(account=None, currency=self.pln)
        receipt = self._ready(parsed())

        self.assertEqual(self._duplicate_ids(receipt), [accountless.id])

    def test_only_the_exact_amount_matches(self):
        self._transaction(amount=Decimal('87.44'))
        self._transaction(amount=Decimal('874.30'))
        receipt = self._ready(parsed())

        self.assertEqual(self._duplicate_ids(receipt), [])

    def test_empty_without_total_currency_or_date(self):
        self._transaction()
        unusable = (
            {'total': None},
            {'total': 'abc'},
            {'total': 'NaN'},
            {'currency': None},
            {'currency': ''},
            {'date': None},
            {'date': '28.06.2026'},
            {'date': '9999-12-31'},
        )
        for override in unusable:
            with self.subTest(override=override):
                self.assertEqual(ReceiptService.duplicates(self.workspace.id, self._ready(parsed(**override))), [])

    def test_a_saved_receipt_gets_none(self):
        self._transaction()
        receipt = self._saved(
            'biedronka', 'Biedronka groceries', category=self.groceries, day=date(2026, 6, 28), result=parsed()
        )

        self.assertEqual(ReceiptService.duplicates(self.workspace.id, receipt), [])
        self.assertIsNone(ReceiptService.suggestions(self.workspace.id, receipt))
        self.assertEqual(ReceiptService.possible_duplicate_ids(self.workspace.id, [receipt]), set())

    def test_a_receipt_without_a_result_gets_none(self):
        self._transaction()
        receipt = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)

        self.assertEqual(ReceiptService.duplicates(self.workspace.id, receipt), [])
        self.assertIsNone(ReceiptService.suggestions(self.workspace.id, receipt))
        self.assertEqual(ReceiptService.possible_duplicate_ids(self.workspace.id, [receipt]), set())

    def test_duplicates_never_cross_workspaces(self):
        other, other_account, _ = self._other_workspace()
        TransactionFactory(account=other_account, workspace=other, date=date(2026, 6, 28), amount=Decimal('87.43'))
        receipt = self._ready(parsed())

        self.assertEqual(self._duplicate_ids(receipt), [])


class TestPossibleDuplicateIds(ReceiptSuggestionsTestCase):
    """possible_duplicate_ids: the flagged ids from one query over every listed receipt."""

    def test_flags_only_receipts_with_a_match_from_one_query(self):
        self._transaction()
        match = self._ready(parsed())
        missed = self._ready(parsed(total='10.00'))
        unread = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)

        with CaptureQueriesContext(connection) as queries:
            flagged = ReceiptService.possible_duplicate_ids(self.workspace.id, [match, missed, unread])

        self.assertEqual(flagged, {match.id})
        # A service call has no auth or middleware queries around it, so the
        # absolute number is this method's own contract: one query, not one per receipt.
        self.assertEqual(len(queries.captured_queries), 1)

    def test_pairs_transactions_back_to_their_own_receipts(self):
        self._transaction()
        self._transaction(amount=Decimal('10.00'), day=date(2026, 7, 1))
        first = self._ready(parsed())
        second = self._ready(parsed(total='10.00', date='2026-07-01'))
        third = self._ready(parsed(total='12.00'))

        flagged = ReceiptService.possible_duplicate_ids(self.workspace.id, [first, second, third])

        self.assertEqual(flagged, {first.id, second.id})

    def test_empty_when_no_receipt_has_a_usable_result(self):
        self._transaction()
        unread = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)

        self.assertEqual(ReceiptService.possible_duplicate_ids(self.workspace.id, [unread]), set())
        self.assertEqual(ReceiptService.possible_duplicate_ids(self.workspace.id, []), set())

    def test_a_saved_receipt_is_never_flagged(self):
        self._transaction()
        receipt = self._saved('biedronka', 'Biedronka', day=date(2026, 6, 28), result=parsed())

        self.assertEqual(ReceiptService.possible_duplicate_ids(self.workspace.id, [receipt]), set())

    def test_possible_duplicates_never_cross_workspaces(self):
        other, other_account, _ = self._other_workspace()
        TransactionFactory(account=other_account, workspace=other, date=date(2026, 6, 28), amount=Decimal('87.43'))
        receipt = self._ready(parsed())

        self.assertEqual(ReceiptService.possible_duplicate_ids(self.workspace.id, [receipt]), set())


class TestReceiptDetail(ReceiptSuggestionsTestCase):
    """GET /api/receipts/{id}: the receipt plus its suggestions, duplicates and flag."""

    def test_carries_suggestions_duplicates_and_the_flag(self):
        self._saved('biedronka', 'Biedronka groceries', category=self.groceries)
        Account.objects.filter(id=self.account.id).update(is_default_for_currency=True)
        duplicate = self._transaction(description='Biedronka 4381', day=date(2026, 6, 27))
        receipt = self._ready(parsed())

        data = self.get(f'/api/receipts/{receipt.id}', **self.auth_headers())

        self.assertStatus(200)
        self.assertEqual(
            data['suggestions'],
            {
                'description': 'Biedronka groceries',
                'category_id': self.groceries.id,
                'account_id': self.account.id,
                'item_category_ids': [None],
            },
        )
        self.assertEqual(
            data['duplicates'],
            [{'id': duplicate.id, 'date': '2026-06-27', 'description': 'Biedronka 4381', 'amount': '87.43'}],
        )
        self.assertTrue(data['possible_duplicate'])

    def test_query_count_is_constant_in_the_number_of_items(self):
        self._saved('biedronka', 'Biedronka groceries', category=self.groceries)
        for idx in range(20):
            TransactionItemFactory(
                transaction=self._transaction(day=date(2026, 5, 1) + timedelta(days=idx)),
                position=0,
                name=f'Item {idx}',
                category=self.groceries,
            )
        one = self._ready(parsed(items=[{'name': 'Item 0'}]))
        many = self._ready(parsed(items=[{'name': f'Item {idx}'} for idx in range(20)]))

        with CaptureQueriesContext(connection) as one_queries:
            data_one = self.get(f'/api/receipts/{one.id}', **self.auth_headers())
        with CaptureQueriesContext(connection) as many_queries:
            data_many = self.get(f'/api/receipts/{many.id}', **self.auth_headers())

        self.assertStatus(200)
        self.assertEqual(data_one['suggestions']['item_category_ids'], [self.groceries.id])
        self.assertEqual(data_many['suggestions']['item_category_ids'], [self.groceries.id] * 20)
        # auth, the receipt, merchant history, the account, ONE window query for
        # the items and the duplicates: as many for one item as for twenty.
        self.assertEqual(len(one_queries.captured_queries), len(many_queries.captured_queries))

    def test_without_a_result_suggestions_are_null_and_duplicates_empty(self):
        receipt = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)

        data = self.get(f'/api/receipts/{receipt.id}', **self.auth_headers())

        self.assertStatus(200)
        self.assertIsNone(data['suggestions'])
        self.assertEqual(data['duplicates'], [])
        self.assertFalse(data['possible_duplicate'])

    def test_a_saved_receipt_has_neither(self):
        # A matching transaction exists, but a saved receipt is past both computations.
        self._transaction()
        receipt = self._saved('biedronka', 'Biedronka', day=date(2026, 6, 1), result=parsed())

        data = self.get(f'/api/receipts/{receipt.id}', **self.auth_headers())

        self.assertStatus(200)
        self.assertIsNone(data['suggestions'])
        self.assertEqual(data['duplicates'], [])
        self.assertFalse(data['possible_duplicate'])
        self.assertEqual(data['transaction_id'], receipt.transaction_id)


class TestReceiptList(ReceiptSuggestionsTestCase):
    """GET /api/receipts: every row carries the flag, computed for the whole page in one query."""

    def test_rows_carry_possible_duplicate(self):
        self._transaction()
        flagged = self._ready(parsed())
        clean = self._ready(parsed(total='10.00'))
        unread = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)

        data = self.get('/api/receipts', **self.auth_headers())

        self.assertStatus(200)
        flags = {row['id']: row['possible_duplicate'] for row in data['items']}
        self.assertEqual(flags, {flagged.id: True, clean.id: False, unread.id: False})

    def test_query_count_is_constant_in_the_number_of_receipts(self):
        self._transaction()
        self._ready(parsed())
        with CaptureQueriesContext(connection) as one:
            data_one = self.get('/api/receipts', **self.auth_headers())
        self._ready(parsed(total='10.00'))
        self._ready(parsed(total='12.00'))
        with CaptureQueriesContext(connection) as many:
            data_many = self.get('/api/receipts', **self.auth_headers())

        self.assertEqual(len(data_one['items']), 1)
        self.assertEqual(len(data_many['items']), 3)
        self.assertEqual(len(one.captured_queries), len(many.captured_queries))

    def test_a_queued_row_that_still_holds_a_result_gets_nothing(self):
        # A retry from ready keeps the old result in the column; only a ready receipt puts it on the wire.
        self._transaction()
        retried = self._ready(parsed())
        ReceiptCapture.objects.filter(id=retried.id).update(state=ReceiptCapture.QUEUED)
        retried.refresh_from_db()

        self.assertIsNone(ReceiptService.suggestions(self.workspace.id, retried))
        self.assertEqual(ReceiptService.duplicates(self.workspace.id, retried), [])
        self.assertEqual(ReceiptService.possible_duplicate_ids(self.workspace.id, [retried]), set())
        data = self.get('/api/receipts', **self.auth_headers())

        self.assertStatus(200)
        self.assertEqual(
            [(row['id'], row['result'], row['possible_duplicate']) for row in data['items']],
            [(retried.id, None, False)],
        )


class TestEmptyWorkspace(AuthMixin, APIClientMixin, TestCase):
    def test_a_receipt_without_any_history_gives_nulls_never_an_error(self):
        receipt = ReceiptCaptureFactory(
            workspace=self.workspace,
            created_by=self.user,
            state=ReceiptCapture.READY,
            result=parsed(),
            merchant_key='biedronka',
        )

        suggestions = ReceiptService.suggestions(self.workspace.id, receipt)
        self.assertEqual(
            suggestions,
            {'description': None, 'category_id': None, 'account_id': None, 'item_category_ids': [None]},
        )
        self.assertEqual(ReceiptService.duplicates(self.workspace.id, receipt), [])
        self.assertEqual(ReceiptService.possible_duplicate_ids(self.workspace.id, [receipt]), set())
        data = self.get(f'/api/receipts/{receipt.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertIsNone(data['suggestions']['description'])
        self.assertEqual(data['duplicates'], [])
        self.assertFalse(data['possible_duplicate'])
