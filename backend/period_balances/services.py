"""Business logic for the period_balances app."""

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from ninja.errors import HttpError

from budget_periods.models import BudgetPeriod
from common.services.base import get_or_create_period_balance
from currency_exchanges.models import CurrencyExchange
from period_balances.models import PeriodBalance
from period_balances.schemas import PeriodBalanceUpdate
from transactions.models import Transaction


class PeriodBalanceService:
    @staticmethod
    def get_balance(balance_id: int, workspace_id: int) -> PeriodBalance | None:
        """Get a balance and verify it belongs to the workspace."""
        return (
            PeriodBalance.objects.select_related('budget_period__budget_account', 'currency')
            .filter(
                id=balance_id,
                budget_period__budget_account__workspace_id=workspace_id,
            )
            .first()
        )

    @staticmethod
    def recalculate(period_id: int, currency_symbol: str) -> PeriodBalance:
        """Recalculate a period balance from scratch using aggregates."""
        from workspaces.models import Currency

        current_period = BudgetPeriod.objects.select_related('budget_account__workspace').filter(id=period_id).first()
        if not current_period:
            raise HttpError(404, 'Budget period not found')

        workspace = current_period.budget_account.workspace
        currency = Currency.objects.filter(workspace=workspace, symbol=currency_symbol).first()
        if not currency:
            raise HttpError(400, f'Currency {currency_symbol} not found in workspace')

        # Opening balance comes from the previous period's closing balance
        prev_period = (
            BudgetPeriod.objects.filter(
                budget_account_id=current_period.budget_account_id,
                end_date__lt=current_period.start_date,
            )
            .order_by('-end_date')
            .first()
        )

        opening = Decimal('0')
        if prev_period:
            prev_balance = PeriodBalance.objects.filter(
                budget_period_id=prev_period.id,
                currency=currency,
            ).first()
            if prev_balance:
                opening = prev_balance.closing_balance

        income = Transaction.objects.filter(budget_period_id=period_id, currency=currency, type='income').aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')

        expenses = Transaction.objects.filter(budget_period_id=period_id, currency=currency, type='expense').aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')

        exchanges_in = CurrencyExchange.objects.filter(budget_period_id=period_id, to_currency=currency).aggregate(
            total=Sum('to_amount')
        )['total'] or Decimal('0')

        exchanges_out = CurrencyExchange.objects.filter(budget_period_id=period_id, from_currency=currency).aggregate(
            total=Sum('from_amount')
        )['total'] or Decimal('0')

        balance = get_or_create_period_balance(period_id, currency)
        # Preserve manually set opening balances
        if balance.opening_balance == 0:
            balance.opening_balance = opening
        balance.total_income = income
        balance.total_expenses = expenses
        balance.exchanges_in = exchanges_in
        balance.exchanges_out = exchanges_out
        balance.closing_balance = balance.opening_balance + income - expenses + exchanges_in - exchanges_out
        balance.last_calculated_at = timezone.now()
        balance.save()

        return balance

    @staticmethod
    def update_opening_balance(user, workspace, balance_id: int, data: PeriodBalanceUpdate) -> PeriodBalance:
        """Update the opening balance and recalculate closing balance."""
        from common.permissions import require_role
        from workspaces.models import WRITE_ROLES

        require_role(user, workspace.id, WRITE_ROLES)

        balance = PeriodBalanceService.get_balance(balance_id, workspace.id)
        if not balance:
            raise HttpError(404, 'Period balance not found')

        balance.opening_balance = data.opening_balance
        balance.closing_balance = (
            balance.opening_balance
            + balance.total_income
            + balance.exchanges_in
            - balance.total_expenses
            - balance.exchanges_out
        )
        balance.updated_by = user
        balance.save()

        return balance
