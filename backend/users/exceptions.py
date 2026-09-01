"""Custom exceptions for users app."""

from django.utils.translation import gettext_lazy

from common.exceptions import AuthenticationError, NotFoundError, ValidationError


class UserInvalidPasswordError(AuthenticationError):
    default_message = gettext_lazy('Invalid current password')
    default_code = 'invalid_password'


class UserInvalidConsentTypeError(ValidationError):
    def __init__(self, consent_type: str):
        super().__init__(
            gettext_lazy('Invalid consent type: %(consent_type)s') % {'consent_type': consent_type},
            code='invalid_consent_type',
        )


class UserConsentNotFoundError(NotFoundError):
    default_message = gettext_lazy('No active consent found for this type')
    default_code = 'consent_not_found'


class TwoFactorNotEnabledError(NotFoundError):
    default_message = gettext_lazy('Two-factor authentication is not enabled for this user')
    default_code = 'two_factor_not_enabled'


class UserDeletionBlockedError(ValidationError):
    def __init__(self, blocking_workspaces: list[str]):
        message = gettext_lazy(
            'Cannot delete account. You own workspaces with other members: %(workspaces)s. '
            'Transfer ownership or remove all members first.'
        ) % {'workspaces': ', '.join(blocking_workspaces)}
        super().__init__(message, code='deletion_blocked')


class UserAlreadyVerifiedError(ValidationError):
    default_message = gettext_lazy('Email is already verified')
    default_code = 'user_already_verified'


class UserInvalidVerificationTokenError(ValidationError):
    default_message = gettext_lazy('Invalid or expired verification token')
    default_code = 'user_invalid_verification_token'


class UserEmailAlreadyInUseError(ValidationError):
    default_message = gettext_lazy('This email is already in use')
    default_code = 'user_email_already_in_use'


class UserInvalidEmailChangeTokenError(ValidationError):
    default_message = gettext_lazy('Invalid or expired email change token')
    default_code = 'user_invalid_email_change_token'


class UserSameEmailError(ValidationError):
    default_message = gettext_lazy('New email must be different from current email')
    default_code = 'user_same_email'
