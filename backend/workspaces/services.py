"""Business logic for the workspaces app."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction

from budget_accounts.models import BudgetAccount
from common.email import EmailService
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
    WorkspacePermissionDeniedError,
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
    def delete_workspace(user, workspace_id: int) -> None:
        """
        Deletes workspace and all its data.
        Switches current_workspace for ALL users who had this as their active workspace.
        Users with no other workspace will have current_workspace set to None.
        """
        from common.services.base import delete_workspace_financial_records
        from users.models import User as UserModel

        with db_transaction.atomic():
            try:
                workspace = Workspace.objects.select_for_update().get(id=workspace_id)
            except Workspace.DoesNotExist:
                raise WorkspaceNotFoundError()

            membership = WorkspaceMember.objects.filter(user=user, workspace=workspace).select_for_update().first()
            if not membership or membership.role != Role.OWNER:
                raise WorkspacePermissionDeniedError()
            affected_user_ids = list(
                UserModel.objects.filter(current_workspace_id=workspace_id)
                .exclude(id=user.id)
                .values_list('id', flat=True)
            )
            all_affected_ids = affected_user_ids + [user.id]

            list(UserModel.objects.filter(id__in=all_affected_ids).select_for_update())

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

            workspace_name = workspace.name
            deleter_name = user.full_name or user.email

            email_recipients = [(au.email, au.full_name or au.email) for au in affected_users]

            delete_workspace_financial_records(workspace_id)

            from budget_accounts.models import BudgetAccount

            BudgetAccount.objects.filter(workspace_id=workspace_id).delete()

            workspace.delete()

            user.current_workspace_id = next_ws_map.get(user.id)
            user.save(update_fields=['current_workspace'])

            for affected_user in affected_users:
                affected_user.current_workspace_id = next_ws_map.get(affected_user.id)

            UserModel.objects.bulk_update(affected_users, ['current_workspace'])

        for au_email, au_name in email_recipients:
            WorkspaceService._send_workspace_deleted_email(au_email, au_name, workspace_name, deleter_name)

    @staticmethod
    def _send_workspace_deleted_email(email, user_name, workspace_name, deleter_name):
        EmailService.send_email(
            to=email,
            subject=f'{workspace_name} was deleted — Monie',
            template_name='email/workspace_deleted',
            context={
                'user_name': user_name,
                'workspace_name': workspace_name,
                'deleter_name': deleter_name,
            },
        )


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
    def add_member(user, workspace_id: int, data) -> dict:
        """
        Add a member to the workspace.

        Behavior:
        - If user exists: Add them to workspace (password ignored)
        - If user doesn't exist: Create user with provided password, add to workspace

        Raises domain exceptions on error.
        """
        with db_transaction.atomic():
            workspace = Workspace.objects.select_for_update().get(id=workspace_id)

            current_member_count = WorkspaceMember.objects.filter(workspace_id=workspace_id).count()
            if current_member_count >= settings.WORKSPACE_MAX_MEMBERS:
                raise WorkspaceMemberLimitReachedError()

            existing_user = User.objects.filter(email=data.email.lower()).first()

            admin_name = user.full_name or user.email

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

                result = {
                    'message': f'Existing user {data.email} added to workspace',
                    'user_id': existing_user.id,
                    'member_id': new_member.id,
                    'is_new_user': False,
                }

                WorkspaceMemberService._send_existing_user_email(existing_user, workspace, admin_name, data.role)

                return result
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

                WorkspaceMemberService._send_new_user_email(new_user, workspace, admin_name, data.role)

                return {
                    'message': f'User {data.email} created and added to workspace',
                    'user_id': new_user.id,
                    'member_id': new_member.id,
                    'is_new_user': True,
                }

    @staticmethod
    def leave(user, workspace_id: int) -> dict:
        """
        Leave the workspace (remove yourself).

        Business rules:
        - Owner cannot leave (must transfer ownership first)
        - Auto-switches current_workspace if needed
        """
        workspace_name = Workspace.objects.get(id=workspace_id).name
        leaver_name = user.full_name or user.email

        admins = list(
            User.objects.filter(
                workspace_memberships__workspace_id=workspace_id,
                workspace_memberships__role__in=[Role.OWNER, Role.ADMIN],
            ).exclude(id=user.id)
        )

        admin_recipients = [(admin.email, admin.full_name or admin.email) for admin in admins]

        with db_transaction.atomic():
            member = (
                WorkspaceMember.objects.select_for_update().filter(workspace_id=workspace_id, user_id=user.id).first()
            )
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

        for admin_email, admin_name in admin_recipients:
            WorkspaceMemberService._send_member_left_email(admin_email, admin_name, leaver_name, workspace_name)

        return {'message': 'Successfully left workspace'}

    ASSIGNABLE_ROLES = (Role.ADMIN, Role.MEMBER, Role.VIEWER)

    @staticmethod
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

        workspace_name = Workspace.objects.get(id=workspace_id).name
        target_user = User.objects.get(id=member_user_id)

        with db_transaction.atomic():
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

        target_email = target_user.email
        target_name = target_user.full_name or target_user.email
        admin_name = user.full_name or user.email

        WorkspaceMemberService._send_role_changed_email(
            target_email, target_name, workspace_name, old_role, new_role, admin_name
        )

        return {
            'message': 'Role updated successfully',
            'user_id': member_user_id,
            'old_role': old_role,
            'new_role': new_role,
        }

    @staticmethod
    def remove_member(user, workspace_id: int, member_user_id: int, current_role: str) -> None:
        """
        Remove a member from the workspace.

        Business rules:
        - Cannot remove owner
        - Admin cannot remove other admins
        - Cannot remove yourself (use leave endpoint instead)
        """
        removed_user = User.objects.filter(id=member_user_id).first()
        workspace_name = Workspace.objects.get(id=workspace_id).name
        admin_name = user.full_name or user.email

        with db_transaction.atomic():
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

            if removed_user and removed_user.current_workspace_id == workspace_id:
                next_workspace = Workspace.objects.filter(members__user=removed_user).order_by('-id').first()
                removed_user.current_workspace = next_workspace
                removed_user.save(update_fields=['current_workspace'])

        if removed_user:
            WorkspaceMemberService._send_member_removed_email(
                removed_user.email, removed_user.full_name or removed_user.email, workspace_name, admin_name
            )

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

        target_user_email = target_user.email

        with db_transaction.atomic():
            target_user.set_password(new_password)
            target_user.save(update_fields=['password'])

        from users.services import UserService

        UserService.send_password_changed_email(target_user, changed_by_admin=True)

        return {
            'message': 'Password reset successfully',
            'user_id': target_user_id,
            'email': target_user_email,
        }

    @staticmethod
    def _send_existing_user_email(existing_user, workspace, admin_name, role):
        EmailService.send_email(
            to=existing_user.email,
            subject=f'You were added to {workspace.name} — Monie',
            template_name='email/workspace_invitation_existing',
            context={
                'user_name': existing_user.full_name or existing_user.email,
                'workspace_name': workspace.name,
                'admin_name': admin_name,
                'role': role,
            },
        )

    @staticmethod
    def _send_new_user_email(new_user, workspace, admin_name, role):
        EmailService.send_email(
            to=new_user.email,
            subject=f'You were invited to {workspace.name} — Monie',
            template_name='email/workspace_invitation_new',
            context={
                'user_name': new_user.full_name or new_user.email,
                'workspace_name': workspace.name,
                'admin_name': admin_name,
                'role': role,
                'email': new_user.email,
            },
        )

    @staticmethod
    def _send_member_removed_email(email, user_name, workspace_name, admin_name):
        EmailService.send_email(
            to=email,
            subject=f'You were removed from {workspace_name} — Monie',
            template_name='email/member_removed',
            context={
                'user_name': user_name,
                'workspace_name': workspace_name,
                'admin_name': admin_name,
            },
        )

    @staticmethod
    def _send_member_left_email(email, user_name, leaver_name, workspace_name):
        EmailService.send_email(
            to=email,
            subject=f'{leaver_name} left {workspace_name} — Monie',
            template_name='email/member_left',
            context={
                'user_name': user_name,
                'leaver_name': leaver_name,
                'workspace_name': workspace_name,
            },
        )

    @staticmethod
    def _send_role_changed_email(email, user_name, workspace_name, old_role, new_role, admin_name):
        EmailService.send_email(
            to=email,
            subject=f'Your role was changed in {workspace_name} — Monie',
            template_name='email/role_changed',
            context={
                'user_name': user_name,
                'workspace_name': workspace_name,
                'old_role': old_role,
                'new_role': new_role,
                'admin_name': admin_name,
            },
        )
