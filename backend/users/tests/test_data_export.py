"""Tests for GDPR data export (Right to Access & Portability)."""

import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.factories import AccountFactory
from budgeting.factories import BudgetFactory
from budgeting.models import BudgetCurrency
from common.tests.mixins import AuthMixin
from currencies.services import CurrencyCatalogService
from planned_transactions.factories import PlannedTransactionFactory
from transactions.factories import TransactionFactory
from users.models import UserConsent

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
