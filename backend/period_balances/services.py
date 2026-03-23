"""Business logic for the period_balances app."""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from budget_periods.models import BudgetPeriod
from common.exceptions import CurrencyNotFoundInWorkspaceError
from common.services.base import get_or_create_period_balance, get_workspace_currencies
from currency_exchanges.models import CurrencyExchange
from period_balances.exceptions import PeriodBalanceNotFoundError, PeriodBalancePeriodNotFoundError
from period_balances.models import PeriodBalance
from period_balances.schemas import PeriodBalanceUpdate
from transactions.models import Transaction


class PeriodBalanceService:
    @staticmethod
    def list(
        workspace_id: int,
        budget_period_id: int | None = None,
        currency: str | None = None,
    ) -> list[PeriodBalance]:
        """List period balances for a workspace with optional filters."""
        queryset = PeriodBalance.objects.select_related('budget_period').for_workspace(workspace_id)

        if budget_period_id:
            queryset = queryset.filter(budget_period_id=budget_period_id)

        if currency:
            queryset = queryset.filter(currency__symbol=currency)

        return list(queryset)

    @staticmethod
    def get(balance_id: int, workspace_id: int) -> PeriodBalance:
        """Get a balance and verify it belongs to the workspace. Raises if not found."""
        balance = (
            PeriodBalance.objects.select_related('budget_period__budget_account', 'currency')
            .for_workspace(workspace_id)
            .filter(id=balance_id)
            .first()
        )
        if not balance:
            raise PeriodBalanceNotFoundError()
        return balance

    @staticmethod
    def get_validated_period(period_id: int, workspace_id: int) -> BudgetPeriod:
        """Validate period belongs to workspace. Raises PeriodBalancePeriodNotFoundError if not."""
        from budget_periods.models import BudgetPeriod

        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(id=period_id, budget_account__workspace_id=workspace_id)
            .first()
        )
        if not period:
            raise PeriodBalancePeriodNotFoundError()
        return period

    @staticmethod
    def recalculate(period_id: int, currency_symbol: str) -> PeriodBalance:
        """Recalculate a period balance from scratch using aggregates."""
        from workspaces.models import Currency

        current_period = BudgetPeriod.objects.select_related('budget_account__workspace').filter(id=period_id).first()
        if not current_period:
            raise PeriodBalancePeriodNotFoundError()

        workspace = current_period.budget_account.workspace
        currency = Currency.objects.filter(workspace=workspace, symbol=currency_symbol).first()
        if not currency:
            raise CurrencyNotFoundInWorkspaceError(currency_symbol)

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
    def recalculate_all(workspace_id: int, period_id: int) -> list[PeriodBalance]:
        """Recalculate all currency balances for a period."""
        PeriodBalanceService.get_validated_period(period_id, workspace_id)
        currencies = get_workspace_currencies(workspace_id)
        return [PeriodBalanceService.recalculate(period_id, currency.symbol) for currency in currencies]

    @staticmethod
    def update_opening_balance(user, workspace_id: int, balance_id: int, data: PeriodBalanceUpdate) -> PeriodBalance:
        """Update the opening balance and recalculate closing balance."""
        balance = PeriodBalanceService.get(balance_id, workspace_id)

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
