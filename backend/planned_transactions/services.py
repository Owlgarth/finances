"""Business logic for the planned_transactions app."""

from datetime import date

from django.db import transaction as db_transaction

from budget_periods.models import BudgetPeriod
from budget_periods.services import BudgetPeriodService
from categories.models import Category
from common.exceptions import CurrencyNotFoundInWorkspaceError
from common.services.base import get_or_create_period_balance, resolve_currency
from planned_transactions.exceptions import (
    PlannedTransactionAlreadyExecutedError,
    PlannedTransactionCategoryNotFoundError,
    PlannedTransactionImportError,
    PlannedTransactionNoActivePeriodError,
    PlannedTransactionNotFoundError,
)
from planned_transactions.models import PlannedTransaction
from planned_transactions.schemas import PlannedTransactionCreate, PlannedTransactionImport, PlannedTransactionUpdate
from transactions.models import Transaction


class PlannedTransactionService:
    @staticmethod
    def get_planned(planned_id: int, workspace_id: int) -> PlannedTransaction:
        """Get a planned transaction and verify it belongs to the workspace."""
        planned = (
            PlannedTransaction.objects.select_related('budget_period__budget_account', 'category', 'currency')
            .for_workspace(workspace_id)
            .filter(id=planned_id)
            .first()
        )
        if not planned:
            raise PlannedTransactionNotFoundError()
        return planned

    @staticmethod
    def _resolve_period(workspace_id: int, planned_date: date, period_id: int | None) -> int:
        """Return the period_id for the planned date, raising when not found."""
        if period_id:
            BudgetPeriodService.get(period_id, workspace_id)
            return period_id
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace_id,
                start_date__lte=planned_date,
                end_date__gte=planned_date,
            )
            .first()
        )
        if not period:
            raise PlannedTransactionNoActivePeriodError()
        return period.id

    @staticmethod
    def _validate_category(category_id: int | None, period_id: int) -> None:
        """Raise if category does not belong to the period."""
        if not category_id:
            return
        category = Category.objects.filter(id=category_id, budget_period_id=period_id).first()
        if not category:
            raise PlannedTransactionCategoryNotFoundError()

    @staticmethod
    def create(user, workspace_id: int, data: PlannedTransactionCreate) -> PlannedTransaction:
        """Create a planned transaction."""
        currency = resolve_currency(workspace_id, data.currency)
        if not currency:
            raise CurrencyNotFoundInWorkspaceError(data.currency)

        period_id = PlannedTransactionService._resolve_period(workspace_id, data.planned_date, data.budget_period_id)
        PlannedTransactionService._validate_category(data.category_id, period_id)

        return PlannedTransaction.objects.create(
            workspace_id=workspace_id,
            budget_period_id=period_id,
            name=data.name,
            amount=data.amount,
            currency=currency,
            category_id=data.category_id,
            planned_date=data.planned_date,
            status=data.status,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    def update(user, workspace_id: int, planned_id: int, data: PlannedTransactionUpdate) -> PlannedTransaction:
        """Update a planned transaction."""
        planned = PlannedTransactionService.get_planned(planned_id, workspace_id)

        currency = resolve_currency(workspace_id, data.currency)
        if not currency:
            raise CurrencyNotFoundInWorkspaceError(data.currency)

        period_id = PlannedTransactionService._resolve_period(workspace_id, data.planned_date, data.budget_period_id)
        PlannedTransactionService._validate_category(data.category_id, period_id)

        planned.budget_period_id = period_id
        planned.name = data.name
        planned.amount = data.amount
        planned.currency = currency
        planned.category_id = data.category_id
        planned.planned_date = data.planned_date
        planned.status = data.status
        planned.updated_by = user
        planned.save()

        return planned

    @staticmethod
    def delete(workspace_id: int, planned_id: int) -> None:
        """Delete a planned transaction."""
        planned = PlannedTransactionService.get_planned(planned_id, workspace_id)
        planned.delete()

    @staticmethod
    @db_transaction.atomic
    def execute(user, workspace_id: int, planned_id: int, payment_date: date) -> PlannedTransaction:
        """Execute a planned transaction, creating an actual transaction."""
        planned = PlannedTransactionService.get_planned(planned_id, workspace_id)

        if planned.status == 'done':
            raise PlannedTransactionAlreadyExecutedError()

        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace_id,
                start_date__lte=payment_date,
                end_date__gte=payment_date,
            )
            .first()
        )
        if not period:
            raise PlannedTransactionNoActivePeriodError()

        transaction_obj = Transaction.objects.create(
            workspace_id=workspace_id,
            budget_period_id=period.id,
            date=payment_date,
            description=planned.name,
            category_id=planned.category_id,
            amount=planned.amount,
            currency=planned.currency,
            type='expense',
            created_by=user,
            updated_by=user,
        )

        balance = get_or_create_period_balance(period.id, planned.currency)
        balance.total_expenses += planned.amount
        balance.closing_balance = (
            balance.opening_balance
            + balance.total_income
            - balance.total_expenses
            + balance.exchanges_in
            - balance.exchanges_out
        )
        balance.save(update_fields=['total_expenses', 'closing_balance'])

        planned.transaction_id = transaction_obj.id
        planned.status = 'done'
        planned.payment_date = payment_date
        planned.updated_by = user
        planned.save()

        return planned

    @staticmethod
    def export(workspace_id: int, period_id: int, status: str | None = None) -> list[dict]:
        """Return serialisable planned transaction data for a period."""
        BudgetPeriodService.get(period_id, workspace_id)

        queryset = PlannedTransaction.objects.select_related('category', 'currency').filter(budget_period_id=period_id)
        if status:
            queryset = queryset.filter(status=status)

        return [
            {
                'name': pt.name,
                'amount': str(pt.amount),
                'currency': pt.currency.symbol,
                'category_name': pt.category.name if pt.category else None,
                'planned_date': pt.planned_date.isoformat(),
            }
            for pt in queryset.order_by('planned_date')
        ]

    @staticmethod
    def import_data(user, workspace_id: int, period_id: int, data: list) -> int:
        """Bulk-create planned transactions from parsed JSON data. Returns count of created records."""
        BudgetPeriodService.get(period_id, workspace_id)

        from workspaces.models import Currency

        currency_map = {c.symbol: c for c in Currency.objects.filter(workspace_id=workspace_id)}

        new_transactions = []
        for item in data:
            try:
                import_item = PlannedTransactionImport(**item)
            except Exception as e:
                raise PlannedTransactionImportError(f'Invalid data format: {e}')

            currency = currency_map.get(import_item.currency)
            if not currency:
                raise CurrencyNotFoundInWorkspaceError(import_item.currency)

            category_id = None
            if import_item.category_name:
                category = Category.objects.filter(
                    name=import_item.category_name,
                    budget_period_id=period_id,
                ).first()
                if category:
                    category_id = category.id

            new_transactions.append(
                PlannedTransaction(
                    workspace_id=workspace_id,
                    name=import_item.name,
                    amount=import_item.amount,
                    currency=currency,
                    planned_date=import_item.planned_date,
                    category_id=category_id,
                    budget_period_id=period_id,
                    status='pending',
                    created_by=user,
                    updated_by=user,
                )
            )

        if not new_transactions:
            return 0

        PlannedTransaction.objects.bulk_create(new_transactions)
        return len(new_transactions)
