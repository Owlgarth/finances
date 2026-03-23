"""Custom exceptions for period_balances app."""

from common.exceptions import NotFoundError


class PeriodBalanceNotFoundError(NotFoundError):
    default_message = 'Period balance not found'
    default_code = 'not_found'


class PeriodBalancePeriodNotFoundError(NotFoundError):
    default_message = 'Budget period not found'
    default_code = 'period_not_found'
