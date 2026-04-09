"""Business logic for the budget_accounts app."""

from django.db import transaction as db_transaction

from budget_accounts.exceptions import (
    BudgetAccountDuplicateNameError,
    BudgetAccountNotFoundError,
)
from budget_accounts.models import BudgetAccount
from budget_accounts.schemas import BudgetAccountArchive, BudgetAccountCreate, BudgetAccountUpdate
from common.exceptions import CurrencyNotFoundInWorkspaceError
from common.services.base import resolve_currency
from currency_exchanges.models import CurrencyExchange
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction


class BudgetAccountService:
    @staticmethod
    def list(workspace_id: int, include_inactive: bool = False) -> list[BudgetAccount]:
        """List all budget accounts in a workspace."""
        queryset = BudgetAccount.objects.for_workspace(workspace_id)
        if not include_inactive:
            queryset = queryset.filter(is_active=True)
        return list(queryset.order_by('display_order', 'name'))

    @staticmethod
    def get(account_id: int, workspace_id: int) -> BudgetAccount:
        """Get a budget account by ID within a workspace."""
        account = BudgetAccount.objects.for_workspace(workspace_id).filter(id=account_id).first()
        if not account:
            raise BudgetAccountNotFoundError()
        return account

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: BudgetAccountCreate) -> BudgetAccount:
        """Create a new budget account."""
        if BudgetAccount.objects.filter(workspace_id=workspace_id, name=data.name).exists():
            raise BudgetAccountDuplicateNameError()

        default_currency = resolve_currency(workspace_id, data.default_currency)
        if not default_currency:
            raise CurrencyNotFoundInWorkspaceError(data.default_currency)

        return BudgetAccount.objects.create(
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            default_currency=default_currency,
            color=data.color,
            icon=data.icon,
            is_active=data.is_active,
            display_order=data.display_order,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, account_id: int, data: BudgetAccountUpdate) -> BudgetAccount:
        """Update a budget account."""
        account = BudgetAccountService.get(account_id, workspace_id)

        if (
            data.name is not None
            and data.name != account.name
            and BudgetAccount.objects.filter(workspace_id=workspace_id, name=data.name).exclude(id=account_id).exists()
        ):
            raise BudgetAccountDuplicateNameError()

        update_data = data.model_dump(exclude_unset=True)
        if 'default_currency' in update_data:
            currency_symbol = update_data.pop('default_currency')
            currency = resolve_currency(workspace_id, currency_symbol)
            if not currency:
                raise CurrencyNotFoundInWorkspaceError(currency_symbol)
            account.default_currency = currency

        for field, value in update_data.items():
            setattr(account, field, value)

        account.updated_by = user
        account.save()
        return account

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, account_id: int) -> None:
        """Delete a budget account and all its financial records.

        Transaction, PlannedTransaction, and CurrencyExchange have
        on_delete=SET_NULL on budget_period. Django would orphan them
        (set budget_period=NULL) rather than cascade-delete them.
        We delete them explicitly to avoid orphaned records.
        """
        account = BudgetAccountService.get(account_id, workspace_id)
        period_ids = list(account.budget_periods.values_list('id', flat=True))
        Transaction.objects.filter(budget_period_id__in=period_ids).delete()
        PlannedTransaction.objects.filter(budget_period_id__in=period_ids).delete()
        CurrencyExchange.objects.filter(budget_period_id__in=period_ids).delete()
        account.delete()

    @staticmethod
    @db_transaction.atomic
    def set_archive_status(user, workspace_id: int, account_id: int, data: BudgetAccountArchive) -> BudgetAccount:
        """Set archive status of a budget account (True = active, False = archived)."""
        account = BudgetAccountService.get(account_id, workspace_id)
        account.is_active = data.is_active
        account.updated_by = user
        account.save()
        return account
