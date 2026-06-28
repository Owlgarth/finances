"""Django-Ninja API endpoints for authentication (register, login)."""

import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from ninja import Router

from common.auth import JWTAuth, decode_temp_token
from common.throttle import rate_limit, rate_limit_by_key
from common.utils import get_client_ip
from core.schemas import (
    DetailOut,
    EmailChangeConfirmIn,
    EmailChangeRequestIn,
    ErrorOut,
    ForgotPasswordIn,
    LoginIn,
    LoginOut,
    MessageOut,
    RefreshTokenIn,
    RegisterIn,
    ResendVerificationIn,
    ResetPasswordIn,
    Token,
    Verify2FAIn,
    VerifyEmailIn,
)
from core.services import AuthService

router = Router(tags=['Auth'])
User = get_user_model()


@router.post('/register', response={201: Token, 400: ErrorOut, 403: DetailOut, 429: DetailOut})
@rate_limit('register', limit=settings.RATE_LIMIT_REGISTER, period=settings.RATE_LIMIT_REGISTER_PERIOD)
def register(request, data: RegisterIn):
    """Register a new user with workspace and default data. See AuthService.register."""
    return AuthService.register(data, get_client_ip(request))


@router.post('/login', response={200: LoginOut, 401: DetailOut, 429: DetailOut})
@rate_limit('login', limit=settings.RATE_LIMIT_LOGIN, period=settings.RATE_LIMIT_LOGIN_PERIOD)
def login(request, data: LoginIn):
    """Login user and return a JWT pair, or a 2FA temp token. See AuthService.login."""
    return AuthService.login(data)


def _extract_2fa_rate_key(request, data: Verify2FAIn = None, **kwargs):
    """Extract a per-user rate-limit key from the temp token.

    For valid tokens, returns the user_id so attempts are bucketed per (IP, user).
    For invalid tokens, returns a random UUID per request to avoid a shared bucket —
    a fixed key like 'invalid' would let an attacker exhaust it from a shared IP,
    blocking legitimate 2FA verification for other users on that IP.
    """
    payload = decode_temp_token(data.temp_token)
    return str(payload.get('user_id', 'unknown')) if payload else str(uuid.uuid4())


@router.post('/verify-2fa', response={200: Token, 401: DetailOut, 404: DetailOut, 429: DetailOut})
@rate_limit_by_key(
    'verify_2fa',
    _extract_2fa_rate_key,
    limit=settings.RATE_LIMIT_VERIFY_2FA,
    period=settings.RATE_LIMIT_VERIFY_2FA_PERIOD,
)
def verify_2fa(request, data: Verify2FAIn):
    """Verify a 2FA temp token + code and issue full tokens. See AuthService.complete_2fa."""
    return AuthService.complete_2fa(data)


@router.post('/refresh', response={200: Token, 401: DetailOut})
def refresh_token(request, data: RefreshTokenIn):
    """Exchange a refresh token for a rotated token pair. See AuthService.refresh."""
    return AuthService.refresh(data)


@router.post('/verify-email', response={200: MessageOut, 400: DetailOut})
def verify_email(request, data: VerifyEmailIn):
    from users.services import UserService

    UserService.verify_email(data.token)
    return 200, {'message': 'Email verified successfully'}


@router.post('/resend-verification', response={200: MessageOut, 429: DetailOut})
@rate_limit(
    'resend_verification',
    limit=settings.RATE_LIMIT_RESEND_VERIFICATION,
    period=settings.RATE_LIMIT_RESEND_VERIFICATION_PERIOD,
)
def resend_verification(request, data: ResendVerificationIn):
    from users.services import UserService

    UserService.resend_verification(data.email)
    return 200, {'message': 'If your email is unverified, a new verification email has been sent.'}


@router.post('/forgot-password', response={200: MessageOut, 429: DetailOut})
@rate_limit(
    'forgot_password', limit=settings.RATE_LIMIT_FORGOT_PASSWORD, period=settings.RATE_LIMIT_FORGOT_PASSWORD_PERIOD
)
def forgot_password(request, data: ForgotPasswordIn):
    from users.services import UserService

    UserService.send_reset_password_email(data.email)
    return 200, {'message': 'If an account exists with this email, a reset link has been sent.'}


@router.post('/reset-password', response={200: MessageOut, 400: DetailOut, 429: DetailOut})
@rate_limit(
    'reset_password', limit=settings.RATE_LIMIT_RESET_PASSWORD, period=settings.RATE_LIMIT_RESET_PASSWORD_PERIOD
)
def reset_password(request, data: ResetPasswordIn):
    from users.services import UserService

    try:
        uid = force_str(urlsafe_base64_decode(data.uidb64))
        user = User.objects.get(pk=uid)
    except (User.DoesNotExist, ValueError, TypeError):
        return 400, {'detail': 'Invalid reset link'}

    if not default_token_generator.check_token(user, data.token):
        return 400, {'detail': 'Invalid or expired reset link'}

    UserService.reset_password(user, data.new_password)

    return 200, {'message': 'Password has been reset successfully'}


@router.post('/request-email-change', response={200: MessageOut, 400: DetailOut}, auth=JWTAuth())
def request_email_change(request, data: EmailChangeRequestIn):
    from users.services import UserService

    UserService.request_email_change(request.auth, data.password, data.new_email)
    return 200, {'message': 'Verification email sent to your new address'}


@router.post('/confirm-email-change', response={200: MessageOut, 400: DetailOut}, auth=JWTAuth())
def confirm_email_change(request, data: EmailChangeConfirmIn):
    from users.services import UserService

    UserService.confirm_email_change(request.auth, data.token)
    return 200, {'message': 'Email changed successfully'}
