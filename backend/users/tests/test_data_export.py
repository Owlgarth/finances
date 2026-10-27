"""Tests for GDPR data export (Right to Access & Portability)."""

import json
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.factories import AccountFactory
from bookmarks.factories import BookmarkFactory
from budgeting.factories import BudgetFactory
from budgeting.models import BudgetCurrency
from categories.factories import CategoryFactory
from common.tests.factories import UserFactory
from common.tests.mixins import AuthMixin
from currencies.services import CurrencyCatalogService
from planned_transactions.factories import PlannedTransactionFactory, RecurringTransactionFactory
from transactions.factories import TransactionFactory, TransactionItemFactory
from users.models import UserConsent
from users.services import UserService
from workspaces.factories import UserWorkspaceSettingsFactory, WorkspaceMemberFactory

User = get_user_model()


class DataExportTests(AuthMixin, TestCase):
    """Tests for GDPR data export endpoint."""

    def test_export_returns_json_file(self):
        """Export should return JSON with correct Content-Type and Content-Disposition headers."""
        response = self.client.get('/api/users/me/export', **self.auth_headers())

        self.assertEqual(response.status_code, 200)
        self.assertIn('application/json', response['Content-Type'])
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertIn('owlgarth_finances_data_export', response['Content-Disposition'])

    def test_export_contains_profile_data(self):
        """Export should contain user profile information."""
        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertEqual(data['profile']['email'], self.user.email)
        self.assertEqual(data['profile']['full_name'], self.user.full_name)
        self.assertIn('created_at', data['profile'])

    def test_export_contains_workspace_data(self):
        """Export should contain workspace data for the user's workspaces."""
        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertIn('workspaces', data)
        workspace_names = [ws['workspace_name'] for ws in data['workspaces']]
        self.assertIn(self.workspace.name, workspace_names)

    def test_export_contains_consent_records(self):
        """Export should include all consent records."""
        UserConsent.objects.create(user=self.user, consent_type='terms_of_service', version='1.0')
        UserConsent.objects.create(user=self.user, consent_type='privacy_policy', version='1.0')

        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertEqual(len(data['consents']), 2)
        consent_types = {c['consent_type'] for c in data['consents']}
        self.assertEqual(consent_types, {'terms_of_service', 'privacy_policy'})

    def test_export_has_valid_structure(self):
        """Export should have all required top-level keys."""
        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        required_keys = {
            'export_version',
            'exported_at',
            'profile',
            'preferences',
            'consents',
            'workspaces',
            'two_factor',
        }
        self.assertEqual(set(data.keys()), required_keys)

    def test_export_excludes_other_users_data(self):
        """Export should not contain data from other users."""
        other_user = User.objects.create_user(email='other@test.com', password='pass12345')

        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertEqual(data['profile']['email'], self.user.email)
        self.assertNotEqual(data['profile']['email'], other_user.email)

    def test_export_handles_user_with_no_preferences(self):
        """Export with no preferences should return null for preferences field."""
        # Delete preferences if they exist
        try:
            self.user.preferences.delete()
        except Exception:
            pass

        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        self.assertIsNone(data['preferences'])

    def test_export_contains_budget_currency_codes(self):
        """Budget currency sets export as ordered currency_codes lists."""
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        pln = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        budget = BudgetFactory(workspace=self.workspace, name='Household')
        BudgetCurrency.objects.create(budget=budget, currency=pln, position=0)
        BudgetCurrency.objects.create(budget=budget, currency=usd, position=1)

        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        exported_budget = next(b for b in data['workspaces'][0]['budgets'] if b['name'] == 'Household')
        self.assertEqual(exported_budget['currency_codes'], ['PLN', 'USD'])
        self.assertNotIn('display_currency_code', exported_budget)

    def test_export_contains_account_less_transaction_and_planned(self):
        """Account-less rows export account_name None plus their own currency code."""
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        pln = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')
        TransactionFactory(
            account=None,
            currency=pln,
            workspace=self.workspace,
            description='Tip jar',
            amount=Decimal('20.00'),
            type='expense',
        )
        PlannedTransactionFactory(
            account=None,
            currency=pln,
            workspace=self.workspace,
            name='Future tips',
            amount=Decimal('10.00'),
        )

        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        exported_tx = next(t for t in data['workspaces'][0]['transactions'] if t['description'] == 'Tip jar')
        self.assertIsNone(exported_tx['account_name'])
        self.assertEqual(exported_tx['currency_code'], 'PLN')

        exported_pt = next(p for p in data['workspaces'][0]['planned_transactions'] if p['name'] == 'Future tips')
        self.assertIsNone(exported_pt['account_name'])
        self.assertEqual(exported_pt['currency_code'], 'PLN')

    def test_export_contains_transaction_note(self):
        """The optional transaction note serializes into the v3 export."""
        account = AccountFactory(workspace=self.workspace)
        TransactionFactory(
            account=account,
            workspace=self.workspace,
            description='Noted expense',
            note='Reimbursable',
            amount=Decimal('15.00'),
            type='expense',
        )
        TransactionFactory(
            account=account,
            workspace=self.workspace,
            description='Plain expense',
            amount=Decimal('10.00'),
            type='expense',
        )

        response = self.client.get('/api/users/me/export', **self.auth_headers())
        data = json.loads(response.content)

        exported_tx = next(t for t in data['workspaces'][0]['transactions'] if t['description'] == 'Noted expense')
        self.assertEqual(exported_tx['note'], 'Reimbursable')
        plain_tx = next(t for t in data['workspaces'][0]['transactions'] if t['description'] == 'Plain expense')
        self.assertIsNone(plain_tx['note'])

    def test_export_rate_limited(self):
        """Export endpoint should be rate limited to 3 requests per hour."""
        # Make 3 successful requests
        for _ in range(3):
            response = self.client.get('/api/users/me/export', **self.auth_headers())
            self.assertEqual(response.status_code, 200)

        # 4th request should be rate limited
        response = self.client.get('/api/users/me/export', **self.auth_headers())
        self.assertEqual(response.status_code, 429)


class FacetAdjustmentExportTests(AuthMixin, TestCase):
    """Derived auto-adjustments never serialize; the source row names the account."""

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
            description='Converted card payment',
            amount=Decimal('51.20'),
            type='expense',
            original_amount=Decimal('200.00'),
            original_currency=pln,
        )
        TransactionFactory(
            account=cash_pln,
            workspace=self.workspace,
            description='Auto adjustment',
            amount=Decimal('-200.00'),
            type='adjustment',
            source_transaction=source,
        )

    def test_export_excludes_derived_adjustment_and_names_facet_account(self):
        self._linked_pair()

        data = UserService.export_all_data(self.user)

        rows = data['workspaces'][0]['transactions']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['description'], 'Converted card payment')
        self.assertEqual(rows[0]['original_account_name'], 'Cash PLN')
        self.assertNotIn('source_transaction', rows[0])

    def test_export_informational_facet_emits_null_original_account_name(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        pln = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')
        card_usd = AccountFactory(workspace=self.workspace, currency=usd)
        TransactionFactory(
            account=card_usd,
            workspace=self.workspace,
            description='Plain facet',
            amount=Decimal('10.00'),
            type='expense',
            original_amount=Decimal('40.00'),
            original_currency=pln,
        )

        data = UserService.export_all_data(self.user)

        rows = data['workspaces'][0]['transactions']
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]['original_account_name'])


class ItemCategoryExportTests(AuthMixin, TestCase):
    """Item categories and the remainder flag serialize into the v3 export."""

    def test_export_contains_item_categories_and_remainder_flag(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace)
        budget = BudgetFactory(workspace=self.workspace, name='Household')
        food = CategoryFactory(budget=budget, workspace=self.workspace, name='Food')
        home = CategoryFactory(budget=budget, workspace=self.workspace, name='Home')
        shop = TransactionFactory(
            account=account,
            workspace=self.workspace,
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

        data = UserService.export_all_data(self.user)

        exported_tx = next(t for t in data['workspaces'][0]['transactions'] if t['description'] == 'Weekly shop')
        self.assertEqual(
            [(i['name'], i['category_name'], i['is_remainder']) for i in exported_tx['items']],
            [('Bread', 'Food', False), ('Detergent', 'Home', False), ('Rest', None, True)],
        )

    def test_export_item_keys_stay_additive(self):
        """The item dict keeps the four legacy keys so older readers (and the
        pre-change key set) stay stable - additive contract, no version bump."""
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace)
        shop = TransactionFactory(
            account=account,
            workspace=self.workspace,
            description='Plain shop',
            amount=Decimal('10.00'),
            type='expense',
        )
        TransactionItemFactory(transaction=shop, position=0, name='Bread', line_total=Decimal('10.00'))

        data = UserService.export_all_data(self.user)

        exported_tx = next(t for t in data['workspaces'][0]['transactions'] if t['description'] == 'Plain shop')
        self.assertEqual(
            set(exported_tx['items'][0]),
            {'name', 'quantity', 'unit_price', 'line_total', 'category_name', 'is_remainder'},
        )
        self.assertIsNone(exported_tx['items'][0]['category_name'])
        self.assertFalse(exported_tx['items'][0]['is_remainder'])


class RecurringExportTests(AuthMixin, TestCase):
    """Recurring rules serialize into the v3 export with their pointer."""

    def test_export_contains_recurring_rules_with_last_generated_date(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        pln = CurrencyCatalogService.get_enabled(self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace, name='Cash')
        RecurringTransactionFactory(
            account=account,
            workspace=self.workspace,
            currency=account.currency,
            name='Rent',
            amount=Decimal('1200.00'),
            interval_kind='monthly',
            interval_count=1,
            start_date=date(2026, 1, 5),
            upfront_count=3,
            end_date=None,
            is_active=True,
            last_generated_date=date(2026, 10, 5),
            created_by=self.user,
            updated_by=self.user,
        )
        RecurringTransactionFactory(
            account=None,
            currency=pln,
            workspace=self.workspace,
            name='Accountless rule',
            amount=Decimal('10.00'),
            last_generated_date=None,
        )
        # materialize_all requires end_date at the DB level, so the pair
        # travels together here and in every import test below.
        RecurringTransactionFactory(
            account=account,
            workspace=self.workspace,
            currency=account.currency,
            name='Home wifi',
            amount=Decimal('60.00'),
            interval_kind='monthly',
            interval_count=1,
            start_date=date(2026, 1, 5),
            upfront_count=1,
            materialize_all=True,
            end_date=date(2026, 12, 5),
            last_generated_date=date(2026, 12, 5),
            created_by=self.user,
            updated_by=self.user,
        )

        data = UserService.export_all_data(self.user)

        rules = data['workspaces'][0]['recurring_transactions']
        rent = next(r for r in rules if r['name'] == 'Rent')
        self.assertEqual(rent['account_name'], 'Cash')
        self.assertEqual(rent['currency_code'], account.currency.code)
        self.assertEqual(rent['interval_kind'], 'monthly')
        self.assertEqual(rent['interval_count'], 1)
        self.assertEqual(rent['start_date'], '2026-01-05')
        self.assertEqual(rent['upfront_count'], 3)
        self.assertFalse(rent['materialize_all'])
        self.assertIsNone(rent['end_date'])
        self.assertTrue(rent['is_active'])
        self.assertEqual(rent['last_generated_date'], '2026-10-05')
        wifi = next(r for r in rules if r['name'] == 'Home wifi')
        self.assertTrue(wifi['materialize_all'])
        self.assertEqual(wifi['upfront_count'], 1)
        self.assertEqual(wifi['end_date'], '2026-12-05')
        self.assertEqual(wifi['last_generated_date'], '2026-12-05')
        accountless = next(r for r in rules if r['name'] == 'Accountless rule')
        self.assertIsNone(accountless['account_name'])
        self.assertEqual(accountless['currency_code'], 'PLN')
        self.assertIsNone(accountless['last_generated_date'])
        self.assertEqual(accountless['upfront_count'], 1)
        self.assertFalse(accountless['materialize_all'])
        # The swapped-out key is gone: the no-version-bump contract relies on
        # old readers defaulting it, so nothing may resurrect it.
        self.assertNotIn('lead_days', rent)


class BookmarkExportTests(AuthMixin, TestCase):
    """Bookmarks serialize into the v3 export with params translated to names."""

    def test_export_contains_bookmarks_with_translated_params(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace, name='Cash')
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
            icon='wallet',
            color='positive',
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
            params={'account': str(account.id), 'category': str(food.id), 'type': 'expense'},
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
        # Personal rows only: another member's bookmark in the same workspace
        # must stay out of this user's export.
        other_user = UserFactory(email='other@test.com')
        WorkspaceMemberFactory(workspace=self.workspace, user=other_user)
        BookmarkFactory(
            user=other_user,
            budget=None,
            currency_code=None,
            workspace=self.workspace,
            created_by=other_user,
            updated_by=other_user,
            kind='transactions',
            name='Theirs',
        )
        preferences = UserService.get_or_create_preferences(self.user)
        preferences.bookmark_visible_limit = 8
        preferences.save(update_fields=['bookmark_visible_limit'])

        data = UserService.export_all_data(self.user)

        # Additive preferences key rides the existing preferences dict.
        self.assertEqual(data['preferences']['bookmark_visible_limit'], 8)
        bookmarks = data['workspaces'][0]['bookmarks']
        self.assertEqual([b['name'] for b in bookmarks], ['Household PLN', 'Card spends', 'All planned'])
        budget_bm, tx_bm, planned_bm = bookmarks
        self.assertEqual(budget_bm['kind'], 'budget')
        self.assertEqual(budget_bm['budget_name'], 'Household')
        self.assertEqual(budget_bm['currency_code'], 'PLN')
        self.assertEqual(budget_bm['params_names'], {})
        self.assertTrue(budget_bm['is_active'])  # default survived
        self.assertEqual(tx_bm['kind'], 'transactions')
        self.assertIsNone(tx_bm['budget_name'])
        self.assertIsNone(tx_bm['currency_code'])
        # Id CSVs translated to names; the non-id key rides verbatim.
        self.assertEqual(tx_bm['params_names'], {'account': 'Cash', 'category': 'Household::Food', 'type': 'expense'})
        self.assertFalse(tx_bm['is_active'])
        self.assertTrue(planned_bm['is_archived'])
        self.assertEqual([b['position'] for b in bookmarks], [0, 1, 2])


class MemberSettingsExportTests(AuthMixin, TestCase):
    """Per-workspace member view settings export as-is, personal rows only."""

    def test_export_contains_member_settings_blob(self):
        blob = {
            'planned': {'status': 'pending', 'range': 'month', 'view': 'recurring', 'ordering': 'name'},
            'transactions': {'range': None, 'type': ['income', 'expense'], 'ordering': '-date'},
            'transfers': {'range': 'week'},
        }
        UserWorkspaceSettingsFactory(
            workspace=self.workspace,
            user=self.user,
            created_by=self.user,
            updated_by=self.user,
            settings=blob,
        )
        # Personal rows only: another member's row in the same workspace
        # must stay out of this user's export.
        other_user = UserFactory(email='other@test.com')
        WorkspaceMemberFactory(workspace=self.workspace, user=other_user)
        UserWorkspaceSettingsFactory(
            workspace=self.workspace,
            user=other_user,
            created_by=other_user,
            updated_by=other_user,
            settings={
                'planned': {'status': 'done', 'range': 'year', 'view': None, 'ordering': None},
                'transactions': {'range': None, 'type': None, 'ordering': None},
                'transfers': {'range': None},
            },
        )

        data = UserService.export_all_data(self.user)

        # The blob rides verbatim - no id translation, no normalization.
        self.assertEqual(data['workspaces'][0]['member_settings'], blob)

    def test_export_without_settings_row_emits_null(self):
        data = UserService.export_all_data(self.user)

        self.assertIsNone(data['workspaces'][0]['member_settings'])
