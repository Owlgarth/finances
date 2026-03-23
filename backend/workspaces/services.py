"""Business logic for the workspaces app."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction

from budget_accounts.models import BudgetAccount
from common.exceptions import ValidationError
from workspaces.demo_fixtures import create_demo_fixtures
from workspaces.exceptions import (
    CurrencyDuplicateSymbolError,
    CurrencyNotFoundError,
    WorkspaceMemberAdminInsufficientError,
    WorkspaceMemberAlreadyExistsError,
    WorkspaceMemberCannotChangeOwnRoleError,
    WorkspaceMemberCannotRemoveSelfError,
    WorkspaceMemberCannotResetOwnPasswordError,
    WorkspaceMemberLimitReachedError,
    WorkspaceMemberNotFoundError,
    WorkspaceMemberPasswordRequiredError,
    WorkspaceNotFoundError,
    WorkspaceOwnerCannotLeaveError,
    WorkspaceOwnerPasswordResetError,
    WorkspaceOwnerRemoveError,
    WorkspaceOwnerRoleChangeError,
)
from workspaces.models import Currency, Role, Workspace, WorkspaceMember

User = get_user_model()

DEFAULT_CURRENCIES = [
    ('USD', 'US Dollar'),
    ('UAH', 'Ukrainian Hryvnia'),
    ('PLN', 'Polish Zloty'),
    ('EUR', 'Euro'),
]


class WorkspaceService:
    @staticmethod
    @db_transaction.atomic
    def create_workspace(user, name: str, create_demo: bool = False) -> Workspace:
        """
        Creates a workspace with full initial setup:
        - WorkspaceMember (owner role)
        - Default currencies (USD, UAH, PLN, EUR)
        - Default "General" budget account (PLN currency)
        - Demo fixtures (optional)
        - Sets user.current_workspace to the new workspace
        """
        workspace = Workspace.objects.create(name=name, owner=user)
        WorkspaceMember.objects.create(workspace=workspace, user=user, role=Role.OWNER)
        CurrencyService.create_default_currencies(workspace)
        default_currency = workspace.currencies.filter(symbol='PLN').first() or workspace.currencies.first()
        BudgetAccount.objects.create(
            workspace=workspace,
            name='General',
            description='General budget account',
            default_currency=default_currency,
            is_active=True,
            display_order=0,
            created_by=user,
            updated_by=user,
        )

        if create_demo:
            create_demo_fixtures(workspace_id=workspace.id, user_id=user.id)

        user.current_workspace = workspace
        user.save(update_fields=['current_workspace'])

        return workspace

    @staticmethod
    @db_transaction.atomic
    def delete_workspace(user, workspace_id: int) -> None:
        """
        Deletes workspace and all its data.
        Switches current_workspace for ALL users who had this as their active workspace.
        Users with no other workspace will have current_workspace set to None.
        """
        from common.services.base import delete_workspace_financial_records
        from users.models import User as UserModel

        try:
            workspace = Workspace.objects.select_for_update().get(id=workspace_id)
        except Workspace.DoesNotExist:
            raise WorkspaceNotFoundError()

        # Gather all users whose current_workspace points to this workspace.
        # The caller (user) is handled separately at the end because they may
        # still be mid-request; other affected users are updated via bulk_update.
        affected_user_ids = list(
            UserModel.objects.filter(current_workspace_id=workspace_id).exclude(id=user.id).values_list('id', flat=True)
        )
        all_affected_ids = affected_user_ids + [user.id]

        # Lock all affected user rows
        list(UserModel.objects.filter(id__in=all_affected_ids).select_for_update())

        # Re-fetch affected users after acquiring lock
        affected_users = list(UserModel.objects.filter(id__in=affected_user_ids))

        memberships = (
            WorkspaceMember.objects.filter(user_id__in=all_affected_ids)
            .exclude(workspace_id=workspace_id)
            .order_by('-updated_at')
            .values_list('user_id', 'workspace_id')
        )
        next_ws_map: dict[int, int] = {}
        for uid, wid in memberships:
            if uid not in next_ws_map:
                next_ws_map[uid] = wid

        delete_workspace_financial_records(workspace_id)

        from budget_accounts.models import BudgetAccount

        BudgetAccount.objects.filter(workspace_id=workspace_id).delete()

        workspace.delete()

        user.current_workspace_id = next_ws_map.get(user.id)
        user.save(update_fields=['current_workspace'])

        for affected_user in affected_users:
            affected_user.current_workspace_id = next_ws_map.get(affected_user.id)

        UserModel.objects.bulk_update(affected_users, ['current_workspace'])


class CurrencyService:
    @staticmethod
    def list_currencies(workspace_id: int) -> list[Currency]:
        """List all currencies for a workspace."""
        return list(Currency.objects.filter(workspace_id=workspace_id))

    @staticmethod
    def get_currency(currency_id: int, workspace_id: int) -> Currency | None:
        """Get a currency by ID within a workspace."""
        return Currency.objects.filter(id=currency_id, workspace_id=workspace_id).first()

    @staticmethod
    @db_transaction.atomic
    def create_currency(workspace_id: int, data) -> Currency:
        """Create a new currency for a workspace."""
        if Currency.objects.filter(workspace_id=workspace_id, symbol=data.symbol).exists():
            raise CurrencyDuplicateSymbolError(data.symbol)

        return Currency.objects.create(
            workspace_id=workspace_id,
            name=data.name,
            symbol=data.symbol,
        )

    @staticmethod
    @db_transaction.atomic
    def delete_currency(currency_id: int, workspace_id: int) -> None:
        """Delete a currency from a workspace."""
        currency = CurrencyService.get_currency(currency_id, workspace_id)
        if not currency:
            raise CurrencyNotFoundError()
        currency.delete()

    @staticmethod
    @db_transaction.atomic
    def create_default_currencies(workspace: Workspace) -> list[Currency]:
        """Create the four default currencies for a new workspace."""
        return [
            Currency.objects.create(workspace=workspace, symbol=symbol, name=name)
            for symbol, name in DEFAULT_CURRENCIES
        ]


class WorkspaceMemberService:
    @staticmethod
    def validate_access(workspace_id: int, user) -> Workspace:
        """Validate that the workspace exists and the user is a member of it."""
        workspace = Workspace.objects.filter(id=workspace_id).first()
        if not workspace:
            raise WorkspaceNotFoundError()

        member = WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            user=user,
        ).first()
        if not member:
            raise WorkspaceNotFoundError()

        return workspace

    @staticmethod
    def get_member(workspace_id: int, user_id: int) -> WorkspaceMember | None:
        """Get a workspace member by user ID within a workspace."""
        return WorkspaceMember.objects.filter(workspace_id=workspace_id, user_id=user_id).first()

    @staticmethod
    @db_transaction.atomic
    def add_member(user, workspace_id: int, data) -> dict:
        """
        Add a member to the workspace.

        Behavior:
        - If user exists: Add them to workspace (password ignored)
        - If user doesn't exist: Create user with provided password, add to workspace

        Raises domain exceptions on error.
        """
        Workspace.objects.select_for_update().get(id=workspace_id)

        current_member_count = WorkspaceMember.objects.filter(workspace_id=workspace_id).count()
        if current_member_count >= settings.WORKSPACE_MAX_MEMBERS:
            raise WorkspaceMemberLimitReachedError()

        existing_user = User.objects.filter(email=data.email).first()

        if existing_user:
            existing_member = WorkspaceMember.objects.filter(
                workspace_id=workspace_id,
                user_id=existing_user.id,
            ).first()

            if existing_member:
                raise WorkspaceMemberAlreadyExistsError()

            new_member = WorkspaceMember.objects.create(
                workspace_id=workspace_id,
                user_id=existing_user.id,
                role=data.role,
            )

            if existing_user.current_workspace_id is None:
                existing_user.current_workspace_id = workspace_id
                existing_user.save(update_fields=['current_workspace'])

            return {
                'message': f'Existing user {data.email} added to workspace',
                'user_id': existing_user.id,
                'member_id': new_member.id,
                'is_new_user': False,
            }
        else:
            if not data.password:
                raise WorkspaceMemberPasswordRequiredError()

            new_user = User.objects.create_user(
                email=data.email,
                password=data.password,
                full_name=data.full_name,
                current_workspace_id=workspace_id,
                is_active=True,
            )

            new_member = WorkspaceMember.objects.create(
                workspace_id=workspace_id,
                user_id=new_user.id,
                role=data.role,
            )

            return {
                'message': f'User {data.email} created and added to workspace',
                'user_id': new_user.id,
                'member_id': new_member.id,
                'is_new_user': True,
            }

    @staticmethod
    @db_transaction.atomic
    def leave(user, workspace_id: int) -> dict:
        """
        Leave the workspace (remove yourself).

        Business rules:
        - Owner cannot leave (must transfer ownership first)
        - Auto-switches current_workspace if needed
        """
        member = WorkspaceMember.objects.select_for_update().filter(workspace_id=workspace_id, user_id=user.id).first()
        if not member:
            raise WorkspaceMemberNotFoundError()

        if member.role == Role.OWNER:
            raise WorkspaceOwnerCannotLeaveError()

        member.delete()

        if user.current_workspace_id == workspace_id:
            next_workspace = (
                Workspace.objects.filter(members__user=user).exclude(id=workspace_id).order_by('-id').first()
            )
            user.current_workspace = next_workspace
            user.save(update_fields=['current_workspace'])

        return {'message': 'Successfully left workspace'}

    ASSIGNABLE_ROLES = (Role.ADMIN, Role.MEMBER, Role.VIEWER)

    @staticmethod
    @db_transaction.atomic
    def update_role(user, workspace_id: int, member_user_id: int, new_role: str, current_role: str) -> dict:
        """
        Update a member's role in the workspace.

        Business rules:
        - Cannot change owner role (only one owner per workspace)
        - Admin cannot change other admins or owner
        - Cannot change your own role
        """
        if new_role not in WorkspaceMemberService.ASSIGNABLE_ROLES:
            raise ValidationError(
                f'Cannot assign role: {new_role}. Allowed: {", ".join(WorkspaceMemberService.ASSIGNABLE_ROLES)}'
            )

        member = (
            WorkspaceMember.objects.select_for_update()
            .filter(
                workspace_id=workspace_id,
                user_id=member_user_id,
            )
            .first()
        )

        if not member:
            raise WorkspaceMemberNotFoundError()

        if member_user_id == user.id:
            raise WorkspaceMemberCannotChangeOwnRoleError()

        if member.role == Role.OWNER:
            raise WorkspaceOwnerRoleChangeError()

        if current_role == Role.ADMIN and member.role == Role.ADMIN:
            raise WorkspaceMemberAdminInsufficientError('change role of')

        old_role = member.role
        member.role = new_role
        member.save()

        return {
            'message': 'Role updated successfully',
            'user_id': member_user_id,
            'old_role': old_role,
            'new_role': new_role,
        }

    @staticmethod
    @db_transaction.atomic
    def remove_member(user, workspace_id: int, member_user_id: int, current_role: str) -> None:
        """
        Remove a member from the workspace.

        Business rules:
        - Cannot remove owner
        - Admin cannot remove other admins
        - Cannot remove yourself (use leave endpoint instead)
        """
        member = (
            WorkspaceMember.objects.select_for_update()
            .filter(
                workspace_id=workspace_id,
                user_id=member_user_id,
            )
            .first()
        )

        if not member:
            raise WorkspaceMemberNotFoundError()

        if member_user_id == user.id:
            raise WorkspaceMemberCannotRemoveSelfError()

        if member.role == Role.OWNER:
            raise WorkspaceOwnerRemoveError()

        if current_role == Role.ADMIN and member.role == Role.ADMIN:
            raise WorkspaceMemberAdminInsufficientError('remove')

        member.delete()

        removed_user = User.objects.filter(id=member_user_id).first()
        if removed_user and removed_user.current_workspace_id == workspace_id:
            next_workspace = Workspace.objects.filter(members__user=removed_user).order_by('-id').first()
            removed_user.current_workspace = next_workspace
            removed_user.save(update_fields=['current_workspace'])

    @staticmethod
    def reset_password(user, workspace_id: int, target_user_id: int, new_password: str, current_role: str) -> dict:
        """
        Reset a workspace member's password (admin action).

        Security rules:
        - Owner can reset password for: admin, member, viewer
        - Admin can reset password for: member, viewer only (NOT other admins)
        - Cannot reset own password (use change password feature instead)
        - Cannot reset owner's password
        """
        target_member = WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            user_id=target_user_id,
        ).first()

        if not target_member:
            raise WorkspaceMemberNotFoundError()

        if target_user_id == user.id:
            raise WorkspaceMemberCannotResetOwnPasswordError()

        if target_member.role == Role.OWNER:
            raise WorkspaceOwnerPasswordResetError()

        if current_role == Role.ADMIN and target_member.role == Role.ADMIN:
            raise WorkspaceMemberAdminInsufficientError('reset password of')

        target_user = User.objects.filter(id=target_user_id).first()
        if not target_user:
            raise WorkspaceMemberNotFoundError()

        target_user.set_password(new_password)
        target_user.save(update_fields=['password'])

        return {
            'message': 'Password reset successfully',
            'user_id': target_user_id,
            'email': target_user.email,
        }
