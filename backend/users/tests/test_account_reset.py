"""Tests for the account reset endpoint (wipe to a fresh post-registration state)."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.factories import AccountFactory
from accounts.models import Account
from budgeting.models import Budget, Period
from categories.models import Category
from common.tests.factories import UserFactory
from common.tests.helpers import create_other_workspace
from common.tests.mixins import AuthMixin
from currencies.services import CurrencyCatalogService
from transactions.factories import TransactionFactory
from transactions.models import Transaction
from workspaces.factories import WorkspaceMemberFactory
from workspaces.models import Workspace, WorkspaceMember

User = get_user_model()


class AccountResetTests(AuthMixin, TestCase):
    def _reset(self, password=None, **extra):
        payload = {'password': password or self.user_password, **extra}
        return self.client.post(
            '/api/users/me/reset',
            payload,
            content_type='application/json',
            **self.auth_headers(),
        )

    def _seed_financial_data(self):
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        account = AccountFactory(workspace=self.workspace, opening_balance=Decimal('100.00'))
        TransactionFactory(account=account, workspace=self.workspace, amount=Decimal('50.00'), type='expense')

    def test_reset_deletes_owned_workspaces_and_creates_fresh_one(self):
        self._seed_financial_data()
        old_workspace_id = self.workspace.id

        response = self._reset(workspace_name='Fresh Start', currency_code='PLN')

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn(self.workspace.name, data['deleted_workspaces'])
        self.assertEqual(data['workspace_name'], 'Fresh Start')

        self.assertFalse(Workspace.objects.filter(id=old_workspace_id).exists())
        self.assertFalse(Transaction.objects.filter(workspace_id=old_workspace_id).exists())

        # User survives with the new workspace as current, fully set up.
        self.user.refresh_from_db()
        self.assertEqual(self.user.current_workspace_id, data['workspace_id'])
        new_ws = Workspace.objects.get(id=data['workspace_id'])
        self.assertEqual(new_ws.owner_id, self.user.id)
        self.assertTrue(Account.objects.filter(workspace=new_ws).exists())
        self.assertTrue(Budget.objects.filter(workspace=new_ws).exists())
        self.assertTrue(Period.objects.filter(workspace=new_ws).exists())
        self.assertTrue(Category.objects.filter(workspace=new_ws).exists())

    def test_reset_defaults_workspace_name_and_currency(self):
        response = self._reset()

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['workspace_name'], 'My Workspace')
        new_account = Account.objects.filter(workspace_id=data['workspace_id']).first()
        self.assertEqual(new_account.currency.code, 'PLN')

    def test_reset_wrong_password_returns_401(self):
        response = self._reset(password='wrongpassword')

        self.assertEqual(response.status_code, 401)
        self.assertTrue(Workspace.objects.filter(id=self.workspace.id).exists())

    def test_reset_deletes_shared_owned_workspace_but_keeps_member_users(self):
        """Unlike delete_account, shared owned workspaces don't block — but member users survive."""
        member = UserFactory(email='member@test.com', current_workspace=self.workspace)
        WorkspaceMemberFactory(workspace=self.workspace, user=member, role='member')

        response = self._reset(confirm_shared=True)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Workspace.objects.filter(id=self.workspace.id).exists())
        member.refresh_from_db()
        self.assertIsNone(member.current_workspace_id)  # SET_NULL, account intact
        self.assertTrue(User.objects.filter(id=member.id).exists())

    def test_reset_with_shared_workspace_requires_confirmation(self):
        member = UserFactory(email='member@test.com')
        WorkspaceMemberFactory(workspace=self.workspace, user=member, role='member')

        response = self._reset()

        self.assertEqual(response.status_code, 400)
        self.assertIn(self.workspace.name, response.json()['detail'])
        self.assertTrue(Workspace.objects.filter(id=self.workspace.id).exists())

    def test_reset_keeps_membership_in_others_workspace(self):
        other_ws, _, _ = create_other_workspace(owner_email='owner@test.com', workspace_name='Not Mine')
        WorkspaceMemberFactory(workspace=other_ws, user=self.user, role='member')

        response = self._reset()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Workspace.objects.filter(id=other_ws.id).exists())
        self.assertTrue(WorkspaceMember.objects.filter(workspace=other_ws, user=self.user).exists())

    def test_reset_keeps_user_credentials_and_preferences(self):
        from users.models import UserPreferences

        UserPreferences.objects.create(user=self.user)

        response = self._reset()

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.user_password))
        self.assertTrue(UserPreferences.objects.filter(user=self.user).exists())

    def test_reset_requires_auth(self):
        response = self.client.post(
            '/api/users/me/reset',
            {'password': 'x'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 401)
