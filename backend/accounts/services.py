"""Business logic for the accounts app."""

from decimal import Decimal

from django.db import transaction as db_transaction

from accounts.exceptions import (
    AccountCurrencyImmutableError,
    AccountDuplicateNameError,
    AccountInUseError,
    AccountNotFoundError,
)
from accounts.models import Account
from accounts.schemas import AccountArchive, AccountCreate, AccountUpdate
from currencies.services import CurrencyCatalogService


class AccountService:
    @staticmethod
    def _record_count(account: Account) -> int:
        """Count financial records referencing this account.

        B5 adds transactions count, B6 adds transfers count.
        """
        return 0

    @staticmethod
    def _transactions_delta(account: Account) -> Decimal:
        """Net effect of transactions on the account balance.

        B5: + income − expense + signed adjustments (single aggregate query).
        """
        return Decimal('0')

    @staticmethod
    def _transfers_delta(account: Account) -> Decimal:
        """Net effect of transfers on the account balance.

        B6: + Σ transfers_in.to_amount − Σ transfers_out.from_amount.
        """
        return Decimal('0')

    @staticmethod
    def list(workspace_id: int, include_archived: bool = False) -> list[Account]:
        """List accounts in a workspace, archived ones only on request."""
        queryset = Account.objects.for_workspace(workspace_id).select_related('currency')
        if not include_archived:
            queryset = queryset.filter(is_archived=False)
        return list(queryset)

    @staticmethod
    def get(account_id: int, workspace_id: int) -> Account:
        """Get an account by ID within a workspace."""
        account = Account.objects.for_workspace(workspace_id).select_related('currency').filter(id=account_id).first()
        if not account:
            raise AccountNotFoundError()
        return account

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: AccountCreate) -> Account:
        """Create a new account in an enabled currency."""
        if Account.objects.for_workspace(workspace_id).filter(name=data.name).exists():
            raise AccountDuplicateNameError()

        currency = CurrencyCatalogService.get_enabled(workspace_id, data.currency_code)

        return Account.objects.create(
            workspace_id=workspace_id,
            name=data.name,
            type=data.type,
            currency=currency,
            opening_balance=data.opening_balance,
            display_order=data.display_order,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, account_id: int, data: AccountUpdate) -> Account:
        """Update an account. Currency is immutable after creation."""
        account = AccountService.get(account_id, workspace_id)

        if data.currency_code is not None and data.currency_code != account.currency.code:
            raise AccountCurrencyImmutableError()

        if (
            data.name is not None
            and data.name != account.name
            and Account.objects.for_workspace(workspace_id).filter(name=data.name).exclude(id=account_id).exists()
        ):
            raise AccountDuplicateNameError()

        update_data = data.model_dump(exclude_unset=True)
        update_data.pop('currency_code', None)
        for field, value in update_data.items():
            setattr(account, field, value)

        account.updated_by = user
        account.save()
        return account

    @staticmethod
    @db_transaction.atomic
    def set_archive_status(user, workspace_id: int, account_id: int, data: AccountArchive) -> Account:
        """Archive or unarchive an account. Archived accounts keep all history."""
        account = AccountService.get(account_id, workspace_id)
        account.is_archived = data.is_archived
        account.updated_by = user
        account.save()
        return account

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, account_id: int) -> None:
        """Delete an account. Allowed only when it has no financial records."""
        account = AccountService.get(account_id, workspace_id)
        if AccountService._record_count(account) > 0:
            raise AccountInUseError()
        account.delete()

    @staticmethod
    def balance(account: Account) -> Decimal:
        """Computed balance: opening balance plus the net effect of all records."""
        return (
            account.opening_balance
            + AccountService._transactions_delta(account)
            + AccountService._transfers_delta(account)
        )

    @staticmethod
    def single_active_account(workspace_id: int) -> Account | None:
        """Return the workspace's account iff exactly one non-archived account exists."""
        accounts = list(Account.objects.for_workspace(workspace_id).filter(is_archived=False)[:2])
        if len(accounts) == 1:
            return accounts[0]
        return None
