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
from transactions.models import Transaction
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
            user.save(update_fields=['password'])
        UserService.send_password_changed_email(user)

    @staticmethod
    def change_password(user: User, current_password: str, new_password: str) -> None:
        """Change user password with validation."""
        if not user.check_password(current_password):
            raise UserInvalidPasswordError()

        with db_transaction.atomic():
            user.set_password(new_password)
            user.save(update_fields=['password'])

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
            subject='Reset your password — Denarly',
            template_name='email/reset_password',
            context={'user_name': user_name, 'reset_url': reset_url},
        )

    @staticmethod
    def send_password_changed_email(user, changed_by_admin: bool = False) -> None:
        user_name = user.full_name or user.email
        EmailService.send_email(
            to=user.email,
            subject='Your password was changed — Denarly',
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
            subject='Verify your email — Denarly',
            template_name='email/verify_email',
            context={'user_name': user_name, 'verification_url': verification_url},
        )
        EmailService.send_email(
            to=user.email,
            subject='Welcome to Denarly!',
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
            subject='Verify your email — Denarly',
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
            subject='Confirm your new email — Denarly',
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
            subject='Your email was changed — Denarly',
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
            subject='Your Denarly account has been deleted — Denarly',
            template_name='email/account_deleted',
            context={'user_name': user_name},
        )

        return {'deleted_workspaces': deleted_workspace_names}

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

        # 5. Workspace data
        memberships = WorkspaceMember.objects.filter(user=user).select_related('workspace')
        workspace_data = []

        # NOTE: This uses nested loops (workspaces -> accounts -> periods -> 6 queries per
        # period), resulting in O(W * A * P) queries. This is acceptable for now because
        # the endpoint is rate-limited to 3 requests/hour. If performance becomes an issue
        # for power users with years of data, refactor to batch-query each model type and
        # assemble the nested structure in Python.
        for membership in memberships:
            ws = membership.workspace
            ws_entry = {
                'workspace_id': ws.id,
                'workspace_name': ws.name,
                'role': membership.role,
                'joined_at': membership.created_at.isoformat(),
                # TODO(B10): full v3 export (budgets/periods/categories/
                # category-budgets). Legacy per-workspace currency, budget
                # account, exchange, and period-balance sections died with B8.
                'accounts': [
                    {
                        'name': a.name,
                        'type': a.type,
                        'currency_code': a.currency.code,
                        'opening_balance': a.opening_balance,
                        'is_archived': a.is_archived,
                    }
                    for a in Account.objects.for_workspace(ws.id).select_related('currency')
                ],
                'transactions': [
                    {
                        'date': t.date.isoformat(),
                        'description': t.description,
                        'amount': t.amount,
                        'type': t.type,
                        'category_name': t.category_name,
                        'account_name': t.account_name,
                        'currency_code': t.currency_code,
                        'original_amount': t.original_amount,
                        'original_currency_code': t.original_currency_code,
                    }
                    for t in Transaction.objects.for_workspace(ws.id).select_related(
                        'account__currency', 'category', 'original_currency'
                    )
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
                        'category_name': pt.category_name,
                        'account_name': pt.account_name,
                        'currency_code': pt.currency_code,
                    }
                    for pt in PlannedTransaction.objects.for_workspace(ws.id).select_related(
                        'account__currency', 'category'
                    )
                ],
            }

            workspace_data.append(ws_entry)

        return {
            'export_version': '2.0',
            'exported_at': timezone.now().isoformat(),
            'profile': profile,
            'preferences': preferences,
            'two_factor': two_factor_data,
            'consents': consents,
            'workspaces': workspace_data,
        }

    @staticmethod
    def _rename_keys(record: dict, key_map: dict[str, str]) -> dict:
        """Rename keys in a dict according to a mapping."""
        return {key_map.get(k, k): v for k, v in record.items()}

    @staticmethod
    def _discover_currencies(ws_data: dict) -> list[dict]:
        """Extract unique currency symbols from all records in a workspace."""
        symbols: set[str] = set()

        for acc in ws_data.get('budget_accounts', []):
            dc = acc.get('default_currency')
            if dc:
                symbols.add(dc)

            for period in acc.get('periods', []):
                for tx in period.get('transactions', []):
                    sym = tx.get('currency__symbol') or tx.get('currency_symbol')
                    if sym:
                        symbols.add(sym)
                for b in period.get('budgets', []):
                    sym = b.get('currency__symbol') or b.get('currency_symbol')
                    if sym:
                        symbols.add(sym)
                for pt in period.get('planned_transactions', []):
                    sym = pt.get('currency__symbol') or pt.get('currency_symbol')
                    if sym:
                        symbols.add(sym)
                for ce in period.get('currency_exchanges', []):
                    from_sym = ce.get('from_currency__symbol') or ce.get('from_currency_symbol')
                    to_sym = ce.get('to_currency__symbol') or ce.get('to_currency_symbol')
                    if from_sym:
                        symbols.add(from_sym)
                    if to_sym:
                        symbols.add(to_sym)
                for pb in period.get('period_balances', []):
                    sym = pb.get('currency__symbol') or pb.get('currency_symbol')
                    if sym:
                        symbols.add(sym)

        return [{'id': None, 'symbol': s, 'name': s} for s in sorted(symbols)]

    @staticmethod
    def normalize_export_v1_to_v2(export_data: dict) -> dict:
        """Transform a v1.0 export dict into v2.0 format."""
        record_keys = {
            'category__name': 'category_name',
            'currency__symbol': 'currency_symbol',
        }

        for ws_data in export_data.get('workspaces', []):
            if 'currencies' not in ws_data:
                ws_data['currencies'] = UserService._discover_currencies(ws_data)
            ws_data.setdefault('workspace_id', None)

            for acc_data in ws_data.get('budget_accounts', []):
                acc_data.setdefault('budget_account_id', None)

                for period_data in acc_data.get('periods', []):
                    period_data.setdefault('budget_period_id', None)

                    period_data['transactions'] = [
                        UserService._rename_keys(tx, record_keys) for tx in period_data.get('transactions', [])
                    ]
                    period_data['planned_transactions'] = [
                        UserService._rename_keys(pt, record_keys) for pt in period_data.get('planned_transactions', [])
                    ]

        export_data.setdefault('two_factor', {'is_enabled': False, 'last_used_at': None, 'created_at': None})
        profile = export_data.setdefault('profile', {})
        profile.setdefault('email_verified', False)
        profile.setdefault('pending_email', None)
        preferences = export_data.setdefault('preferences', {})
        preferences.setdefault('font_family', 'default')
        export_data['export_version'] = '2.0'
        return export_data

    @staticmethod
    def _resolve_import_currency(workspace, code: str):
        """Resolve/enable a catalog currency for an imported workspace.

        Global rows are preferred; a workspace-custom row is created as a
        fallback for unknown codes. The currency is enabled for the workspace.
        """
        from currencies.models import Currency as CatalogCurrency
        from currencies.models import WorkspaceCurrency

        currency = (
            CatalogCurrency.objects.filter(workspace__isnull=True, code=code).first()
            or CatalogCurrency.objects.filter(workspace=workspace, code=code).first()
        )
        if not currency:
            currency = CatalogCurrency.objects.create(
                code=code, name=code, symbol=code, is_custom=True, workspace=workspace
            )
        WorkspaceCurrency.objects.get_or_create(workspace=workspace, currency=currency)
        return currency

    @staticmethod
    def _get_or_create_import_account(user, workspace, code: str, cache: dict):
        """Resolve the 'Main <CODE>' account transactions/planned rows land in.

        Used when an imported record references a currency but no named account
        (older per-period exports). Resolves the catalog currency, enables it,
        and get-or-creates a per-currency account.
        """
        from accounts.models import Account, AccountType

        if code in cache:
            return cache[code]

        currency = UserService._resolve_import_currency(workspace, code)
        account, _ = Account.objects.get_or_create(
            workspace=workspace,
            name=f'Main {code}',
            defaults={
                'type': AccountType.BANK,
                'currency': currency,
                'created_by': user,
                'updated_by': user,
            },
        )
        cache[code] = account
        return account

    @staticmethod
    @db_transaction.atomic
    def import_all_data(user, data) -> dict:
        """Import personal data from a GDPR export (v1.x/v2.x normalized).

        Rebuilds accounts, transactions, transfers, and planned transactions on
        the account-based model. Legacy period-scoped plan data (categories,
        budgets, exchanges, balances) is not restored — B10 introduces the v3
        format that carries the full budgeting hierarchy.
        """
        from accounts.models import Account, AccountType
        from planned_transactions.models import PlannedTransaction
        from transactions.models import Transaction
        from transfers.models import Transfer

        export_data = data.data
        workspace_filter = data.workspaces
        conflict_strategy = data.conflict_strategy

        export_version = export_data.get('export_version', '1.0')
        if export_version.startswith('1.'):
            export_data = UserService.normalize_export_v1_to_v2(export_data)
        elif not export_version.startswith('2.'):
            raise ValidationError(
                f'Incompatible export version: {export_version}. Only versions 1.x and 2.x are supported.'
            )

        imported_workspaces = 0
        imported_accounts = 0
        imported_transactions = 0
        imported_transfers = 0
        imported_planned_transactions = 0
        skipped: dict[str, list[str]] = {'workspaces': [], 'errors': []}
        renamed: dict[str, str] = {}

        for ws_data in export_data.get('workspaces', []):
            original_name = ws_data.get('workspace_name')
            if workspace_filter and original_name not in workspace_filter:
                continue

            existing = Workspace.objects.filter(name=original_name).first()
            if existing:
                if conflict_strategy == 'skip':
                    skipped['workspaces'].append(original_name)
                    continue
                elif conflict_strategy == 'rename':
                    new_name = f'{original_name} (imported {datetime.now().strftime("%Y-%m-%d %H:%M")})'
                    renamed[original_name] = new_name
                    original_name = new_name

            workspace = Workspace.objects.create(name=original_name, owner=user)
            WorkspaceMember.objects.create(workspace=workspace, user=user, role=Role.OWNER)
            imported_workspaces += 1

            account_cache: dict[str, object] = {}

            # Explicit accounts (v2-new format). Named accounts are cached so
            # transactions/transfers/planned can be matched back to them.
            for acc_data in ws_data.get('accounts', []):
                code = acc_data.get('currency_code')
                if not code:
                    continue
                currency = UserService._resolve_import_currency(workspace, code)
                account = Account.objects.create(
                    workspace=workspace,
                    name=acc_data.get('name'),
                    type=acc_data.get('type', AccountType.BANK),
                    currency=currency,
                    opening_balance=acc_data.get('opening_balance', 0),
                    is_archived=acc_data.get('is_archived', False),
                    created_by=user,
                    updated_by=user,
                )
                account_cache[account.name] = account
                imported_accounts += 1

            # Older per-period exports carry transactions/planned inside budget
            # accounts → periods. Hoist them to workspace level.
            if 'transactions' not in ws_data:
                ws_data['transactions'] = [
                    tx
                    for acc in ws_data.get('budget_accounts', [])
                    for period in acc.get('periods', [])
                    for tx in period.get('transactions', [])
                ]
            if 'planned_transactions' not in ws_data:
                ws_data['planned_transactions'] = [
                    pt
                    for acc in ws_data.get('budget_accounts', [])
                    for period in acc.get('periods', [])
                    for pt in period.get('planned_transactions', [])
                ]

            for tx_data in ws_data.get('transactions', []):
                account = UserService._resolve_import_named_account(user, workspace, tx_data, account_cache)
                if not account:
                    continue
                Transaction.objects.create(
                    workspace=workspace,
                    account=account,
                    date=datetime.strptime(tx_data.get('date'), '%Y-%m-%d').date(),
                    description=tx_data.get('description'),
                    amount=tx_data.get('amount'),
                    type=tx_data.get('type'),
                    category=None,
                    created_by=user,
                    updated_by=user,
                )
                imported_transactions += 1

            for tr_data in ws_data.get('transfers', []):
                from_account = account_cache.get(tr_data.get('from_account_name'))
                to_account = account_cache.get(tr_data.get('to_account_name'))
                if not from_account or not to_account or from_account.id == to_account.id:
                    skipped['errors'].append(f'{original_name}: transfer references an unknown account')
                    continue
                Transfer.objects.create(
                    workspace=workspace,
                    from_account=from_account,
                    to_account=to_account,
                    from_amount=tr_data.get('from_amount'),
                    to_amount=tr_data.get('to_amount'),
                    date=datetime.strptime(tr_data.get('date'), '%Y-%m-%d').date(),
                    description=tr_data.get('description', ''),
                    created_by=user,
                    updated_by=user,
                )
                imported_transfers += 1

            for pt_data in ws_data.get('planned_transactions', []):
                account = UserService._resolve_import_named_account(user, workspace, pt_data, account_cache)
                if not account:
                    continue
                planned_date_str = pt_data.get('planned_date')
                payment_date_str = pt_data.get('payment_date')
                PlannedTransaction.objects.create(
                    workspace=workspace,
                    account=account,
                    name=pt_data.get('name'),
                    amount=pt_data.get('amount'),
                    planned_date=datetime.strptime(planned_date_str, '%Y-%m-%d').date() if planned_date_str else None,
                    payment_date=datetime.strptime(payment_date_str, '%Y-%m-%d').date() if payment_date_str else None,
                    status=pt_data.get('status', 'pending'),
                    created_by=user,
                    updated_by=user,
                )
                imported_planned_transactions += 1

        if imported_workspaces > 0:
            user.current_workspace = Workspace.objects.filter(owner=user).order_by('-id').first()
            user.save(update_fields=['current_workspace'])

        return {
            'imported_workspaces': imported_workspaces,
            'imported_accounts': imported_accounts,
            'imported_transactions': imported_transactions,
            'imported_transfers': imported_transfers,
            'imported_planned_transactions': imported_planned_transactions,
            'skipped': skipped,
            'renamed': renamed,
        }

    @staticmethod
    def _resolve_import_named_account(user, workspace, record: dict, account_cache: dict):
        """Resolve the account for an imported record.

        Prefers an explicit account_name from the v2-new export; falls back to
        the per-currency 'Main <CODE>' account for older exports.
        """
        name = record.get('account_name')
        if name and name in account_cache:
            return account_cache[name]
        code = record.get('currency_code') or record.get('currency_symbol')
        if not code:
            return None
        return UserService._get_or_create_import_account(user, workspace, code, account_cache)
