"""Shared service helpers used across multiple Django apps."""

from decimal import Decimal

from period_balances.models import PeriodBalance


def resolve_currency(workspace_id: int, symbol: str):
    """Look up a Currency by symbol for a workspace. Returns None if not found."""
    from workspaces.models import Currency

    return Currency.objects.filter(workspace_id=workspace_id, symbol=symbol).first()


def get_or_create_period_balance(period_id: int, currency, user=None) -> PeriodBalance:
    """Get or create a period balance for a given period and currency FK."""
    from budget_periods.models import BudgetPeriod

    period = BudgetPeriod.objects.select_related('budget_account').get(id=period_id)
    workspace_id = period.budget_account.workspace_id

    balance, _ = PeriodBalance.objects.get_or_create(
        budget_period_id=period_id,
        currency=currency,
        defaults={
            'workspace_id': workspace_id,
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


def get_workspace_currencies(workspace_id: int) -> list:
    """Get list of Currency objects for a workspace."""
    from workspaces.models import Currency

    return list(Currency.objects.filter(workspace_id=workspace_id))


def delete_workspace_financial_records(workspace_id: int) -> None:
    """Delete all workspace records in correct order.

    Order matters due to PROTECT on Currency FK.
    """
    from budget_accounts.models import BudgetAccount
    from budgets.models import Budget
    from categories.models import Category
    from currency_exchanges.models import CurrencyExchange
    from period_balances.models import PeriodBalance
    from planned_transactions.models import PlannedTransaction
    from transactions.models import Transaction

    Transaction.objects.for_workspace(workspace_id).delete()
    PlannedTransaction.objects.for_workspace(workspace_id).delete()
    CurrencyExchange.objects.for_workspace(workspace_id).delete()
    PeriodBalance.objects.for_workspace(workspace_id).delete()
    Budget.objects.for_workspace(workspace_id).delete()
    Category.objects.for_workspace(workspace_id).delete()
    BudgetAccount.objects.for_workspace(workspace_id).delete()
