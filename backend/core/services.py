"""Business logic for authentication flows (register, login, 2FA, refresh)."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction

from common.auth import (
    consume_refresh_token,
    consume_temp_token,
    create_access_token,
    create_refresh_token,
    create_temp_token,
)
from core.schemas import LoginIn, LoginOut, RefreshTokenIn, RegisterIn, Verify2FAIn
from users.exceptions import TwoFactorNotEnabledError
from users.models import ConsentType, UserTwoFactor
from users.services import UserService
from users.two_factor import TwoFactorService
from workspaces.services import WorkspaceService

User = get_user_model()


class AuthService:
    """Authentication business logic: register, login, 2FA completion, token refresh.

    Every method returns a ``(status_code, payload)`` tuple that the endpoint
    returns directly. Domain exceptions (e.g. TwoFactorNotEnabledError) are
    raised and handled by the global Django Ninja exception handler.
    """

    @staticmethod
    def register(data: RegisterIn, ip_address: str | None) -> tuple[int, dict]:
        """Register a new user with a workspace, consent records, and demo data.

        Returns:
            (403, {'detail': ...}) when DEMO_MODE is enabled.
            (400, {'error': ...}) when the email is already registered.
            (201, {'access_token', 'refresh_token', 'token_type'}) on success.
        """
        if settings.DEMO_MODE:
            return 403, {'detail': 'Registration is disabled in demo mode'}

        if User.objects.filter(email=data.email).exists():
            return 400, {'error': 'User with this email already exists'}

        with db_transaction.atomic():
            user = User.objects.create_user(
                email=data.email,
                password=data.password,
                full_name=data.full_name,
            )

            WorkspaceService.create_workspace(user=user, name=data.workspace_name, create_demo=True)

            UserService.record_consent(user, ConsentType.TERMS_OF_SERVICE, data.accepted_terms_version, ip_address)
            UserService.record_consent(user, ConsentType.PRIVACY_POLICY, data.accepted_privacy_version, ip_address)

            db_transaction.on_commit(lambda: UserService.send_registration_emails(user))

        return 201, {
            'access_token': create_access_token(user),
            'refresh_token': create_refresh_token(user),
            'token_type': 'bearer',
        }

    @staticmethod
    def login(data: LoginIn) -> tuple[int, LoginOut | dict]:
        """Authenticate a user and issue tokens, or a 2FA temp token.

        Returns:
            (401, {'detail': ...}) for missing user / wrong password / inactive account.
            (200, LoginOut(requires_2fa=True, temp_token=...)) when 2FA is enabled.
            (200, LoginOut(access_token=..., refresh_token=...)) on success.
        """
        user = User.objects.filter(email=data.email).first()
        if not user:
            return 401, {'detail': 'Invalid email or password'}
        if not user.check_password(data.password):
            return 401, {'detail': 'Invalid email or password'}
        if not user.is_active:
            return 401, {'detail': 'User account is disabled'}

        if UserTwoFactor.objects.filter(user=user, is_enabled=True).exists():
            return 200, LoginOut(requires_2fa=True, temp_token=create_temp_token(user))

        return 200, LoginOut(access_token=create_access_token(user), refresh_token=create_refresh_token(user))

    @staticmethod
    def complete_2fa(data: Verify2FAIn) -> tuple[int, dict]:
        """Verify a 2FA temp token + code, then issue a full token pair.

        Returns:
            (401, {'detail': ...}) for invalid/expired temp token, missing user, or wrong code.
            (200, {'access_token', 'refresh_token', 'token_type'}) on success.

        Raises:
            TwoFactorNotEnabledError: if the user has no enabled 2FA (-> 404 via global handler).
        """
        payload = consume_temp_token(data.temp_token)
        if not payload:
            return 401, {'detail': 'Invalid or expired verification token'}

        user = User.objects.filter(id=payload.get('user_id'), is_active=True).first()
        if not user:
            return 401, {'detail': 'User not found'}

        tf = UserTwoFactor.objects.filter(user=user).first()
        if not tf or not tf.is_enabled:
            raise TwoFactorNotEnabledError()

        if not TwoFactorService.verify_code(user, data.code):
            return 401, {'detail': 'Invalid verification code'}

        return 200, {
            'access_token': create_access_token(user),
            'refresh_token': create_refresh_token(user),
            'token_type': 'bearer',
        }

    @staticmethod
    def refresh(data: RefreshTokenIn) -> tuple[int, dict]:
        """Exchange a valid refresh token for a rotated token pair.

        Returns:
            (401, {'detail': ...}) for invalid/expired/consumed refresh token or missing user.
            (200, {'access_token', 'refresh_token', 'token_type'}) on success (rotated refresh).
        """
        payload = consume_refresh_token(data.refresh_token)
        if not payload:
            return 401, {'detail': 'Invalid or expired refresh token'}

        user = User.objects.filter(id=payload.get('user_id'), is_active=True).first()
        if not user:
            return 401, {'detail': 'User not found'}

        return 200, {
            'access_token': create_access_token(user),
            'refresh_token': create_refresh_token(user),
            'token_type': 'bearer',
        }
