"""Business logic for the workspaces app."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.db import transaction as db_transaction
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from accounts.models import Account, AccountType
from budgeting.models import Budget, BudgetCurrency, Cadence
from common.email import EmailService
from common.exceptions import ValidationError
from currencies.exceptions import UnknownCurrencyError
from currencies.services import CurrencyCatalogService
from workspaces.demo_fixtures import create_demo_fixtures, create_starter_fixtures
from workspaces.exceptions import (
    WorkspaceMemberAdminInsufficientError,
    WorkspaceMemberAlreadyExistsError,
    WorkspaceMemberCannotChangeOwnRoleError,
    WorkspaceMemberCannotRemoveSelfError,
    WorkspaceMemberCannotResetOwnPasswordError,
    WorkspaceMemberLimitReachedError,
    WorkspaceMemberNotFoundError,
    WorkspaceNotFoundError,
    WorkspaceOwnerCannotLeaveError,
    WorkspaceOwnerPasswordResetError,
    WorkspaceOwnerRemoveError,
    WorkspaceOwnerRoleChangeError,
    WorkspacePermissionDeniedError,
)
from workspaces.models import Role, Workspace, WorkspaceMember
from workspaces.schemas import WorkspaceMemberOut, WorkspaceOut

User = get_user_model()

# Silently enabled next to the primary currency on workspace creation
# (registration, in-app create, account reset). Explicit `currency_codes`
# lists bypass these defaults entirely.
DEFAULT_WORKSPACE_EXTRA_CURRENCIES: tuple[str, ...] = ('EUR', 'USD')


class WorkspaceService:
    @staticmethod
    @db_transaction.atomic
    def create_workspace(
        user,
        name: str,
        currency_code: str = 'PLN',
        create_demo: bool = False,
        currency_codes: list[str] | None = None,
    ) -> Workspace:
        """
        Creates a workspace with full initial setup:
        - WorkspaceMember (owner role)
        - Enabled catalog currencies: exactly ``currency_codes`` when given
          (first = primary/Main account currency, no extras added), otherwise
          ``currency_code`` plus DEFAULT_WORKSPACE_EXTRA_CURRENCIES (deduped)
        - Default "Main" account (in the primary currency)
        - Default "General" budget with a BudgetCurrency set of [primary]
          + starter categories + current period
        - Opt-in sample data when ``create_demo`` is True
        - Sets user.current_workspace to the new workspace

        An unknown code inside an explicit ``currency_codes`` list raises
        UnknownCurrencyError (explicit choices are respected strictly). An
        unknown DEFAULT extra is skipped silently: defaults are a convenience,
        never a precondition for workspace creation.
        """
        workspace = Workspace.objects.create(name=name, owner=user)
        WorkspaceMember.objects.create(workspace=workspace, user=user, role=Role.OWNER)

        # Explicit list wins and is used verbatim (deduped, first = primary).
        # The schema enforces min_length=1; the truthiness check also shields
        # direct service callers from an empty list (falls back to the
        # single-code path instead of IndexError).
        if currency_codes:
            codes = list(dict.fromkeys(currency_codes))
            strict = True
        else:
            codes = list(dict.fromkeys([currency_code, *DEFAULT_WORKSPACE_EXTRA_CURRENCIES]))
            strict = False

        primary_currency = CurrencyCatalogService.enable(user, workspace.id, codes[0])
        for code in codes[1:]:
            if strict:
                CurrencyCatalogService.enable(user, workspace.id, code)
            else:
                try:
                    CurrencyCatalogService.enable(user, workspace.id, code)
                except UnknownCurrencyError:
                    # Best-effort silent extras (EUR/USD are seeded globals;
                    # this branch is pure defense against a partial catalog)
                    # must never block workspace creation.
                    continue

        Account.objects.create(
            workspace=workspace,
            name='Main',
            type=AccountType.BANK,
            currency=primary_currency,
            is_default_for_currency=True,
            created_by=user,
            updated_by=user,
        )
        budget = Budget.objects.create(
            workspace=workspace,
            name='General',
            cadence=Cadence.MONTHLY,
            created_by=user,
            updated_by=user,
        )
        BudgetCurrency.objects.create(
            budget=budget,
            currency=primary_currency,
            position=0,
        )

        if create_demo:
            create_demo_fixtures(workspace_id=workspace.id, user_id=user.id)
        else:
            # A fresh workspace is empty but usable: starter categories + current period.
            create_starter_fixtures(workspace_id=workspace.id, user_id=user.id)

        user.current_workspace = workspace
        user.save(update_fields=['current_workspace'])

        return workspace

    @staticmethod
    def _to_response(workspace: Workspace, role: str) -> WorkspaceOut:
        """Build a WorkspaceOut with user_role populated from the membership."""
        ws = WorkspaceOut.model_validate(workspace)
        return ws.model_copy(update={'user_role': role})

    @staticmethod
    def list_for_user(user) -> list[WorkspaceOut]:
        """List all workspaces the user has access to, with their role in each."""
        memberships = WorkspaceMember.objects.filter(user_id=user.id).select_related('workspace')
        return [WorkspaceService._to_response(m.workspace, m.role) for m in memberships]

    @staticmethod
    def get_current(user) -> WorkspaceOut:
        """Get the user's current workspace with their role.

        Membership is normally already verified by WorkspaceJWTAuth; the
        ``filter().first()`` + ``None`` check here is defense-in-depth for
        callers that bypass the API layer (management commands, tests).
        """
        workspace_id = user.current_workspace_id
        member = (
            WorkspaceMember.objects.select_related('workspace').filter(workspace_id=workspace_id, user=user).first()
        )
        if not member:
            raise WorkspaceNotFoundError()
        return WorkspaceService._to_response(member.workspace, member.role)

    @staticmethod
    @db_transaction.atomic
    def update(workspace_id: int, data, user_role: str) -> WorkspaceOut:
        """Update the workspace name. Caller is responsible for role authorization.

        ``user_role`` is the validated role of the acting user, threaded through
        so the response can include ``user_role`` without re-querying.
        """
        workspace = Workspace.objects.filter(id=workspace_id).first()
        if not workspace:
            raise WorkspaceNotFoundError()
        if data.name is not None:
            workspace.name = data.name
            workspace.save(update_fields=['name'])
        return WorkspaceService._to_response(workspace, user_role)

    @staticmethod
    @db_transaction.atomic
    def set_default_budget(workspace_id: int, budget_id: int | None, user_role: str) -> WorkspaceOut:
        """Set (or clear with None) the workspace's default budget.

        Caller is responsible for role authorization. The budget must belong
        to the workspace and be active.
        """
        workspace = Workspace.objects.filter(id=workspace_id).first()
        if not workspace:
            raise WorkspaceNotFoundError()
        budget = None
        if budget_id is not None:
            budget = Budget.objects.filter(id=budget_id, workspace_id=workspace_id, is_active=True).first()
            if not budget:
                raise ValidationError('Budget not found in this workspace')
        workspace.default_budget = budget
        workspace.save(update_fields=['default_budget'])
        return WorkspaceService._to_response(workspace, user_role)

    @staticmethod
    def switch_workspace(user, workspace_id: int) -> dict:
        """Switch the user's current workspace.

        Raises WorkspaceNotFoundError if the user is not a member of the target.
        """
        member = WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            user_id=user.id,
        ).first()
        if not member:
            raise WorkspaceNotFoundError()
        user.current_workspace_id = workspace_id
        user.save(update_fields=['current_workspace'])
        return {'message': 'Workspace switched successfully', 'workspace_id': workspace_id}

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
            subject=f'{workspace_name} was deleted — Owlgarth Finances',
            template_name='email/workspace_deleted',
            context={
                'user_name': user_name,
                'workspace_name': workspace_name,
                'deleter_name': deleter_name,
            },
        )


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
    def list_members(workspace_id: int) -> list[WorkspaceMemberOut]:
        """List all members of a workspace, ordered by role desc then email."""
        members = (
            WorkspaceMember.objects.filter(workspace_id=workspace_id)
            .select_related('user')
            .order_by('-role', 'user__email')
        )
        return [
            WorkspaceMemberOut(
                id=member.id,
                workspace_id=member.workspace_id,
                user_id=member.user_id,
                email=member.user.email,
                full_name=member.user.full_name,
                role=member.role,
                is_active=member.user.is_active,
                created_at=member.created_at,
            )
            for member in members
        ]

    @staticmethod
    def add_member(user, workspace_id: int, data) -> dict:
        """
        Add a member to the workspace.

        Behavior:
        - If user exists: Add them to workspace (password ignored)
        - If user doesn't exist: Create user, add to workspace. With a password
          it becomes their initial password; without one the new user gets a
          set-password link by email.

        Raises domain exceptions on error.
        """
        admin_name = user.full_name or user.email

        with db_transaction.atomic():
            workspace = Workspace.objects.select_for_update().get(id=workspace_id)

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

                result = {
                    'message': 'Member added to workspace',
                    'user_id': existing_user.id,
                    'member_id': new_member.id,
                }
                recipient = existing_user
                is_new_user = False
            else:
                # password=None → UserManager.create_user calls set_password(None),
                # which stores an unusable password hash ("!") through the User
                # set_password override (so password_changed_at is stamped too).
                # The user cannot log in until they set a password via the link
                # in the set-password invitation email.
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

                result = {
                    'message': 'Member added to workspace',
                    'user_id': new_user.id,
                    'member_id': new_member.id,
                }
                recipient = new_user
                is_new_user = True

        # Emails sent AFTER the transaction commits (Pattern B, AGENTS.md "Email Patterns").
        # The response must not reveal existing-vs-new (anti-enumeration); the three
        # invitation emails still differentiate privately.
        if not is_new_user:
            WorkspaceMemberService._send_existing_user_email(recipient, workspace, admin_name, data.role)
        elif data.password:
            WorkspaceMemberService._send_new_user_email(recipient, workspace, admin_name, data.role)
        else:
            WorkspaceMemberService._send_new_user_set_password_email(recipient, workspace, admin_name, data.role)

        return result

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
            target_user.save(update_fields=['password', 'password_changed_at'])

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
            subject=f'You were added to {workspace.name} — Owlgarth Finances',
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
            subject=f'You were invited to {workspace.name} — Owlgarth Finances',
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
    def _send_new_user_set_password_email(new_user, workspace, admin_name, role):
        # Same token minting as UserService.send_reset_password_email; the link
        # is consumed by POST /api/auth/reset-password (works for users with an
        # unusable password — no has_usable_password gate on that endpoint).
        uidb64 = urlsafe_base64_encode(force_bytes(new_user.pk))
        token = default_token_generator.make_token(new_user)
        reset_url = f'{settings.FRONTEND_URL}/reset-password?uid={uidb64}&token={token}'
        EmailService.send_email(
            to=new_user.email,
            subject=f'You were invited to {workspace.name} — Owlgarth Finances',
            template_name='email/workspace_invitation_set_password',
            context={
                'user_name': new_user.full_name or new_user.email,
                'workspace_name': workspace.name,
                'admin_name': admin_name,
                'role': role,
                'email': new_user.email,
                'reset_url': reset_url,
            },
        )

    @staticmethod
    def _send_member_removed_email(email, user_name, workspace_name, admin_name):
        EmailService.send_email(
            to=email,
            subject=f'You were removed from {workspace_name} — Owlgarth Finances',
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
            subject=f'{leaver_name} left {workspace_name} — Owlgarth Finances',
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
            subject=f'Your role was changed in {workspace_name} — Owlgarth Finances',
            template_name='email/role_changed',
            context={
                'user_name': user_name,
                'workspace_name': workspace_name,
                'old_role': old_role,
                'new_role': new_role,
                'admin_name': admin_name,
            },
        )
