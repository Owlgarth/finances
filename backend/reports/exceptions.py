"""Custom exceptions for reports app."""

from common.exceptions import NotFoundError


class ReportPeriodNotFoundError(NotFoundError):
    default_message = 'Budget period not found'
    default_code = 'period_not_found'
