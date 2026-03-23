"""Business logic for the transactions app."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction as db_transaction

from budget_periods.models import BudgetPeriod
from budget_periods.services import BudgetPeriodService
from categories.models import Category
from common.exceptions import CurrencyNotFoundInWorkspaceError
from common.services.base import get_or_create_period_balance, resolve_currency
from transactions.exceptions import (
    TransactionCategoryNotFoundError,
    TransactionImportError,
    TransactionNoActivePeriodError,
    TransactionNotFoundError,
)
from transactions.models import Transaction
from transactions.schemas import TransactionCreate, TransactionImport


class TransactionService:
    @staticmethod
    def get_transaction(transaction_id: int, workspace_id: int) -> Transaction:
        """Get a transaction and verify it belongs to the workspace."""
        trans = (
            Transaction.objects.select_related('category', 'budget_period__budget_account', 'currency')
            .for_workspace(workspace_id)
            .filter(id=transaction_id)
            .first()
        )
        if not trans:
            raise TransactionNotFoundError()
        return trans

    @staticmethod
    def update_period_balance(period_id: int, currency, trans_type: str, amount: Decimal, operation: str) -> None:
        """Add or subtract a transaction amount from the period balance."""
        balance = get_or_create_period_balance(period_id, currency)
        amount_value = amount if operation == 'add' else -amount

        if trans_type == 'income':
            balance.total_income += amount_value
        else:
            balance.total_expenses += amount_value

        balance.closing_balance = (
            balance.opening_balance
            + balance.total_income
            - balance.total_expenses
            + balance.exchanges_in
            - balance.exchanges_out
        )
        balance.save()

    @staticmethod
    def _resolve_period(workspace_id: int, date, period_id: int | None) -> int:
        """Return the resolved period_id, raising exception when not found."""
        if period_id:
            BudgetPeriodService.get(period_id, workspace_id)
            return period_id
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace_id,
                start_date__lte=date,
                end_date__gte=date,
            )
            .first()
        )
        if not period:
            raise TransactionNoActivePeriodError()
        return period.id

    @staticmethod
    def _validate_category(category_id: int | None, period_id: int) -> None:
        """Raise exception if category does not belong to the period."""
        if not category_id:
            return
        category = Category.objects.filter(id=category_id, budget_period_id=period_id).first()
        if not category:
            raise TransactionCategoryNotFoundError()

    @staticmethod
    def list(
        workspace_id: int,
        budget_period_id: int | None = None,
        current_date=None,
        type: list | None = None,
        category_id: list | None = None,
        search: str | None = None,
        start_date=None,
        end_date=None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
        ordering: str | None = None,
    ) -> list[Transaction]:
        """List transactions for a workspace with optional filters."""
        from budget_periods.models import BudgetPeriod

        queryset = Transaction.objects.select_related('category').for_workspace(workspace_id)

        if budget_period_id:
            queryset = queryset.filter(budget_period_id=budget_period_id)
        elif current_date:
            period = (
                BudgetPeriod.objects.select_related('budget_account')
                .filter(
                    budget_account__workspace_id=workspace_id,
                    start_date__lte=current_date,
                    end_date__gte=current_date,
                )
                .first()
            )
            if period:
                queryset = queryset.filter(budget_period_id=period.id)
            else:
                return []

        if type:
            queryset = queryset.filter(type__in=type)
        if category_id:
            queryset = queryset.filter(category_id__in=category_id)
        if search:
            queryset = queryset.filter(description__icontains=search)
        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)
        if amount_gte is not None:
            queryset = queryset.filter(amount__gte=amount_gte)
        if amount_lte is not None:
            queryset = queryset.filter(amount__lte=amount_lte)

        sort_order = ordering or '-date'
        return list(queryset.order_by(sort_order, '-created_at'))

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: TransactionCreate) -> Transaction:
        """Create a transaction and update the period balance."""
        currency = resolve_currency(workspace_id, data.currency)
        if not currency:
            raise CurrencyNotFoundInWorkspaceError(data.currency)

        category_id = None if data.type == 'income' else data.category_id
        period_id = TransactionService._resolve_period(workspace_id, data.date, data.budget_period_id)
        TransactionService._validate_category(category_id, period_id)

        trans = Transaction.objects.create(
            date=data.date,
            description=data.description,
            category_id=category_id,
            amount=data.amount,
            currency=currency,
            type=data.type,
            budget_period_id=period_id,
            created_by=user,
            updated_by=user,
        )
        TransactionService.update_period_balance(period_id, currency, data.type, data.amount, 'add')
        return trans

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, transaction_id: int, data: TransactionCreate) -> Transaction:
        """Update a transaction, reversing the old balance and applying the new one."""
        trans = TransactionService.get_transaction(transaction_id, workspace_id)

        new_currency = resolve_currency(workspace_id, data.currency)
        if not new_currency:
            raise CurrencyNotFoundInWorkspaceError(data.currency)

        category_id = None if data.type == 'income' else data.category_id

        if trans.budget_period_id:
            TransactionService.update_period_balance(
                trans.budget_period_id, trans.currency, trans.type, trans.amount, 'subtract'
            )

        period_id = TransactionService._resolve_period(workspace_id, data.date, data.budget_period_id)
        TransactionService._validate_category(category_id, period_id)

        trans.date = data.date
        trans.description = data.description
        trans.category_id = category_id
        trans.amount = data.amount
        trans.currency = new_currency
        trans.type = data.type
        trans.budget_period_id = period_id
        trans.updated_by = user
        trans.save()

        TransactionService.update_period_balance(period_id, new_currency, data.type, data.amount, 'add')
        return trans

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, transaction_id: int) -> None:
        """Delete a transaction and revert the period balance."""
        trans = TransactionService.get_transaction(transaction_id, workspace_id)

        if trans.budget_period_id:
            TransactionService.update_period_balance(
                trans.budget_period_id, trans.currency, trans.type, trans.amount, 'subtract'
            )
        trans.delete()

    @staticmethod
    def export(workspace_id: int, period_id: int, trans_type: str | None = None) -> list[dict]:
        """Return serialisable transaction data for a period."""
        BudgetPeriodService.get(period_id, workspace_id)

        queryset = Transaction.objects.select_related('category', 'currency').filter(budget_period_id=period_id)
        if trans_type:
            queryset = queryset.filter(type=trans_type)

        return [
            {
                'date': t.date.isoformat(),
                'description': t.description,
                'category_name': t.category.name if t.category else None,
                'amount': str(t.amount),
                'currency': t.currency.symbol,
                'type': t.type,
            }
            for t in queryset.order_by('-date')
        ]

    @staticmethod
    @db_transaction.atomic
    def import_data(user, workspace_id: int, period_id: int, data: list) -> int:
        """Bulk-create transactions from parsed JSON data. Returns count of created records."""
        BudgetPeriodService.get(period_id, workspace_id)

        from workspaces.models import Currency

        currency_map = {c.symbol: c for c in Currency.objects.filter(workspace_id=workspace_id)}

        new_transactions = []
        for item in data:
            try:
                import_item = TransactionImport(**item)
            except Exception as e:
                raise TransactionImportError(f'Invalid data format: {e}')

            currency = currency_map.get(import_item.currency)
            if not currency:
                raise CurrencyNotFoundInWorkspaceError(import_item.currency)

            category_id = None
            if import_item.type != 'income' and import_item.category_name:
                category = Category.objects.filter(
                    name=import_item.category_name,
                    budget_period_id=period_id,
                ).first()
                if category:
                    category_id = category.id

            new_transactions.append(
                Transaction(
                    date=import_item.date,
                    description=import_item.description,
                    category_id=category_id,
                    amount=import_item.amount,
                    currency=currency,
                    type=import_item.type,
                    budget_period_id=period_id,
                    created_by=user,
                    updated_by=user,
                )
            )

        Transaction.objects.bulk_create(new_transactions)

        # Aggregate amounts by (currency, type) to minimise balance update queries.
        aggregated: dict[tuple, Decimal] = {}
        for t in new_transactions:
            key = (t.currency, t.type)
            aggregated[key] = aggregated.get(key, Decimal(0)) + t.amount

        for (currency, trans_type), total in aggregated.items():
            TransactionService.update_period_balance(period_id, currency, trans_type, total, 'add')

        return len(new_transactions)
