"""Custom exceptions for users app."""

from common.exceptions import AuthenticationError, NotFoundError, ValidationError


class UserInvalidPasswordError(AuthenticationError):
    default_message = 'Invalid current password'
    default_code = 'invalid_password'


class UserInvalidConsentTypeError(ValidationError):
    def __init__(self, consent_type: str):
        super().__init__(f'Invalid consent type: {consent_type}', code='invalid_consent_type')


class UserConsentNotFoundError(NotFoundError):
    default_message = 'No active consent found for this type'
    default_code = 'consent_not_found'


class TwoFactorNotEnabledError(NotFoundError):
    default_message = 'Two-factor authentication is not enabled for this user'
    default_code = 'two_factor_not_enabled'


class UserDeletionBlockedError(ValidationError):
    def __init__(self, blocking_workspaces: list[str]):
        message = (
            'Cannot delete account. You own workspaces with other members: '
            f'{", ".join(blocking_workspaces)}. '
            'Transfer ownership or remove all members first.'
        )
        super().__init__(message, code='deletion_blocked')


class UserAlreadyVerifiedError(ValidationError):
    default_message = 'Email is already verified'
    default_code = 'user_already_verified'


class UserInvalidVerificationTokenError(ValidationError):
    default_message = 'Invalid or expired verification token'
    default_code = 'user_invalid_verification_token'


class UserEmailAlreadyInUseError(ValidationError):
    default_message = 'This email is already in use'
    default_code = 'user_email_already_in_use'


class UserInvalidEmailChangeTokenError(ValidationError):
    default_message = 'Invalid or expired email change token'
    default_code = 'user_invalid_email_change_token'


class UserSameEmailError(ValidationError):
    default_message = 'New email must be different from current email'
    default_code = 'user_same_email'
