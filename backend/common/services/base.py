"""Shared service helpers used across multiple Django apps."""

from decimal import Decimal

from budget_periods.models import BudgetPeriod
from common.permissions import require_role  # noqa: F401 — re-exported for convenience
from period_balances.models import PeriodBalance


def get_workspace_period(period_id: int, workspace_id: int) -> BudgetPeriod | None:
    """Get a period and verify it belongs to the workspace."""
    return (
        BudgetPeriod.objects.select_related('budget_account')
        .filter(id=period_id, budget_account__workspace_id=workspace_id)
        .first()
    )


def resolve_currency(workspace, symbol: str):
    """Look up a Currency by symbol for a workspace. Returns None if not found."""
    from workspaces.models import Currency

    return Currency.objects.filter(workspace=workspace, symbol=symbol).first()


def get_or_create_period_balance(period_id: int, currency, user=None) -> PeriodBalance:
    """Get or create a period balance for a given period and currency FK."""
    balance, _ = PeriodBalance.objects.get_or_create(
        budget_period_id=period_id,
        currency=currency,
        defaults={
            'opening_balance': Decimal('0'),
            'total_income': Decimal('0'),
            'total_expenses': Decimal('0'),
            'exchanges_in': Decimal('0'),
            'exchanges_out': Decimal('0'),
            'closing_balance': Decimal('0'),
            'created_by': user,
            'updated_by': user,
        },
    )
    return balance


def get_workspace_currencies(workspace):
    """Get list of Currency objects for a workspace."""
    return list(workspace.currencies.all())
