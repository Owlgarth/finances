"""Shared service exception base classes.

All domain exceptions should inherit from ServiceError or one of its subclasses.
A global Django Ninja exception handler in config/urls.py converts these to HTTP
responses automatically, so API endpoints do not need try/except for service errors.
"""

from django.utils.translation import gettext_lazy


class ServiceError(Exception):
    """Base for all domain service exceptions.

    Subclasses set http_status and default_message as class attributes.
    The message can be overridden per-raise via the constructor.
    """

    http_status: int = 500
    default_message = gettext_lazy('An unexpected error occurred')
    default_code: str | None = None

    def __init__(self, message: str | None = None, code: str | None = None):
        self.message = message if message is not None else self.default_message
        self.code = code if code is not None else self.default_code
        super().__init__(self.message)


class NotFoundError(ServiceError):
    """Resource does not exist. Maps to HTTP 404."""

    http_status = 404
    default_message = gettext_lazy('Not found')


class AuthenticationError(ServiceError):
    """Caller identity / credentials invalid. Maps to HTTP 401."""

    http_status = 401
    default_message = gettext_lazy('Authentication failed')


class ValidationError(ServiceError):
    """Input fails domain validation. Maps to HTTP 400."""

    http_status = 400
    default_message = gettext_lazy('Validation error')


class PermissionDeniedError(ServiceError):
    """Caller lacks required role. Maps to HTTP 403."""

    http_status = 403
    default_message = gettext_lazy('Insufficient permissions')
