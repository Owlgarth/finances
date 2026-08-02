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
        """Count financial records referencing this account."""
        return (
            account.transactions.count()
            + account.planned_transactions.count()
            + account.transfers_in.count()
            + account.transfers_out.count()
        )

    @staticmethod
    def _transactions_delta(account: Account) -> Decimal:
        """Net effect of transactions on the account balance.

        + income − expense + signed adjustments, in a single aggregate query.
        """
        from django.db.models import Case, DecimalField, F, Sum, When

        result = account.transactions.aggregate(
            delta=Sum(
                Case(
                    When(type='expense', then=-F('amount')),
                    default=F('amount'),
                    output_field=DecimalField(max_digits=15, decimal_places=2),
                )
            )
        )
        return result['delta'] or Decimal('0')

    @staticmethod
    def _transfers_delta(account: Account) -> Decimal:
        """Net effect of transfers on the account balance.

        + Σ transfers_in.to_amount − Σ transfers_out.from_amount.
        """
        from django.db.models import Sum

        incoming = account.transfers_in.aggregate(total=Sum('to_amount'))['total'] or Decimal('0')
        outgoing = account.transfers_out.aggregate(total=Sum('from_amount'))['total'] or Decimal('0')
        return incoming - outgoing

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

        # Enforce the one-default-per-(workspace, currency) rule at the service
        # level so a well-behaved client never hits the partial unique
        # constraint (one_default_account_per_currency). No id yet → clear all.
        if data.is_default_for_currency:
            Account.objects.for_workspace(workspace_id).filter(currency=currency, is_default_for_currency=True).update(
                is_default_for_currency=False
            )

        return Account.objects.create(
            workspace_id=workspace_id,
            name=data.name,
            type=data.type,
            currency=currency,
            opening_balance=data.opening_balance,
            display_order=data.display_order,
            is_default_for_currency=data.is_default_for_currency,
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

        # If the client explicitly set this account as the default for its
        # currency, clear any *other* default in that currency first (currency is
        # immutable, so account.currency is the right filter). Then the setattr
        # loop below sets this account's flag to True and save() persists it.
        # An explicit False just falls through to setattr (no clear needed).
        if update_data.get('is_default_for_currency') is True:
            Account.objects.for_workspace(workspace_id).filter(
                currency=account.currency, is_default_for_currency=True
            ).exclude(id=account_id).update(is_default_for_currency=False)

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
        # An archived account must not remain the default for its currency —
        # otherwise it would block a new active default under the partial unique
        # constraint. Unarchiving never auto-promotes to default.
        if data.is_archived and account.is_default_for_currency:
            account.is_default_for_currency = False
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
