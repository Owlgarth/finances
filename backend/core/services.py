"""Business logic for authentication flows (register, login, 2FA, refresh)."""

import random
import time

from django.conf import settings
from django.contrib.auth import get_user_model, hashers
from django.db import transaction as db_transaction

from common.auth import (
    consume_refresh_token,
    consume_temp_token,
    create_access_token,
    create_refresh_token,
    create_temp_token,
)
from common.email import EmailService
from core.schemas import LoginIn, LoginOut, RefreshTokenIn, RegisterIn, Verify2FAIn
from users.exceptions import TwoFactorNotEnabledError
from users.models import ConsentType, UserTwoFactor
from users.services import UserService
from users.two_factor import TwoFactorService
from workspaces.services import WorkspaceService

User = get_user_model()

# Pre-computed hash so the user-not-found path runs the same expensive password
# check as the wrong-password path — removes the login timing oracle that
# distinguished registered from unregistered emails.
_DUMMY_PASSWORD_HASH = hashers.make_password('denarly-timing-normalization')


class AuthService:
    """Authentication business logic: register, login, 2FA completion, token refresh.

    Every method returns a ``(status_code, payload)`` tuple that the endpoint
    returns directly. Domain exceptions (e.g. TwoFactorNotEnabledError) are
    raised and handled by the global Django Ninja exception handler.
    """

    @staticmethod
    def _send_registration_attempt_email(existing_user) -> None:
        """Notify the owner of an existing account that someone tried to register with their email.

        Goes to the address OWNER, not the requester — sending it does not leak
        registration status to the person who made the attempt.
        """
        EmailService.send_email(
            to=existing_user.email,
            subject='Registration attempt with your email — Denarly',
            template_name='email/registration_attempt',
            context={'user_name': existing_user.full_name or existing_user.email},
        )

    @staticmethod
    def register(data: RegisterIn, ip_address: str | None) -> tuple[int, dict]:
        """Register a new user with a workspace, consent records, and optional sample data.

        Returns:
            (403, {'detail': ...}) when DEMO_MODE is enabled.
            (400, {'error': 'Unable to register with this email address.'}) when registration
                cannot complete (e.g. the email is already registered — the message never reveals which).
            (201, {'access_token', 'refresh_token', 'token_type'}) on success.
        """
        if settings.DEMO_MODE:
            return 403, {'detail': 'Registration is disabled in demo mode'}

        existing_user = User.objects.filter(email=data.email).first()
        if existing_user:
            # Anti-enumeration: notify the address owner, normalize timing against
            # the slow success path, and return a generic error that never reveals
            # whether the address is registered. Residual risk: the 201-vs-400
            # status difference remains a structural oracle; email-verification-
            # gated signup is explicitly out of scope.
            AuthService._send_registration_attempt_email(existing_user)
            time.sleep(random.uniform(0.1, 0.3))  # Normalize response time to reduce timing side-channel
            return 400, {'error': 'Unable to register with this email address.'}

        with db_transaction.atomic():
            user = User.objects.create_user(
                email=data.email,
                password=data.password,
                full_name=data.full_name,
            )

            WorkspaceService.create_workspace(
                user=user,
                name=data.workspace_name,
                currency_code=data.currency_code,
                create_demo=data.start_with_sample_data,
            )

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
            # Burn the same hash-check cost as the wrong-password path below so
            # response timing cannot reveal whether the email is registered.
            hashers.check_password(data.password, _DUMMY_PASSWORD_HASH)
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
