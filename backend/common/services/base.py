"""Shared service helpers used across multiple Django apps."""

from decimal import Decimal

from period_balances.models import PeriodBalance


def resolve_currency(workspace_id: int, symbol: str):
    """Look up a Currency by symbol for a workspace. Returns None if not found."""
    from workspaces.models import Currency

    return Currency.objects.filter(workspace_id=workspace_id, symbol=symbol).first()


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


def get_workspace_currencies(workspace_id: int) -> list:
    """Get list of Currency objects for a workspace."""
    from workspaces.models import Currency

    return list(Currency.objects.filter(workspace_id=workspace_id))


def delete_workspace_financial_records(workspace_id: int) -> None:
    """Delete records that have PROTECT FKs on Currency and are NOT cascade-deleted
    through BudgetAccount.

    Call this BEFORE deleting BudgetAccounts. The deletion order matters:
    1. This function: Transaction, PlannedTransaction, CurrencyExchange (PROTECT on Currency)
    2. Caller deletes BudgetAccount (CASCADE: BudgetPeriod -> Budget, PeriodBalance, Category)
    3. Caller deletes Workspace (CASCADE: Currency, WorkspaceMember)

    Budget and PeriodBalance also have PROTECT FKs on Currency, but they cascade
    from BudgetPeriod (step 2), so they don't need explicit deletion here.
    """
    from currency_exchanges.models import CurrencyExchange
    from planned_transactions.models import PlannedTransaction
    from transactions.models import Transaction

    Transaction.objects.filter(budget_period__budget_account__workspace_id=workspace_id).delete()
    PlannedTransaction.objects.filter(budget_period__budget_account__workspace_id=workspace_id).delete()
    CurrencyExchange.objects.filter(budget_period__budget_account__workspace_id=workspace_id).delete()

    # Orphaned records (budget_period was deleted before this fix).
    # Linked to workspace only through their currency FK.
    Transaction.objects.filter(
        budget_period__isnull=True,
        currency__workspace_id=workspace_id,
    ).delete()
    PlannedTransaction.objects.filter(
        budget_period__isnull=True,
        currency__workspace_id=workspace_id,
    ).delete()

    # CurrencyExchange records can exist without a budget_period (standalone exchanges).
    # These are linked to the workspace only through their from_currency FK.
    CurrencyExchange.objects.filter(
        budget_period__isnull=True,
        from_currency__workspace_id=workspace_id,
    ).delete()
