"""Tests for WorkspaceService and WorkspaceMemberService."""

from datetime import date

from django.test import TestCase

from accounts.factories import AccountFactory
from accounts.models import Account
from budgeting.factories import BudgetFactory
from budgeting.models import Budget, CategoryBudget
from budgeting.services import PeriodService
from categories.factories import CategoryFactory
from categories.models import Category
from common.exceptions import ValidationError
from common.tests.factories import UserFactory
from currencies.services import CurrencyCatalogService
from planned_transactions.factories import PlannedTransactionFactory
from planned_transactions.models import PlannedTransaction
from transactions.factories import TransactionFactory
from transactions.models import Transaction
from transfers.factories import TransferFactory
from transfers.models import Transfer
from workspaces.exceptions import (
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
    WorkspacePermissionDeniedError,
)
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.models import Workspace, WorkspaceMember
from workspaces.services import WorkspaceMemberService, WorkspaceService


class TestWorkspaceServiceCreateWorkspace(TestCase):
    """Tests for WorkspaceService.create_workspace()."""

    def test_creates_workspace_with_owner_membership(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        self.assertIsInstance(workspace, Workspace)
        self.assertEqual(workspace.name, 'Test Workspace')
        self.assertEqual(workspace.owner, user)

        membership = WorkspaceMember.objects.filter(workspace=workspace, user=user).first()
        self.assertIsNotNone(membership)
        self.assertEqual(membership.role, 'owner')

    def test_creates_single_enabled_currency(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        enabled = CurrencyCatalogService.list_enabled(workspace.id)
        self.assertEqual([c.code for c in enabled], ['PLN'])

    def test_creates_workspace_with_explicit_currency(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(
            user=user, name='Euro Workspace', currency_code='EUR', create_demo=False
        )

        enabled = CurrencyCatalogService.list_enabled(workspace.id)
        self.assertEqual([c.code for c in enabled], ['EUR'])

        account = Account.objects.filter(workspace=workspace, name='Main').first()
        self.assertEqual(account.currency.code, 'EUR')

    def test_creates_main_account_and_general_budget(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        account = Account.objects.filter(workspace=workspace, name='Main').first()
        self.assertIsNotNone(account)
        self.assertEqual(account.currency.code, 'PLN')
        self.assertEqual(account.created_by, user)
        self.assertFalse(account.is_archived)

        budget = Budget.objects.filter(workspace=workspace, name='General').first()
        self.assertIsNotNone(budget)

    def test_sets_user_current_workspace(self):
        user = UserFactory(current_workspace=None)
        self.assertIsNone(user.current_workspace)

        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        user.refresh_from_db()
        self.assertEqual(user.current_workspace, workspace)

    def test_with_create_demo_false_skips_demo_fixtures(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        self.assertEqual(Account.objects.filter(workspace=workspace).count(), 1)
        self.assertFalse(Transaction.objects.for_workspace(workspace.id).exists())

    def test_create_workspace_with_demo_fixtures(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Demo WS', create_demo=True)

        self.assertTrue(Transaction.objects.for_workspace(workspace.id).exists())
        self.assertTrue(Category.objects.for_workspace(workspace.id).filter(budget__name='General').exists())
        self.assertTrue(PlannedTransaction.objects.for_workspace(workspace.id).exists())
        self.assertTrue(Transfer.objects.for_workspace(workspace.id).exists())


class TestWorkspaceServiceDeleteWorkspace(TestCase):
    """Tests for WorkspaceService.delete_workspace()."""

    def test_deletes_workspace_and_all_data(self):
        user = UserFactory()
        WorkspaceService.create_workspace(user=user, name='Fallback', create_demo=False)
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        account = Account.objects.filter(workspace=workspace, name='Main').first()
        second = AccountFactory(workspace=workspace, name='Savings', currency=account.currency)
        transaction = TransactionFactory(
            account=account, workspace=workspace, amount=100, type='expense', created_by=user, updated_by=user
        )
        planned = PlannedTransactionFactory(
            account=account, workspace=workspace, amount=50, status='pending', created_by=user, updated_by=user
        )
        transfer = TransferFactory(
            from_account=account, to_account=second, workspace=workspace, created_by=user, updated_by=user
        )

        workspace_id = workspace.id
        transaction_id = transaction.id
        planned_id = planned.id
        transfer_id = transfer.id

        WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)

        self.assertFalse(Workspace.objects.filter(id=workspace_id).exists())
        self.assertFalse(WorkspaceMember.objects.filter(workspace_id=workspace_id).exists())
        self.assertFalse(Account.objects.filter(workspace_id=workspace_id).exists())
        self.assertFalse(Transaction.objects.filter(id=transaction_id).exists())
        self.assertFalse(PlannedTransaction.objects.filter(id=planned_id).exists())
        self.assertFalse(Transfer.objects.filter(id=transfer_id).exists())

    def test_switches_user_to_next_workspace(self):
        user = UserFactory()
        ws1 = WorkspaceService.create_workspace(user=user, name='Workspace 1', create_demo=False)
        ws2 = WorkspaceService.create_workspace(user=user, name='Workspace 2', create_demo=False)

        user.refresh_from_db()
        self.assertEqual(user.current_workspace, ws2)

        WorkspaceService.delete_workspace(user=user, workspace_id=ws2.id)

        user.refresh_from_db()
        self.assertEqual(user.current_workspace, ws1)

    def test_delete_workspace_succeeds_when_owner_has_no_other_workspace(self):
        user = UserFactory()
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)

        user.refresh_from_db()
        self.assertIsNone(user.current_workspace_id)
        self.assertFalse(Workspace.objects.filter(id=workspace.id).exists())

    def test_delete_workspace_succeeds_when_member_has_only_this_workspace(self):
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

    def test_delete_workspace_cascades_budget_data(self):
        user = UserFactory()
        WorkspaceService.create_workspace(user=user, name='Fallback', create_demo=False)
        workspace = WorkspaceService.create_workspace(user=user, name='Test Workspace', create_demo=False)

        CurrencyCatalogService.enable(user, workspace.id, 'PLN')
        plan_budget = BudgetFactory(workspace=workspace)
        category = CategoryFactory(budget=plan_budget, workspace=workspace, name='Groceries', created_by=user)
        plan_period = PeriodService.get_or_create_for_date(user, plan_budget, date(2025, 1, 15))
        currency = CurrencyCatalogService.get_enabled(workspace.id, 'PLN')
        category_budget = CategoryBudget.objects.create(
            period=plan_period,
            workspace_id=workspace.id,
            category=category,
            currency=currency,
            amount=100,
            created_by=user,
        )

        category_id = category.id
        plan_budget_id = plan_budget.id
        category_budget_id = category_budget.id

        WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)

        self.assertFalse(Category.objects.filter(id=category_id).exists())
        self.assertFalse(Budget.objects.filter(id=plan_budget_id).exists())
        self.assertFalse(CategoryBudget.objects.filter(id=category_budget_id).exists())

    def test_delete_workspace_rejects_non_owner(self):
        owner = UserFactory()
        member = UserFactory()
        workspace = WorkspaceService.create_workspace(user=owner, name='Test', create_demo=False)
        WorkspaceMemberFactory(workspace=workspace, user=member, role='member')

        with self.assertRaises(WorkspacePermissionDeniedError):
            WorkspaceService.delete_workspace(user=member, workspace_id=workspace.id)

    def test_delete_workspace_rejects_non_member(self):
        owner = UserFactory()
        outsider = UserFactory()
        workspace = WorkspaceService.create_workspace(user=owner, name='Test', create_demo=False)

        with self.assertRaises(WorkspacePermissionDeniedError):
            WorkspaceService.delete_workspace(user=outsider, workspace_id=workspace.id)


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

        self.assertNotIn('is_new_user', result)
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

        self.assertNotIn('is_new_user', result)
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
