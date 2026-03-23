"""Business logic for the users app."""

import logging

from django.db import transaction as db_transaction

from core.schemas import UserPreferencesUpdate, UserUpdate
from users.exceptions import (
    UserConsentNotFoundError,
    UserDeletionBlockedError,
    UserInvalidConsentTypeError,
    UserInvalidPasswordError,
    UserValidationError,
)
from users.models import ConsentType, User, UserConsent, UserPreferences, WeekdayChoices

logger = logging.getLogger(__name__)


class UserService:
    @staticmethod
    def get_or_create_preferences(user: User) -> UserPreferences:
        """Get or create user preferences."""
        preferences, _ = UserPreferences.objects.get_or_create(
            user=user, defaults={'calendar_start_day': WeekdayChoices.SUNDAY}
        )
        return preferences

    @staticmethod
    def update_preferences(user: User, data: UserPreferencesUpdate) -> UserPreferences:
        """Update user preferences with validation."""
        if data.calendar_start_day < 1 or data.calendar_start_day > 7:
            raise UserValidationError('calendar_start_day must be between 1 and 7')

        preferences = UserService.get_or_create_preferences(user)
        preferences.calendar_start_day = data.calendar_start_day
        preferences.save()
        return preferences

    @staticmethod
    def update_profile(user: User, data: UserUpdate) -> User:
        """Update user profile information."""
        if data.email is not None:
            user.email = data.email
        if data.full_name is not None:
            user.full_name = data.full_name
        if data.is_active is not None:
            user.is_active = data.is_active

        user.save()
        return user

    @staticmethod
    def change_password(user: User, current_password: str, new_password: str) -> None:
        """Change user password with validation."""
        if not user.check_password(current_password):
            raise UserInvalidPasswordError()

        user.set_password(new_password)
        user.save()

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
        from django.utils import timezone

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
        from core.legal import get_privacy, get_terms

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
        - total_currency_exchanges: count of currency exchanges created by this user
        """
        from currency_exchanges.models import CurrencyExchange
        from planned_transactions.models import PlannedTransaction
        from transactions.models import Transaction
        from workspaces.models import Workspace, WorkspaceMember

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
            'total_currency_exchanges': CurrencyExchange.objects.filter(created_by=user).count(),
        }

    @staticmethod
    @db_transaction.atomic
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

        from django.core.mail import send_mail

        from workspaces.models import Workspace, WorkspaceMember

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

        from common.services.base import delete_workspace_financial_records

        for ws in owned_workspaces:
            delete_workspace_financial_records(ws.id)

        # Delete BudgetAccounts (CASCADEs: BudgetPeriod, Category, Budget, PeriodBalance)
        # BudgetAccount.default_currency has PROTECT, but currencies are deleted with workspace.
        from budget_accounts.models import BudgetAccount

        BudgetAccount.objects.filter(workspace__in=owned_workspaces).delete()

        # Now delete workspaces (CASCADE deletes currencies, members, etc.)
        owned_workspaces.delete()

        # Remove memberships from non-owned workspaces (if any remain)
        WorkspaceMember.objects.filter(user=user).delete()

        # Delete user — CASCADE: UserPreferences
        # SET_NULL: UserConsent (retained for GDPR audit), created_by/updated_by on financial models
        user.delete()

        # Send confirmation email after the transaction commits (non-blocking)
        def _send_deletion_email():
            try:
                send_mail(
                    subject='Your Monie account has been deleted',
                    message=(
                        f'Hi {user_name},\n\n'
                        'Your Monie account and all associated data have been permanently deleted '
                        'as requested. This action cannot be undone.\n\n'
                        'If you did not request this deletion, please contact support immediately.\n\n'
                        'Thank you for using Monie.\n'
                    ),
                    from_email=None,  # uses DEFAULT_FROM_EMAIL from settings
                    recipient_list=[user_email],
                    fail_silently=True,
                )
            except Exception:
                logger.exception('Failed to send account deletion confirmation email to %s', user_email)

        db_transaction.on_commit(_send_deletion_email)

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
        from django.utils import timezone

        from budget_accounts.models import BudgetAccount
        from budget_periods.models import BudgetPeriod
        from budgets.models import Budget
        from categories.models import Category
        from currency_exchanges.models import CurrencyExchange
        from period_balances.models import PeriodBalance
        from planned_transactions.models import PlannedTransaction
        from transactions.models import Transaction
        from workspaces.models import Currency, WorkspaceMember

        # 1. Profile
        profile = {
            'id': user.id,
            'email': user.email,
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
                'created_at': prefs.created_at.isoformat(),
                'updated_at': prefs.updated_at.isoformat(),
            }
        except UserPreferences.DoesNotExist:
            pass

        # 3. Consents (all, including withdrawn — full audit trail)
        consents = list(
            UserConsent.objects.filter(user=user)
            .order_by('-granted_at')
            .values('consent_type', 'version', 'granted_at', 'withdrawn_at', 'ip_address')
        )

        # 4. Workspace data
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
                'workspace_name': ws.name,
                'role': membership.role,
                'joined_at': membership.created_at.isoformat(),
                'budget_accounts': [],
                'currencies': list(Currency.objects.filter(workspace_id=ws.id).values('symbol', 'name')),
            }

            accounts = BudgetAccount.objects.filter(workspace=ws).select_related('default_currency')
            for account in accounts:
                account_entry = {
                    'name': account.name,
                    'description': account.description,
                    'default_currency': account.default_currency.symbol if account.default_currency else None,
                    'is_active': account.is_active,
                    'periods': [],
                }

                periods = BudgetPeriod.objects.filter(budget_account=account)
                for period in periods:
                    period_entry = {
                        'name': period.name,
                        'start_date': period.start_date.isoformat(),
                        'end_date': period.end_date.isoformat(),
                        'categories': list(Category.objects.filter(budget_period=period).values('name')),
                        'budgets': list(
                            Budget.objects.filter(budget_period=period)
                            .select_related('category', 'currency')
                            .values('category__name', 'amount', 'currency__symbol')
                        ),
                        'transactions': list(
                            Transaction.objects.filter(budget_period=period)
                            .select_related('category', 'currency')
                            .values('date', 'description', 'amount', 'type', 'category__name', 'currency__symbol')
                        ),
                        'planned_transactions': list(
                            PlannedTransaction.objects.filter(budget_period=period)
                            .select_related('currency')
                            .values('name', 'amount', 'planned_date', 'payment_date', 'status', 'currency__symbol')
                        ),
                        'currency_exchanges': list(
                            CurrencyExchange.objects.filter(budget_period=period)
                            .select_related('from_currency', 'to_currency')
                            .values(
                                'date',
                                'description',
                                'from_amount',
                                'to_amount',
                                'exchange_rate',
                                'from_currency__symbol',
                                'to_currency__symbol',
                            )
                        ),
                        'period_balances': list(
                            PeriodBalance.objects.filter(budget_period=period)
                            .select_related('currency')
                            .values(
                                'currency__symbol',
                                'opening_balance',
                                'total_income',
                                'total_expenses',
                                'exchanges_in',
                                'exchanges_out',
                                'closing_balance',
                            )
                        ),
                    }
                    account_entry['periods'].append(period_entry)

                ws_entry['budget_accounts'].append(account_entry)

            orphaned_transactions = list(
                Transaction.objects.filter(
                    budget_period__isnull=True,
                    currency__workspace_id=ws.id,
                )
                .select_related('category', 'currency')
                .values('date', 'description', 'amount', 'type', 'category__name', 'currency__symbol')
            )
            orphaned_planned = list(
                PlannedTransaction.objects.filter(
                    budget_period__isnull=True,
                    currency__workspace_id=ws.id,
                )
                .select_related('currency')
                .values('name', 'amount', 'planned_date', 'payment_date', 'status', 'currency__symbol')
            )
            orphaned_exchanges = list(
                CurrencyExchange.objects.filter(
                    budget_period__isnull=True,
                    from_currency__workspace_id=ws.id,
                )
                .select_related('from_currency', 'to_currency')
                .values(
                    'date',
                    'description',
                    'from_amount',
                    'to_amount',
                    'exchange_rate',
                    'from_currency__symbol',
                    'to_currency__symbol',
                )
            )
            if orphaned_transactions or orphaned_planned or orphaned_exchanges:
                ws_entry['orphaned_records'] = {
                    'transactions': orphaned_transactions,
                    'planned_transactions': orphaned_planned,
                    'currency_exchanges': orphaned_exchanges,
                }

            workspace_data.append(ws_entry)

        return {
            'export_version': '1.0',
            'exported_at': timezone.now().isoformat(),
            'profile': profile,
            'preferences': preferences,
            'consents': consents,
            'workspaces': workspace_data,
        }
