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


class UserValidationError(ValidationError):
    def __init__(self, message: str):
        super().__init__(message, code='validation_error')


class UserDeletionBlockedError(ValidationError):
    def __init__(self, blocking_workspaces: list[str]):
        message = (
            'Cannot delete account. You own workspaces with other members: '
            f'{", ".join(blocking_workspaces)}. '
            'Transfer ownership or remove all members first.'
        )
        super().__init__(message, code='deletion_blocked')
