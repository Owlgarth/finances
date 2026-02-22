"""Business logic for the transactions app."""

from decimal import Decimal

from django.db import transaction as db_transaction
from ninja.errors import HttpError

from budget_periods.models import BudgetPeriod
from categories.models import Category
from common.permissions import require_role
from common.services.base import get_or_create_period_balance, get_workspace_period
from transactions.models import Transaction
from transactions.schemas import TransactionCreate, TransactionImport
from workspaces.models import WRITE_ROLES


class TransactionService:
    @staticmethod
    def get_transaction(transaction_id: int, workspace_id: int) -> Transaction | None:
        """Get a transaction and verify it belongs to the workspace."""
        return (
            Transaction.objects.select_related('category', 'budget_period__budget_account')
            .filter(
                id=transaction_id,
                budget_period__budget_account__workspace_id=workspace_id,
            )
            .first()
        )

    @staticmethod
    def update_period_balance(period_id: int, currency: str, trans_type: str, amount: Decimal, operation: str) -> None:
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
    def _resolve_period(workspace, date, period_id: int | None):
        """Return the resolved period_id, raising HttpError when not found."""
        if period_id:
            period = get_workspace_period(period_id, workspace.id)
            if not period:
                raise HttpError(404, 'Budget period not found')
            return period_id
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace.id,
                start_date__lte=date,
                end_date__gte=date,
            )
            .first()
        )
        if not period:
            raise HttpError(400, 'No active budget period for the transaction date')
        return period.id

    @staticmethod
    def _validate_category(category_id: int | None, period_id: int) -> None:
        """Raise HttpError if category does not belong to the period."""
        if not category_id:
            return
        category = Category.objects.filter(id=category_id, budget_period_id=period_id).first()
        if not category:
            raise HttpError(400, 'Category not found or does not belong to the assigned budget period')

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace, data: TransactionCreate) -> Transaction:
        """Create a transaction and update the period balance."""
        require_role(user, workspace.id, WRITE_ROLES)

        category_id = None if data.type == 'income' else data.category_id
        period_id = TransactionService._resolve_period(workspace, data.date, data.budget_period_id)
        TransactionService._validate_category(category_id, period_id)

        trans = Transaction.objects.create(
            date=data.date,
            description=data.description,
            category_id=category_id,
            amount=data.amount,
            currency=data.currency,
            type=data.type,
            budget_period_id=period_id,
            created_by=user,
            updated_by=user,
        )
        TransactionService.update_period_balance(period_id, data.currency, data.type, data.amount, 'add')
        return trans

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace, transaction_id: int, data: TransactionCreate) -> Transaction:
        """Update a transaction, reversing the old balance and applying the new one."""
        require_role(user, workspace.id, WRITE_ROLES)

        trans = TransactionService.get_transaction(transaction_id, workspace.id)
        if not trans:
            raise HttpError(404, 'Transaction not found')

        category_id = None if data.type == 'income' else data.category_id

        # Revert the old balance before changing anything
        if trans.budget_period_id:
            TransactionService.update_period_balance(
                trans.budget_period_id, trans.currency, trans.type, trans.amount, 'subtract'
            )

        period_id = TransactionService._resolve_period(workspace, data.date, data.budget_period_id)
        TransactionService._validate_category(category_id, period_id)

        trans.date = data.date
        trans.description = data.description
        trans.category_id = category_id
        trans.amount = data.amount
        trans.currency = data.currency
        trans.type = data.type
        trans.budget_period_id = period_id
        trans.updated_by = user
        trans.save()

        TransactionService.update_period_balance(period_id, data.currency, data.type, data.amount, 'add')
        return trans

    @staticmethod
    @db_transaction.atomic
    def delete(user, workspace, transaction_id: int) -> None:
        """Delete a transaction and revert the period balance."""
        require_role(user, workspace.id, WRITE_ROLES)

        trans = TransactionService.get_transaction(transaction_id, workspace.id)
        if not trans:
            raise HttpError(404, 'Transaction not found')

        if trans.budget_period_id:
            TransactionService.update_period_balance(
                trans.budget_period_id, trans.currency, trans.type, trans.amount, 'subtract'
            )
        trans.delete()

    @staticmethod
    def export(workspace, period_id: int, trans_type: str | None = None) -> list[dict]:
        """Return serialisable transaction data for a period."""
        period = get_workspace_period(period_id, workspace.id)
        if not period:
            raise HttpError(404, 'Budget period not found')

        queryset = Transaction.objects.select_related('category').filter(budget_period_id=period_id)
        if trans_type:
            queryset = queryset.filter(type=trans_type)

        return [
            {
                'date': t.date.isoformat(),
                'description': t.description,
                'category_name': t.category.name if t.category else None,
                'amount': str(t.amount),
                'currency': t.currency,
                'type': t.type,
            }
            for t in queryset.order_by('-date')
        ]

    @staticmethod
    @db_transaction.atomic
    def import_data(user, workspace, period_id: int, data: list) -> int:
        """Bulk-create transactions from parsed JSON data. Returns count of created records."""
        require_role(user, workspace.id, WRITE_ROLES)

        period = get_workspace_period(period_id, workspace.id)
        if not period:
            raise HttpError(404, 'Budget period not found')

        new_transactions = []
        for item in data:
            try:
                import_item = TransactionImport(**item)
            except Exception as e:
                raise HttpError(400, f'Invalid data format: {e}')

            if import_item.type == 'income':
                category_id = None
            else:
                category_id = None
                if import_item.category_name:
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
                    currency=import_item.currency,
                    type=import_item.type,
                    budget_period_id=period_id,
                    created_by=user,
                    updated_by=user,
                )
            )

        Transaction.objects.bulk_create(new_transactions)
        for t in new_transactions:
            TransactionService.update_period_balance(period_id, t.currency, t.type, t.amount, 'add')

        return len(new_transactions)
