"""Tests for WorkspaceService and CurrencyService."""

from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.factories import BudgetPeriodFactory
from budgets.factories import BudgetFactory
from budgets.models import Budget
from categories.factories import CategoryFactory
from categories.models import Category
from common.exceptions import ValidationError
from common.tests.factories import UserFactory
from currency_exchanges.factories import CurrencyExchangeFactory
from currency_exchanges.models import CurrencyExchange
from period_balances.factories import PeriodBalanceFactory
from period_balances.models import PeriodBalance
from planned_transactions.factories import PlannedTransactionFactory
from planned_transactions.models import PlannedTransaction
from transactions.factories import TransactionFactory
from transactions.models import Transaction
from workspaces.exceptions import (
    CurrencyDuplicateSymbolError,
    CurrencyNotFoundError,
    WorkspaceMemberAlreadyExistsError,
    WorkspaceMemberCannotChangeOwnRoleError,
    WorkspaceMemberCannotRemoveSelfError,
    WorkspaceMemberCannotResetOwnPasswordError,
    WorkspaceMemberLimitReachedError,
    WorkspaceMemberPasswordRequiredError,
    WorkspaceNotFoundError,
    WorkspaceOwnerCannotLeaveError,
    WorkspaceOwnerPasswordResetError,
    WorkspaceOwnerRemoveError,
    WorkspaceOwnerRoleChangeError,
)
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.models import Currency, Workspace, WorkspaceMember
from workspaces.services import CurrencyService, WorkspaceMemberService, WorkspaceService


class TestWorkspaceServiceCreateWorkspace(TestCase):
    """Tests for WorkspaceService.create_workspace()."""

    def test_creates_workspace_with_owner_membership(self):
        """Test that create_workspace creates workspace with owner membership."""
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        self.assertIsInstance(workspace, Workspace)
        self.assertEqual(workspace.name, 'Test Workspace')
        self.assertEqual(workspace.owner, user)

        membership = WorkspaceMember.objects.filter(workspace=workspace, user=user).first()
        self.assertIsNotNone(membership)
        self.assertEqual(membership.role, 'owner')

    def test_creates_default_currencies(self):
        """Test that create_workspace creates 4 default currencies."""
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        currencies = list(Currency.objects.filter(workspace=workspace))
        self.assertEqual(len(currencies), 4)

        symbols = {c.symbol for c in currencies}
        self.assertEqual(symbols, {'USD', 'UAH', 'PLN', 'EUR'})

    def test_creates_general_budget_account_with_all_fields(self):
        """Test that create_workspace creates General BudgetAccount with all required fields."""
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        account = BudgetAccount.objects.filter(workspace=workspace, name='General').first()
        self.assertIsNotNone(account)
        self.assertEqual(account.description, 'General budget account')
        self.assertEqual(account.display_order, 0)
        self.assertEqual(account.created_by, user)
        self.assertTrue(account.is_active)

        pln = Currency.objects.get(workspace=workspace, symbol='PLN')
        self.assertEqual(account.default_currency, pln)

    def test_sets_user_current_workspace(self):
        """Test that create_workspace sets user.current_workspace to the new workspace."""
        user = UserFactory(current_workspace=None)
        self.assertIsNone(user.current_workspace)

        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        user.refresh_from_db()
        self.assertEqual(user.current_workspace, workspace)

    def test_with_create_demo_false_skips_demo_fixtures(self):
        """Test that create_demo=False skips demo fixtures but still creates currencies and account."""
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        currencies_count = Currency.objects.filter(workspace=workspace).count()
        self.assertEqual(currencies_count, 4)

        account_count = BudgetAccount.objects.filter(workspace=workspace).count()
        self.assertEqual(account_count, 1)

    def test_create_workspace_with_demo_fixtures(self):
        """Test that create_demo=True creates demo transactions, categories, budgets, etc."""
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Demo WS', create_demo=True)

        self.assertTrue(Transaction.objects.filter(budget_period__budget_account__workspace_id=workspace.id).exists())
        self.assertTrue(Category.objects.filter(budget_period__budget_account__workspace_id=workspace.id).exists())
        self.assertTrue(Budget.objects.filter(budget_period__budget_account__workspace_id=workspace.id).exists())
        self.assertTrue(
            PlannedTransaction.objects.filter(budget_period__budget_account__workspace_id=workspace.id).exists()
        )
        self.assertTrue(
            CurrencyExchange.objects.filter(budget_period__budget_account__workspace_id=workspace.id).exists()
        )


class TestWorkspaceServiceDeleteWorkspace(TestCase):
    """Tests for WorkspaceService.delete_workspace()."""

    def test_deletes_workspace_and_all_data(self):
        """Test that delete_workspace cascades all data including transactions."""
        from datetime import date

        user = UserFactory()
        WorkspaceService.create_workspace(user=user, name='Fallback', create_demo=False)
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        account = BudgetAccount.objects.filter(workspace=workspace).first()
        pln = Currency.objects.get(workspace=workspace, symbol='PLN')
        period = BudgetPeriodFactory(
            budget_account=account,
            workspace=workspace,
            name='Jan',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=user,
        )

        transaction = TransactionFactory(
            budget_period=period,
            workspace=workspace,
            date=date(2025, 1, 15),
            description='Test Transaction',
            amount=100,
            currency=pln,
            type='expense',
            created_by=user,
            updated_by=user,
        )
        planned = PlannedTransactionFactory(
            budget_period=period,
            workspace=workspace,
            name='Test Planned',
            amount=50,
            currency=pln,
            planned_date=date(2025, 1, 15),
            status='pending',
            created_by=user,
            updated_by=user,
        )
        exchange = CurrencyExchangeFactory(
            budget_period=period,
            workspace=workspace,
            date=date(2025, 1, 10),
            description='Test Exchange',
            from_currency=pln,
            from_amount=100,
            to_currency=pln,
            to_amount=25,
            created_by=user,
            updated_by=user,
        )

        workspace_id = workspace.id
        transaction_id = transaction.id
        planned_id = planned.id
        exchange_id = exchange.id

        WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)

        self.assertFalse(Workspace.objects.filter(id=workspace_id).exists())
        self.assertFalse(WorkspaceMember.objects.filter(workspace_id=workspace_id).exists())
        self.assertFalse(Currency.objects.filter(workspace_id=workspace_id).exists())
        self.assertFalse(BudgetAccount.objects.filter(workspace_id=workspace_id).exists())
        self.assertFalse(Transaction.objects.filter(id=transaction_id).exists())
        self.assertFalse(PlannedTransaction.objects.filter(id=planned_id).exists())
        self.assertFalse(CurrencyExchange.objects.filter(id=exchange_id).exists())

    def test_switches_user_to_next_workspace(self):
        """Test that delete_workspace switches requesting user to next workspace."""
        user = UserFactory()
        ws1 = WorkspaceService.create_workspace(user=user, name='Workspace 1', create_demo=False)
        ws2 = WorkspaceService.create_workspace(user=user, name='Workspace 2', create_demo=False)

        user.refresh_from_db()
        self.assertEqual(user.current_workspace, ws2)

        WorkspaceService.delete_workspace(user=user, workspace_id=ws2.id)

        user.refresh_from_db()
        self.assertEqual(user.current_workspace, ws1)

    def test_delete_workspace_succeeds_when_owner_has_no_other_workspace(self):
        """Test that delete_workspace succeeds and sets owner's current_workspace to None."""
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)

        user.refresh_from_db()
        self.assertIsNone(user.current_workspace_id)
        self.assertFalse(Workspace.objects.filter(id=workspace.id).exists())

    def test_delete_workspace_succeeds_when_member_has_only_this_workspace(self):
        """Deletion succeeds; sole-workspace member ends up with current_workspace=None."""
        owner = UserFactory()
        member = UserFactory()
        ws = WorkspaceService.create_workspace(user=owner, name='WS', create_demo=False)
        WorkspaceMemberFactory(workspace=ws, user=member, role='member')
        member.current_workspace = ws
        member.save()

        WorkspaceService.delete_workspace(user=owner, workspace_id=ws.id)

        member.refresh_from_db()
        self.assertIsNone(member.current_workspace_id)
        self.assertFalse(Workspace.objects.filter(id=ws.id).exists())

    def test_switches_all_affected_users(self):
        """Test that delete_workspace switches ALL users who had this as current workspace."""
        owner = UserFactory()
        member = UserFactory()

        workspace = WorkspaceService.create_workspace(user=owner, name='Test Workspace', create_demo=False)

        fallback = WorkspaceService.create_workspace(user=owner, name='Fallback', create_demo=False)
        WorkspaceMemberFactory(workspace=fallback, user=member, role='member')

        WorkspaceMemberFactory(workspace=workspace, user=member, role='member')
        member.current_workspace = workspace
        member.save()

        owner.current_workspace = workspace
        owner.save()

        WorkspaceService.delete_workspace(user=owner, workspace_id=workspace.id)

        owner.refresh_from_db()
        member.refresh_from_db()
        self.assertEqual(owner.current_workspace, fallback)
        self.assertEqual(member.current_workspace, fallback)

    def test_deletes_currency_exchange_with_null_budget_period(self):
        """Orphaned CurrencyExchange rows (budget_period=NULL) are deleted."""
        from datetime import date

        user = UserFactory()
        WorkspaceService.create_workspace(user=user, name='Fallback', create_demo=False)
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        account = BudgetAccount.objects.filter(workspace=workspace).first()
        pln = Currency.objects.get(workspace=workspace, symbol='PLN')
        period = BudgetPeriodFactory(
            budget_account=account,
            workspace=workspace,
            name='Jan',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=user,
        )

        exchange = CurrencyExchangeFactory(
            budget_period=period,
            workspace=workspace,
            date=date(2025, 1, 10),
            description='Test Exchange',
            from_currency=pln,
            from_amount=100,
            to_currency=pln,
            to_amount=25,
            created_by=user,
            updated_by=user,
        )
        exchange_id = exchange.id

        exchange.budget_period = None
        exchange.save()

        WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)

        self.assertFalse(CurrencyExchange.objects.filter(id=exchange_id).exists())

    def test_delete_workspace_cascades_category_budget_periodbalance(self):
        """Test that delete_workspace cascades to Category, Budget, and PeriodBalance."""
        from datetime import date

        user = UserFactory()
        WorkspaceService.create_workspace(user=user, name='Fallback', create_demo=False)
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        account = BudgetAccount.objects.filter(workspace=workspace).first()
        pln = Currency.objects.get(workspace=workspace, symbol='PLN')
        period = BudgetPeriodFactory(
            budget_account=account,
            workspace=workspace,
            name='Jan',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            created_by=user,
        )
        category = CategoryFactory(
            budget_period=period,
            workspace=workspace,
            name='Groceries',
            created_by=user,
        )
        budget = BudgetFactory(
            budget_period=period,
            workspace=workspace,
            category=category,
            currency=pln,
            amount=100,
            created_by=user,
            updated_by=user,
        )
        period_balance = PeriodBalanceFactory(
            budget_period=period,
            workspace=workspace,
            currency=pln,
            opening_balance=0,
            total_income=0,
            total_expenses=0,
            exchanges_in=0,
            exchanges_out=0,
            closing_balance=0,
        )

        category_id = category.id
        budget_id = budget.id
        period_balance_id = period_balance.id

        WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)

        self.assertFalse(Category.objects.filter(id=category_id).exists())
        self.assertFalse(Budget.objects.filter(id=budget_id).exists())
        self.assertFalse(PeriodBalance.objects.filter(id=period_balance_id).exists())


class TestCurrencyService(TestCase):
    """Tests for CurrencyService."""

    def test_list_currencies(self):
        """Test listing currencies for a workspace."""
        workspace = WorkspaceFactory()
        currencies = CurrencyService.list_currencies(workspace.id)
        self.assertEqual(len(currencies), 4)

    def test_get_currency(self):
        """Test getting a currency by ID within a workspace."""
        workspace = WorkspaceFactory()
        pln = Currency.objects.get(workspace=workspace, symbol='PLN')

        result = CurrencyService.get_currency(pln.id, workspace.id)
        self.assertEqual(result, pln)

    def test_get_currency_wrong_workspace(self):
        """Test that get_currency returns None for wrong workspace."""
        workspace1 = WorkspaceFactory()
        workspace2 = WorkspaceFactory()

        pln = Currency.objects.get(workspace=workspace1, symbol='PLN')
        result = CurrencyService.get_currency(pln.id, workspace2.id)
        self.assertIsNone(result)

    def test_create_currency(self):
        """Test creating a new currency."""
        workspace = WorkspaceFactory()

        class Data:
            symbol = 'GBP'
            name = 'British Pound'

        currency = CurrencyService.create_currency(workspace.id, Data())
        self.assertEqual(currency.symbol, 'GBP')
        self.assertEqual(currency.name, 'British Pound')
        self.assertEqual(currency.workspace_id, workspace.id)

    def test_create_duplicate_currency_fails(self):
        """Test that creating duplicate currency symbol raises CurrencyDuplicateSymbolError."""
        workspace = WorkspaceFactory()

        class Data:
            symbol = 'PLN'
            name = 'Polish Zloty'

        with self.assertRaises(CurrencyDuplicateSymbolError):
            CurrencyService.create_currency(workspace.id, Data())

    def test_delete_currency(self):
        """Test deleting a currency."""
        workspace = WorkspaceFactory()
        usd = Currency.objects.get(workspace=workspace, symbol='USD')

        CurrencyService.delete_currency(usd.id, workspace.id)

        self.assertFalse(Currency.objects.filter(id=usd.id).exists())

    def test_delete_currency_wrong_workspace(self):
        """Test that deleting currency from wrong workspace raises CurrencyNotFoundError."""
        workspace1 = WorkspaceFactory()
        workspace2 = WorkspaceFactory()

        usd = Currency.objects.get(workspace=workspace1, symbol='USD')

        with self.assertRaises(CurrencyNotFoundError):
            CurrencyService.delete_currency(usd.id, workspace2.id)


class TestWorkspaceMemberService(TestCase):
    """Tests for WorkspaceMemberService."""

    def test_validate_access_returns_workspace_on_success(self):
        """Test that validate_access returns the workspace when user is a member."""
        workspace = WorkspaceFactory()
        user = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=user, role='member')

        result = WorkspaceMemberService.validate_access(workspace.id, user)

        self.assertEqual(result, workspace)

    def test_validate_access_raises_for_nonexistent_workspace(self):
        """Test that validate_access raises WorkspaceNotFoundError for nonexistent workspace."""
        user = UserFactory()

        with self.assertRaises(WorkspaceNotFoundError):
            WorkspaceMemberService.validate_access(99999, user)

    def test_validate_access_raises_when_not_member(self):
        """Test that validate_access raises WorkspaceNotFoundError when user is not a member."""
        workspace = WorkspaceFactory()
        user = UserFactory()

        with self.assertRaises(WorkspaceNotFoundError):
            WorkspaceMemberService.validate_access(workspace.id, user)

    def test_add_member_existing_user(self):
        """Test adding an existing user to workspace."""
        workspace = WorkspaceFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')
        existing_user = UserFactory()

        class Data:
            email = existing_user.email
            role = 'member'
            password = None
            full_name = None

        result = WorkspaceMemberService.add_member(admin, workspace.id, Data())

        self.assertFalse(result['is_new_user'])
        self.assertEqual(result['user_id'], existing_user.id)
        self.assertTrue(WorkspaceMember.objects.filter(workspace=workspace, user=existing_user, role='member').exists())

    def test_add_member_new_user(self):
        """Test adding a new user (creates user with password)."""
        workspace = WorkspaceFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        class Data:
            email = 'newuser@example.com'
            role = 'viewer'
            password = 'testpass123'
            full_name = 'New User'

        result = WorkspaceMemberService.add_member(admin, workspace.id, Data())

        self.assertTrue(result['is_new_user'])
        new_member = WorkspaceMember.objects.get(id=result['member_id'])
        self.assertEqual(new_member.user.email, 'newuser@example.com')
        self.assertEqual(new_member.role, 'viewer')

    def test_add_member_duplicate_fails(self):
        """Test that adding duplicate member raises WorkspaceMemberAlreadyExistsError."""
        workspace = WorkspaceFactory()
        admin = UserFactory()
        existing_user = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')
        WorkspaceMemberFactory(workspace=workspace, user=existing_user, role='member')

        class Data:
            email = existing_user.email
            role = 'viewer'
            password = None
            full_name = None

        with self.assertRaises(WorkspaceMemberAlreadyExistsError):
            WorkspaceMemberService.add_member(admin, workspace.id, Data())

    def test_add_member_limit_reached(self):
        """Test that adding member when at limit raises WorkspaceMemberLimitReachedError."""
        from django.conf import settings

        workspace = WorkspaceFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='owner')

        for i in range(settings.WORKSPACE_MAX_MEMBERS - 1):
            user = UserFactory()
            WorkspaceMemberFactory(workspace=workspace, user=user, role='member')

        new_user = UserFactory()

        class Data:
            email = new_user.email
            role = 'member'
            password = None
            full_name = None

        with self.assertRaises(WorkspaceMemberLimitReachedError):
            WorkspaceMemberService.add_member(admin, workspace.id, Data())

    def test_add_member_password_required_for_new_user(self):
        """Test that new user without password raises WorkspaceMemberPasswordRequiredError."""
        workspace = WorkspaceFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        class Data:
            email = 'newuser@example.com'
            role = 'member'
            password = None
            full_name = None

        with self.assertRaises(WorkspaceMemberPasswordRequiredError):
            WorkspaceMemberService.add_member(admin, workspace.id, Data())

    def test_add_existing_user_with_no_workspace_sets_current(self):
        """Adding an existing user with current_workspace=None sets it to the new workspace."""
        workspace = WorkspaceFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')
        existing_user = UserFactory(current_workspace=None)

        class Data:
            email = existing_user.email
            role = 'member'
            password = None
            full_name = None

        WorkspaceMemberService.add_member(admin, workspace.id, Data())

        existing_user.refresh_from_db()
        self.assertEqual(existing_user.current_workspace_id, workspace.id)

    def test_add_existing_user_preserves_current_workspace(self):
        """Adding an existing user who already has a workspace does not change it."""
        workspace = WorkspaceFactory()
        other_ws = WorkspaceFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')
        existing_user = UserFactory(current_workspace=other_ws)

        class Data:
            email = existing_user.email
            role = 'member'
            password = None
            full_name = None

        WorkspaceMemberService.add_member(admin, workspace.id, Data())

        existing_user.refresh_from_db()
        self.assertEqual(existing_user.current_workspace_id, other_ws.id)

    def test_leave_success(self):
        """Test successfully leaving a workspace."""
        workspace = WorkspaceFactory()
        other_ws = WorkspaceFactory()
        member = UserFactory(current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=member, role='member')
        WorkspaceMemberFactory(workspace=other_ws, user=member, role='member')

        result = WorkspaceMemberService.leave(member, workspace.id)

        self.assertEqual(result['message'], 'Successfully left workspace')
        self.assertFalse(WorkspaceMember.objects.filter(workspace=workspace, user=member).exists())

    def test_leave_owner_blocked(self):
        """Test that owner cannot leave workspace."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')

        with self.assertRaises(WorkspaceOwnerCannotLeaveError):
            WorkspaceMemberService.leave(owner, workspace.id)

    def test_leave_auto_switches_workspace(self):
        """Test that leaving current workspace auto-switches to next available."""
        workspace = WorkspaceFactory()
        other_ws = WorkspaceFactory()
        member = UserFactory(current_workspace=workspace)
        WorkspaceMemberFactory(workspace=workspace, user=member, role='member')
        WorkspaceMemberFactory(workspace=other_ws, user=member, role='member')

        WorkspaceMemberService.leave(member, workspace.id)

        member.refresh_from_db()
        self.assertEqual(member.current_workspace, other_ws)

    def test_remove_member_success(self):
        """Test successfully removing a member from workspace."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        member = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        WorkspaceMemberFactory(workspace=workspace, user=member, role='member')

        WorkspaceMemberService.remove_member(owner, workspace.id, member.id, 'owner')

        self.assertFalse(WorkspaceMember.objects.filter(workspace=workspace, user=member).exists())

    def test_remove_member_self_removal_blocked(self):
        """Test that removing yourself raises WorkspaceMemberCannotRemoveSelfError."""
        workspace = WorkspaceFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        with self.assertRaises(WorkspaceMemberCannotRemoveSelfError):
            WorkspaceMemberService.remove_member(admin, workspace.id, admin.id, 'admin')

    def test_remove_member_owner_blocked(self):
        """Test that removing owner raises WorkspaceOwnerRemoveError."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        with self.assertRaises(WorkspaceOwnerRemoveError):
            WorkspaceMemberService.remove_member(admin, workspace.id, owner.id, 'admin')

    def test_update_role_success(self):
        """Test successfully updating a member's role."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        member = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        membership = WorkspaceMemberFactory(workspace=workspace, user=member, role='member')

        result = WorkspaceMemberService.update_role(owner, workspace.id, member.id, 'admin', 'owner')

        self.assertEqual(result['old_role'], 'member')
        self.assertEqual(result['new_role'], 'admin')
        membership.refresh_from_db()
        self.assertEqual(membership.role, 'admin')

    def test_update_role_own_role_blocked(self):
        """Test that changing own role raises WorkspaceMemberCannotChangeOwnRoleError."""
        workspace = WorkspaceFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        with self.assertRaises(WorkspaceMemberCannotChangeOwnRoleError):
            WorkspaceMemberService.update_role(admin, workspace.id, admin.id, 'member', 'admin')

    def test_update_role_owner_blocked(self):
        """Test that changing owner's role raises WorkspaceOwnerRoleChangeError."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        with self.assertRaises(WorkspaceOwnerRoleChangeError):
            WorkspaceMemberService.update_role(admin, workspace.id, owner.id, 'admin', 'admin')

    def test_reset_password_success(self):
        """Test successfully resetting a member's password."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        member = UserFactory(password='oldpassword')
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        WorkspaceMemberFactory(workspace=workspace, user=member, role='member')

        result = WorkspaceMemberService.reset_password(owner, workspace.id, member.id, 'newpassword123', 'owner')

        self.assertEqual(result['message'], 'Password reset successfully')
        member.refresh_from_db()
        self.assertTrue(member.check_password('newpassword123'))

    def test_reset_password_own_blocked(self):
        """Test that resetting own password raises WorkspaceMemberCannotResetOwnPasswordError."""
        workspace = WorkspaceFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        with self.assertRaises(WorkspaceMemberCannotResetOwnPasswordError):
            WorkspaceMemberService.reset_password(admin, workspace.id, admin.id, 'newpass', 'admin')

    def test_reset_password_owner_blocked(self):
        """Test that resetting owner's password raises WorkspaceOwnerPasswordResetError."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        admin = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        WorkspaceMemberFactory(workspace=workspace, user=admin, role='admin')

        with self.assertRaises(WorkspaceOwnerPasswordResetError):
            WorkspaceMemberService.reset_password(admin, workspace.id, owner.id, 'newpass', 'admin')

    def test_update_role_rejects_owner_role(self):
        """Test that update_role raises ValidationError when trying to assign owner role."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        member = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        WorkspaceMemberFactory(workspace=workspace, user=member, role='member')

        with self.assertRaises(ValidationError) as context:
            WorkspaceMemberService.update_role(owner, workspace.id, member.id, 'owner', 'owner')

        self.assertIn('owner', str(context.exception.message))
        self.assertIn('Cannot assign role', str(context.exception.message))

    def test_update_role_rejects_invalid_role_string(self):
        """Test that update_role raises ValidationError for invalid role strings."""
        workspace = WorkspaceFactory()
        owner = UserFactory()
        member = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
        WorkspaceMemberFactory(workspace=workspace, user=member, role='member')

        with self.assertRaises(ValidationError) as context:
            WorkspaceMemberService.update_role(owner, workspace.id, member.id, 'superadmin', 'owner')

        self.assertIn('superadmin', str(context.exception.message))
        self.assertIn('Cannot assign role', str(context.exception.message))
