"""Business logic for the users app."""

import random
import time
from datetime import datetime

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.db import IntegrityError
from django.db import transaction as db_transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from accounts.models import Account
from common.email import EmailService
from common.exceptions import ValidationError
from common.services.base import delete_workspace_financial_records
from common.tokens import (
    generate_email_change_token,
    generate_verification_token,
    verify_email_change_token,
    verify_verification_token,
)
from core.legal import get_privacy, get_terms
from core.schemas import UserPreferencesUpdate, UserUpdate
from planned_transactions.models import PlannedTransaction
from transactions.attachments import AttachmentService
from transactions.models import Transaction, TransactionItem
from transfers.models import Transfer
from users.exceptions import (
    UserAlreadyVerifiedError,
    UserConsentNotFoundError,
    UserDeletionBlockedError,
    UserEmailAlreadyInUseError,
    UserInvalidConsentTypeError,
    UserInvalidEmailChangeTokenError,
    UserInvalidPasswordError,
    UserInvalidVerificationTokenError,
    UserSameEmailError,
)
from users.models import ConsentType, FontChoices, User, UserConsent, UserPreferences, UserTwoFactor, WeekdayChoices
from workspaces.models import Role, Workspace, WorkspaceMember


class UserService:
    @staticmethod
    def get_or_create_preferences(user: User) -> UserPreferences:
        """Get or create user preferences."""
        preferences, _ = UserPreferences.objects.get_or_create(
            user=user, defaults={'calendar_start_day': WeekdayChoices.MONDAY, 'font_family': FontChoices.GEIST}
        )
        if not preferences.font_family:
            preferences.font_family = FontChoices.GEIST
            preferences.save(update_fields=['font_family'])
        return preferences

    @staticmethod
    def update_preferences(user: User, data: UserPreferencesUpdate) -> UserPreferences:
        """Update user preferences with validation."""
        preferences = UserService.get_or_create_preferences(user)

        if data.calendar_start_day is not None:
            preferences.calendar_start_day = data.calendar_start_day

        if data.font_family is not None:
            preferences.font_family = data.font_family

        preferences.save()
        return preferences

    @staticmethod
    def update_profile(user: User, data: UserUpdate) -> User:
        """Update user profile information."""
        if data.full_name is not None:
            user.full_name = data.full_name
        if data.is_active is not None:
            user.is_active = data.is_active

        user.save()
        return user

    @staticmethod
    def reset_password(user: User, new_password: str) -> None:
        """Reset user password (after token validation in the API layer)."""
        with db_transaction.atomic():
            user.set_password(new_password)
            user.save(update_fields=['password', 'password_changed_at'])
        UserService.send_password_changed_email(user)

    @staticmethod
    def change_password(user: User, current_password: str, new_password: str) -> None:
        """Change user password with validation."""
        if not user.check_password(current_password):
            raise UserInvalidPasswordError()

        with db_transaction.atomic():
            user.set_password(new_password)
            user.save(update_fields=['password', 'password_changed_at'])

        UserService.send_password_changed_email(user)

    @staticmethod
    def send_reset_password_email(email: str) -> None:
        """Send a password reset email if the user exists.

        Returns silently (with a small delay) when no user is found, to normalize
        response timing and avoid leaking whether an email address is registered.
        """
        user = User.objects.filter(email=email).first()
        if not user:
            time.sleep(random.uniform(0.1, 0.3))
            return

        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f'{settings.FRONTEND_URL}/reset-password?uid={uidb64}&token={token}'
        user_name = user.full_name or user.email

        EmailService.send_email(
            to=user.email,
            subject='Reset your password — Owlgarth Finances',
            template_name='email/reset_password',
            context={'user_name': user_name, 'reset_url': reset_url},
        )

    @staticmethod
    def send_password_changed_email(user, changed_by_admin: bool = False) -> None:
        user_name = user.full_name or user.email
        EmailService.send_email(
            to=user.email,
            subject='Your password was changed — Owlgarth Finances',
            template_name='email/password_changed',
            context={'user_name': user_name, 'changed_by_admin': changed_by_admin},
        )

    @staticmethod
    def verify_email(token: str) -> User:
        user_id = verify_verification_token(token)
        if not user_id:
            raise UserInvalidVerificationTokenError()
        user = User.objects.filter(id=user_id).first()
        if not user:
            raise UserInvalidVerificationTokenError()
        if user.email_verified:
            raise UserAlreadyVerifiedError()
        user.email_verified = True
        user.save(update_fields=['email_verified'])
        return user

    @staticmethod
    def send_registration_emails(user: User) -> None:
        token = generate_verification_token(user.id)
        verification_url = f'{settings.FRONTEND_URL}/verify-email?token={token}'
        user_name = user.full_name or user.email

        EmailService.send_email(
            to=user.email,
            subject='Verify your email — Owlgarth Finances',
            template_name='email/verify_email',
            context={'user_name': user_name, 'verification_url': verification_url},
        )
        EmailService.send_email(
            to=user.email,
            subject='Welcome to Owlgarth Finances!',
            template_name='email/welcome',
            context={'user_name': user_name},
        )

    @staticmethod
    def resend_verification(email: str) -> None:
        user = User.objects.filter(email=email).first()
        if not user or user.email_verified:
            time.sleep(random.uniform(0.1, 0.3))
            return

        token = generate_verification_token(user.id)
        verification_url = f'{settings.FRONTEND_URL}/verify-email?token={token}'

        EmailService.send_email(
            to=user.email,
            subject='Verify your email — Owlgarth Finances',
            template_name='email/verify_email',
            context={
                'user_name': user.full_name or user.email,
                'verification_url': verification_url,
            },
        )

    @staticmethod
    def request_email_change(user: User, password: str, new_email: str) -> None:
        if not user.check_password(password):
            raise UserInvalidPasswordError()

        new_email = new_email.lower()

        if new_email == user.email:
            raise UserSameEmailError()

        if User.objects.filter(email=new_email).exists():
            raise UserEmailAlreadyInUseError()

        with db_transaction.atomic():
            user.pending_email = new_email
            user.save(update_fields=['pending_email'])

        token = generate_email_change_token(user.id, new_email)
        confirm_url = f'{settings.FRONTEND_URL}/confirm-email-change?token={token}'

        UserService._send_email_change_verify_email(user, new_email, confirm_url)

    @staticmethod
    def _send_email_change_verify_email(user, new_email, confirm_url):
        EmailService.send_email(
            to=new_email,
            subject='Confirm your new email — Owlgarth Finances',
            template_name='email/email_change_verify',
            context={
                'user_name': user.full_name or user.email,
                'confirm_url': confirm_url,
                'new_email': new_email,
            },
        )

    @staticmethod
    def confirm_email_change(user: User, token: str) -> None:
        result = verify_email_change_token(token)
        if not result:
            raise UserInvalidEmailChangeTokenError()

        user_id, new_email = result
        if user.id != user_id:
            raise UserInvalidEmailChangeTokenError()

        if user.pending_email != new_email:
            raise UserInvalidEmailChangeTokenError('This email change request is no longer valid')

        if User.objects.filter(email=new_email).exclude(id=user.id).exists():
            raise UserEmailAlreadyInUseError()

        old_email = user.email

        with db_transaction.atomic():
            user.email = new_email
            user.pending_email = ''
            user.email_verified = True
            try:
                user.save(update_fields=['email', 'pending_email', 'email_verified'])
            except IntegrityError:
                raise UserEmailAlreadyInUseError()

        UserService._send_email_change_notify_email(user, old_email, new_email)

    @staticmethod
    def _send_email_change_notify_email(user, old_email, new_email):
        EmailService.send_email(
            to=old_email,
            subject='Your email was changed — Owlgarth Finances',
            template_name='email/email_change_notify',
            context={
                'user_name': user.full_name or new_email,
                'old_email': old_email,
                'new_email': new_email,
            },
        )

    @staticmethod
    def record_consent(user: User, consent_type: str, version: str, ip_address: str | None = None) -> UserConsent:
        """
        Record a consent grant.

        Args:
            user: The user granting consent
            consent_type: One of ConsentType values ('terms_of_service', 'privacy_policy')
            version: Version string of the document (e.g., '1.0')
            ip_address: Client IP address for audit purposes

        Returns:
            The created UserConsent record

        Raises:
            HttpError(400): If consent_type is invalid
        """
        if consent_type not in ConsentType.values:
            raise UserInvalidConsentTypeError(consent_type)
        return UserConsent.objects.create(
            user=user,
            consent_type=consent_type,
            version=version,
            ip_address=ip_address,
        )

    @staticmethod
    def withdraw_consent(user: User, consent_type: str) -> UserConsent:
        """
        Withdraw the most recent active consent of a given type.

        Sets withdrawn_at timestamp on the consent record (does not delete it).

        Raises:
            HttpError(404): If no active consent exists for this type
        """
        consent = (
            UserConsent.objects.filter(user=user, consent_type=consent_type, withdrawn_at__isnull=True)
            .order_by('-granted_at')
            .first()
        )
        if not consent:
            raise UserConsentNotFoundError()
        consent.withdrawn_at = timezone.now()
        consent.save(update_fields=['withdrawn_at'])
        return consent

    @staticmethod
    def get_active_consents(user: User) -> list:
        """Get all active (non-withdrawn) consents for a user."""
        return list(UserConsent.objects.filter(user=user, withdrawn_at__isnull=True).order_by('-granted_at'))

    @staticmethod
    def get_consent_status(user: User) -> dict:
        """
        Check whether the user's active consents match the current document versions.

        Returns a dict suitable for ConsentStatusOut. If either consent is missing
        or on an older version, needs_reconsent will be True.
        """
        terms_version = get_terms()['version']
        privacy_version = get_privacy()['version']

        active = {}
        for c in UserConsent.objects.filter(user=user, withdrawn_at__isnull=True).order_by(
            'consent_type', '-granted_at'
        ):
            active.setdefault(c.consent_type, c.version)
        terms_current = active.get(ConsentType.TERMS_OF_SERVICE) == terms_version
        privacy_current = active.get(ConsentType.PRIVACY_POLICY) == privacy_version
        return {
            'terms_current': terms_current,
            'privacy_current': privacy_current,
            'terms_version_required': terms_version,
            'privacy_version_required': privacy_version,
            'needs_reconsent': not (terms_current and privacy_current),
        }

    @staticmethod
    def check_deletion(user: User) -> dict:
        """
        Check what would be affected by account deletion.

        Returns a dict with:
        - can_delete: bool — False if user owns workspaces with other members
        - blocking_workspaces: list of workspaces preventing deletion (name + member count)
        - solo_workspaces: list of workspace names that would be fully deleted
        - shared_workspace_memberships: count of memberships in non-owned workspaces
        - total_transactions: count of transactions created by this user
        - total_planned_transactions: count of planned transactions created by this user
        """
        owned_workspaces = Workspace.objects.filter(owner=user)
        blocking = []
        solo = []

        for ws in owned_workspaces:
            member_count = WorkspaceMember.objects.filter(workspace=ws).count()
            if member_count > 1:
                blocking.append({'id': ws.id, 'name': ws.name, 'member_count': member_count})
            else:
                solo.append(ws.name)

        shared_memberships = WorkspaceMember.objects.filter(user=user).exclude(workspace__owner=user).count()

        return {
            'can_delete': len(blocking) == 0,
            'blocking_workspaces': blocking if blocking else None,
            'solo_workspaces': solo,
            'shared_workspace_memberships': shared_memberships,
            'total_transactions': Transaction.objects.filter(created_by=user).count(),
            'total_planned_transactions': PlannedTransaction.objects.filter(created_by=user).count(),
        }

    @staticmethod
    def delete_account(user: User, password: str) -> dict:
        """
        Permanently delete user account and all associated data (GDPR Article 17).

        Process:
        1. Verify password (security check)
        2. Check for blocking workspaces (owned with other members) → raise 400
        3. Delete solo-owned workspaces (CASCADE handles all child data)
        4. Remove memberships from non-owned workspaces
        5. Delete user record (CASCADE: preferences; SET_NULL: consents, audit refs)

        Args:
            user: The user requesting deletion
            password: User's password for confirmation

        Returns:
            dict with 'deleted_workspaces' (list of workspace names deleted)

        Raises:
            HttpError(401): Invalid password
            HttpError(400): User owns workspaces with other members
        """
        if not user.check_password(password):
            raise UserInvalidPasswordError('Invalid password')

        # Capture user details before deletion
        user_email = user.email
        user_name = user.full_name or user.email

        owned_workspaces = Workspace.objects.filter(owner=user)

        # Check for blocking workspaces
        blocking_workspaces = []
        for ws in owned_workspaces:
            member_count = WorkspaceMember.objects.filter(workspace=ws).count()
            if member_count > 1:
                blocking_workspaces.append(ws.name)

        if blocking_workspaces:
            raise UserDeletionBlockedError(blocking_workspaces)

        # Delete solo-owned workspaces and all their data
        deleted_workspace_names = list(owned_workspaces.values_list('name', flat=True))

        with db_transaction.atomic():
            for ws in owned_workspaces:
                delete_workspace_financial_records(ws.id)

            # Now delete workspaces (CASCADE deletes enablements, members, etc.)
            owned_workspaces.delete()

            # Remove memberships from non-owned workspaces (if any remain)
            WorkspaceMember.objects.filter(user=user).delete()

            # Delete 2FA records (CASCADE handles this, but explicit for defense-in-depth)
            UserTwoFactor.objects.filter(user=user).delete()

            # Delete preferences (CASCADE handles this, but explicit for defense-in-depth)
            UserPreferences.objects.filter(user=user).delete()

            # Delete user
            # SET_NULL: UserConsent (retained for GDPR audit), created_by/updated_by on financial models
            user.delete()

        EmailService.send_email(
            to=user_email,
            subject='Your Owlgarth Finances account has been deleted — Owlgarth Finances',
            template_name='email/account_deleted',
            context={'user_name': user_name},
        )

        return {'deleted_workspaces': deleted_workspace_names}

    @staticmethod
    def reset_account(
        user: User,
        password: str,
        workspace_name: str,
        currency_codes: list[str] | None = None,
        confirm_shared: bool = False,
    ) -> dict:
        """
        Wipe the user's data back to a fresh post-registration state.

        Deletes every workspace the user OWNS (including shared ones — other
        member users keep their accounts, only their access to the deleted
        workspaces goes away), then creates a fresh default workspace with the
        standard starter setup (Main account, General budget, current period,
        starter categories). Memberships in workspaces owned by other users are
        left untouched — that data belongs to its owners.

        Deleting owned workspaces that other members share requires
        confirm_shared — otherwise a single POST would silently destroy data
        other people are using.

        Unlike delete_account, the user row, credentials, preferences, 2FA and
        consents all survive: this exists for testing/starting over without
        re-registering.
        """
        from workspaces.services import WorkspaceService

        if not user.check_password(password):
            raise UserInvalidPasswordError('Invalid password')

        owned_workspaces = Workspace.objects.filter(owner=user)

        if not confirm_shared:
            shared = [ws.name for ws in owned_workspaces if WorkspaceMember.objects.filter(workspace=ws).count() > 1]
            if shared:
                raise ValidationError(
                    'These workspaces are shared with other members: '
                    f'{", ".join(sorted(shared))}. Set confirm_shared to delete them anyway.',
                    code='reset_shared_workspaces',
                )
        deleted_workspace_names = list(owned_workspaces.values_list('name', flat=True))

        with db_transaction.atomic():
            for ws in owned_workspaces:
                delete_workspace_financial_records(ws.id)
            owned_workspaces.delete()

            workspace = WorkspaceService.create_workspace(
                user=user, name=workspace_name, currency_codes=currency_codes, create_demo=False
            )

        return {
            'deleted_workspaces': deleted_workspace_names,
            'workspace_id': workspace.id,
            'workspace_name': workspace.name,
        }

    @staticmethod
    def export_all_data(user: User) -> dict:
        """
        Export all personal data for GDPR compliance (Articles 15, 20).

        Returns a comprehensive dict containing:
        - User profile (email, name, timestamps)
        - Preferences (calendar settings)
        - Consent records (all, including withdrawn)
        - For each workspace the user belongs to:
          - Workspace name, user's role, join date
          - All budget accounts with their periods
          - All transactions, planned transactions, currency exchanges, budgets, balances

        The output is designed to be serialized as JSON and downloaded as a file.
        All Decimal values are converted to strings, all datetimes to ISO format.
        """
        # 1. Profile
        profile = {
            'id': user.id,
            'email': user.email,
            'email_verified': user.email_verified,
            'pending_email': user.pending_email or None,
            'full_name': user.full_name,
            'is_active': user.is_active,
            'created_at': user.created_at.isoformat(),
            'updated_at': user.updated_at.isoformat(),
            'last_login': user.last_login.isoformat() if user.last_login else None,
        }

        # 2. Preferences
        preferences = None
        try:
            prefs = user.preferences
            preferences = {
                'calendar_start_day': prefs.calendar_start_day,
                'font_family': prefs.font_family,
                'created_at': prefs.created_at.isoformat(),
                'updated_at': prefs.updated_at.isoformat(),
            }
        except UserPreferences.DoesNotExist:
            pass

        # 3. Two-Factor Authentication
        two_factor = UserTwoFactor.objects.filter(user=user).first()
        two_factor_data = {
            'is_enabled': two_factor.is_enabled if two_factor else False,
            'last_used_at': str(two_factor.last_used_at) if two_factor and two_factor.last_used_at else None,
            'created_at': str(two_factor.created_at) if two_factor else None,
        }

        # 4. Consents (all, including withdrawn — full audit trail)
        consents = list(
            UserConsent.objects.filter(user=user)
            .order_by('-granted_at')
            .values('consent_type', 'version', 'granted_at', 'withdrawn_at', 'ip_address')
        )

        # 5. Workspace data (v3: full account/budgeting hierarchy)
        memberships = WorkspaceMember.objects.filter(user=user).select_related('workspace')
        workspace_data = [UserService._export_workspace_v3(m) for m in memberships]

        return {
            'export_version': '3.0',
            'exported_at': timezone.now().isoformat(),
            'profile': profile,
            'preferences': preferences,
            'two_factor': two_factor_data,
            'consents': consents,
            'workspaces': workspace_data,
        }

    @staticmethod
    def _export_workspace_v3(membership) -> dict:
        """Serialize one workspace's full hierarchy for the v3 GDPR export.

        Rate-limited (3/hour), so the nested per-budget queries are acceptable.
        Records reference budgets/categories/accounts by name — names are
        unique within their scope, so the importer can rebuild every FK.
        """
        from budgeting.models import Budget
        from categories.models import Category
        from currencies.models import WorkspaceCurrency

        ws = membership.workspace

        budgets = []
        for budget in Budget.objects.for_workspace(ws.id).prefetch_related('currencies__currency'):
            categories = [
                {'name': c.name, 'is_archived': c.is_archived} for c in Category.objects.filter(budget=budget)
            ]
            periods = []
            for period in budget.periods.all():
                periods.append(
                    {
                        'name': period.name,
                        'start_date': period.start_date.isoformat(),
                        'end_date': period.end_date.isoformat(),
                        'is_custom': period.is_custom,
                        'category_budgets': [
                            {
                                'category_name': cb.category.name,
                                'currency_code': cb.currency.code,
                                'amount': cb.amount,
                            }
                            for cb in period.category_budgets.select_related('category', 'currency')
                        ],
                    }
                )
            budgets.append(
                {
                    'name': budget.name,
                    'description': budget.description,
                    'color': budget.color,
                    'icon': budget.icon,
                    'is_active': budget.is_active,
                    'display_order': budget.display_order,
                    'currency_codes': budget.currency_codes,
                    'cadence': budget.cadence,
                    'cadence_weeks': budget.cadence_weeks,
                    'cadence_anchor': budget.cadence_anchor.isoformat() if budget.cadence_anchor else None,
                    'categories': categories,
                    'periods': periods,
                }
            )

        return {
            'workspace_id': ws.id,
            'workspace_name': ws.name,
            'role': membership.role,
            'joined_at': membership.created_at.isoformat(),
            'enabled_currencies': [
                {
                    'code': wc.currency.code,
                    'name': wc.currency.name,
                    'symbol': wc.currency.symbol,
                    'decimals': wc.currency.decimals,
                    'is_custom': wc.currency.is_custom,
                }
                for wc in WorkspaceCurrency.objects.filter(workspace=ws).select_related('currency')
            ],
            'accounts': [
                {
                    'name': a.name,
                    'type': a.type,
                    'currency_code': a.currency.code,
                    'opening_balance': a.opening_balance,
                    'is_archived': a.is_archived,
                    'is_default_for_currency': a.is_default_for_currency,
                    'display_order': a.display_order,
                }
                for a in Account.objects.for_workspace(ws.id).select_related('currency')
            ],
            'budgets': budgets,
            'transactions': [
                {
                    'date': t.date.isoformat(),
                    'description': t.description,
                    'amount': t.amount,
                    'type': t.type,
                    'budget_name': t.category.budget.name if t.category else None,
                    'category_name': t.category_name,
                    'account_name': t.account_name,
                    'currency_code': t.currency_code,
                    'original_amount': t.original_amount,
                    'original_currency_code': t.original_currency_code,
                    'items': [
                        {
                            'name': item.name,
                            'quantity': item.quantity,
                            'unit_price': item.unit_price,
                            'line_total': item.line_total,
                        }
                        for item in t.items.all()
                    ],
                    'attachments': AttachmentService.export_for_transaction(t),
                }
                for t in Transaction.objects.for_workspace(ws.id)
                .select_related('account', 'currency', 'category__budget', 'original_currency')
                .prefetch_related('items', 'attachments')
            ],
            'transfers': [
                {
                    'date': tr.date.isoformat(),
                    'description': tr.description,
                    'from_account_name': tr.from_account.name,
                    'from_currency_code': tr.from_account.currency.code,
                    'from_amount': tr.from_amount,
                    'to_account_name': tr.to_account.name,
                    'to_currency_code': tr.to_account.currency.code,
                    'to_amount': tr.to_amount,
                }
                for tr in Transfer.objects.for_workspace(ws.id).select_related(
                    'from_account__currency', 'to_account__currency'
                )
            ],
            'planned_transactions': [
                {
                    'name': pt.name,
                    'amount': pt.amount,
                    'planned_date': pt.planned_date.isoformat() if pt.planned_date else None,
                    'payment_date': pt.payment_date.isoformat() if pt.payment_date else None,
                    'status': pt.status,
                    'budget_name': pt.category.budget.name if pt.category else None,
                    'category_name': pt.category_name,
                    'account_name': pt.account_name,
                    'currency_code': pt.currency_code,
                }
                for pt in PlannedTransaction.objects.for_workspace(ws.id).select_related(
                    'account', 'category__budget', 'currency'
                )
            ],
        }

    @staticmethod
    @db_transaction.atomic
    def import_all_data(user, data) -> dict:
        """Import personal data from a v3 GDPR export (same-system restore).

        Rebuilds the full account/budgeting hierarchy: enabled currencies,
        accounts, budgets, categories, periods, category budgets, transactions
        (with their category + original facet), transfers, and planned
        transactions. Only v3 exports are accepted; v1/v2 files go through the
        dedicated legacy import endpoint.
        """
        from accounts.models import Account, AccountType
        from budgeting.models import Budget, BudgetCurrency, CategoryBudget, Period
        from categories.models import Category
        from planned_transactions.models import PlannedTransaction
        from transactions.models import Transaction
        from transfers.models import Transfer

        export_data = data.data
        workspace_filter = data.workspaces
        conflict_strategy = data.conflict_strategy

        export_version = str(export_data.get('export_version', ''))
        if not export_version.startswith('3.'):
            raise ValidationError(
                f'Incompatible export version: {export_version or "unknown"}. '
                'The main import accepts v3 exports only; use the legacy import for v1/v2 files.'
            )

        counts = {
            'imported_workspaces': 0,
            'imported_accounts': 0,
            'imported_budgets': 0,
            'imported_categories': 0,
            'imported_transactions': 0,
            'imported_transfers': 0,
            'imported_planned_transactions': 0,
        }
        skipped: dict[str, list[str]] = {'workspaces': [], 'errors': []}
        renamed: dict[str, str] = {}

        def _date(value):
            if not value:
                return None
            try:
                return datetime.strptime(value, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                raise ValidationError(f'Invalid date in import data: {value!r} (expected YYYY-MM-DD)')

        for ws_data in export_data.get('workspaces', []):
            original_name = ws_data.get('workspace_name')
            if workspace_filter and original_name not in workspace_filter:
                continue

            # Conflicts only against workspaces this user can see — a global check
            # would leak other tenants' workspace names via the rename report.
            if Workspace.objects.filter(name=original_name, members__user=user).exists():
                if conflict_strategy == 'skip':
                    skipped['workspaces'].append(original_name)
                    continue
                if conflict_strategy == 'rename':
                    new_name = f'{original_name} (imported {datetime.now().strftime("%Y-%m-%d %H:%M")})'
                    renamed[original_name] = new_name
                    original_name = new_name

            workspace = Workspace.objects.create(name=original_name, owner=user)
            WorkspaceMember.objects.create(workspace=workspace, user=user, role=Role.OWNER)
            counts['imported_workspaces'] += 1

            for cur_data in ws_data.get('enabled_currencies', []):
                UserService._resolve_import_currency(
                    workspace,
                    cur_data.get('code'),
                    name=cur_data.get('name'),
                    symbol=cur_data.get('symbol'),
                    decimals=cur_data.get('decimals', 2),
                )

            account_map: dict[str, object] = {}
            for acc_data in ws_data.get('accounts', []):
                currency = UserService._resolve_import_currency(workspace, acc_data.get('currency_code'))
                account = Account.objects.create(
                    workspace=workspace,
                    name=acc_data.get('name'),
                    type=acc_data.get('type', AccountType.BANK),
                    currency=currency,
                    opening_balance=acc_data.get('opening_balance', 0),
                    is_archived=acc_data.get('is_archived', False),
                    is_default_for_currency=acc_data.get('is_default_for_currency', False),
                    display_order=acc_data.get('display_order', 0),
                    created_by=user,
                    updated_by=user,
                )
                account_map[account.name] = account
                counts['imported_accounts'] += 1

            category_map: dict[tuple[str, str], object] = {}
            for budget_data in ws_data.get('budgets', []):
                budget = Budget.objects.create(
                    workspace=workspace,
                    name=budget_data.get('name'),
                    description=budget_data.get('description'),
                    color=budget_data.get('color'),
                    icon=budget_data.get('icon'),
                    is_active=budget_data.get('is_active', True),
                    display_order=budget_data.get('display_order', 0),
                    cadence=budget_data.get('cadence', 'monthly'),
                    cadence_weeks=budget_data.get('cadence_weeks'),
                    cadence_anchor=_date(budget_data.get('cadence_anchor')),
                    created_by=user,
                    updated_by=user,
                )
                # v3 field; absent key (payloads without it) imports an empty set.
                codes = budget_data.get('currency_codes', [])
                # Dedupe preserving first occurrence; list index becomes position.
                for position, code in enumerate(list(dict.fromkeys(codes))):
                    BudgetCurrency.objects.create(
                        budget=budget,
                        currency=UserService._resolve_import_currency(workspace, code),
                        position=position,
                    )
                counts['imported_budgets'] += 1

                for cat_data in budget_data.get('categories', []):
                    category = Category.objects.create(
                        workspace=workspace,
                        budget=budget,
                        name=cat_data.get('name'),
                        is_archived=cat_data.get('is_archived', False),
                        created_by=user,
                        updated_by=user,
                    )
                    category_map[(budget.name, category.name)] = category
                    counts['imported_categories'] += 1

                for period_data in budget_data.get('periods', []):
                    period = Period.objects.create(
                        workspace=workspace,
                        budget=budget,
                        name=period_data.get('name'),
                        start_date=_date(period_data.get('start_date')),
                        end_date=_date(period_data.get('end_date')),
                        is_custom=period_data.get('is_custom', False),
                        created_by=user,
                        updated_by=user,
                    )
                    for cb_data in period_data.get('category_budgets', []):
                        category = category_map.get((budget.name, cb_data.get('category_name')))
                        if not category:
                            continue
                        CategoryBudget.objects.create(
                            workspace=workspace,
                            period=period,
                            category=category,
                            currency=UserService._resolve_import_currency(workspace, cb_data.get('currency_code')),
                            amount=cb_data.get('amount'),
                            created_by=user,
                            updated_by=user,
                        )

            for tx_data in ws_data.get('transactions', []):
                account_name = tx_data.get('account_name')
                # Null/missing account_name = account-less row carrying its own
                # currency; a non-null name that resolves to nothing stays a
                # skip+error (the row references an account the export lacks).
                account = account_map.get(account_name) if account_name else None
                if account_name and not account:
                    skipped['errors'].append(f'{original_name}: transaction references unknown account')
                    continue
                currency_code = tx_data.get('currency_code')
                if not account and not currency_code:
                    skipped['errors'].append(f'{original_name}: account-less transaction missing currency_code')
                    continue
                currency = (
                    account.currency if account else UserService._resolve_import_currency(workspace, currency_code)
                )
                category = category_map.get((tx_data.get('budget_name'), tx_data.get('category_name')))
                original_code = tx_data.get('original_currency_code')
                trans = Transaction.objects.create(
                    workspace=workspace,
                    account=account,
                    currency=currency,
                    date=_date(tx_data.get('date')),
                    description=tx_data.get('description'),
                    amount=tx_data.get('amount'),
                    type=tx_data.get('type'),
                    category=category,
                    original_amount=tx_data.get('original_amount'),
                    original_currency=(
                        UserService._resolve_import_currency(workspace, original_code) if original_code else None
                    ),
                    created_by=user,
                    updated_by=user,
                )
                TransactionItem.objects.bulk_create(
                    TransactionItem(
                        transaction=trans,
                        position=position,
                        name=item_data.get('name'),
                        quantity=item_data.get('quantity') or 1,
                        unit_price=item_data.get('unit_price'),
                        line_total=item_data.get('line_total'),
                    )
                    for position, item_data in enumerate(tx_data.get('items') or [])
                )
                AttachmentService.import_for_transaction(user, trans, tx_data.get('attachments'))
                counts['imported_transactions'] += 1

            for tr_data in ws_data.get('transfers', []):
                from_account = account_map.get(tr_data.get('from_account_name'))
                to_account = account_map.get(tr_data.get('to_account_name'))
                if not from_account or not to_account or from_account.id == to_account.id:
                    skipped['errors'].append(f'{original_name}: transfer references unknown account')
                    continue
                Transfer.objects.create(
                    workspace=workspace,
                    from_account=from_account,
                    to_account=to_account,
                    from_amount=tr_data.get('from_amount'),
                    to_amount=tr_data.get('to_amount'),
                    date=_date(tr_data.get('date')),
                    description=tr_data.get('description', ''),
                    created_by=user,
                    updated_by=user,
                )
                counts['imported_transfers'] += 1

            for pt_data in ws_data.get('planned_transactions', []):
                account_name = pt_data.get('account_name')
                account = account_map.get(account_name) if account_name else None
                if account_name and not account:
                    skipped['errors'].append(f'{original_name}: planned transaction references unknown account')
                    continue
                currency_code = pt_data.get('currency_code')
                if not account and not currency_code:
                    skipped['errors'].append(f'{original_name}: account-less planned transaction missing currency_code')
                    continue
                currency = (
                    account.currency if account else UserService._resolve_import_currency(workspace, currency_code)
                )
                category = category_map.get((pt_data.get('budget_name'), pt_data.get('category_name')))
                PlannedTransaction.objects.create(
                    workspace=workspace,
                    account=account,
                    currency=currency,
                    name=pt_data.get('name'),
                    amount=pt_data.get('amount'),
                    category=category,
                    planned_date=_date(pt_data.get('planned_date')),
                    payment_date=_date(pt_data.get('payment_date')),
                    status=pt_data.get('status', 'pending'),
                    created_by=user,
                    updated_by=user,
                )
                counts['imported_planned_transactions'] += 1

        if counts['imported_workspaces'] > 0:
            user.current_workspace = Workspace.objects.filter(owner=user).order_by('-id').first()
            user.save(update_fields=['current_workspace'])

        return {**counts, 'skipped': skipped, 'renamed': renamed}

    @staticmethod
    def _resolve_import_currency(workspace, code: str, *, name=None, symbol=None, decimals=2):
        """Resolve/enable a catalog currency for an imported workspace.

        Global rows are preferred. Unknown codes create a workspace-owned custom
        row. The currency is enabled for the workspace.
        """
        from currencies.models import Currency as CatalogCurrency
        from currencies.models import WorkspaceCurrency

        currency = (
            CatalogCurrency.objects.filter(workspace__isnull=True, code=code).first()
            or CatalogCurrency.objects.filter(workspace=workspace, code=code).first()
        )
        if not currency:
            currency = CatalogCurrency.objects.create(
                code=code,
                name=name or code,
                symbol=symbol or code,
                decimals=decimals,
                is_custom=True,
                workspace=workspace,
            )
        WorkspaceCurrency.objects.get_or_create(workspace=workspace, currency=currency)
        return currency
