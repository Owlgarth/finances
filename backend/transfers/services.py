"""Business logic for the transfers app."""

from django.db import transaction as db_transaction
from django.db.models import Q

from accounts.models import Account
from accounts.services import AccountService
from core.schemas.pagination import DEFAULT_PAGE_SIZE, paginate_queryset
from transfers.exceptions import (
    TransferAccountArchivedError,
    TransferAccountsEqualError,
    TransferAmountsMismatchError,
    TransferNotFoundError,
    TransferToAmountRequiredError,
)
from transfers.models import Transfer
from transfers.schemas import TransferCreate


class TransferService:
    @staticmethod
    def _validate(workspace_id: int, data: TransferCreate, allow_archived: bool = False) -> tuple[Account, Account]:
        """Resolve and validate both accounts; normalize to_amount for same-currency transfers.

        Returns (from_account, to_account). Mutates data.to_amount when it can
        be defaulted. allow_archived permits editing a transfer whose accounts
        were archived after the fact — retargeting to an archived account is
        rejected by the caller comparing account ids.
        """
        if data.from_account_id == data.to_account_id:
            raise TransferAccountsEqualError()

        from_account = AccountService.get(data.from_account_id, workspace_id)
        to_account = AccountService.get(data.to_account_id, workspace_id)

        if not allow_archived and (from_account.is_archived or to_account.is_archived):
            raise TransferAccountArchivedError()

        if from_account.currency_id == to_account.currency_id:
            if data.to_amount is None:
                data.to_amount = data.from_amount
            elif data.to_amount != data.from_amount:
                raise TransferAmountsMismatchError()
        elif data.to_amount is None:
            raise TransferToAmountRequiredError()

        return from_account, to_account

    @staticmethod
    def get(transfer_id: int, workspace_id: int) -> Transfer:
        """Get a transfer and verify it belongs to the workspace."""
        transfer = (
            Transfer.objects.select_related('from_account__currency', 'to_account__currency')
            .for_workspace(workspace_id)
            .filter(id=transfer_id)
            .first()
        )
        if not transfer:
            raise TransferNotFoundError()
        return transfer

    @staticmethod
    def list(
        workspace_id: int,
        date_from=None,
        date_to=None,
        account_id: int | None = None,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> dict:
        """List transfers, optionally filtered by date range and account (either side)."""
        queryset = Transfer.objects.for_workspace(workspace_id).select_related(
            'from_account__currency', 'to_account__currency'
        )

        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        if account_id:
            queryset = queryset.filter(Q(from_account_id=account_id) | Q(to_account_id=account_id))

        queryset = queryset.order_by('-date', '-id')

        items, total, page, page_size, total_pages = paginate_queryset(queryset, page, page_size)
        return {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        }

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: TransferCreate) -> Transfer:
        """Create a transfer between two active accounts."""
        from_account, to_account = TransferService._validate(workspace_id, data)

        return Transfer.objects.create(
            workspace_id=workspace_id,
            from_account=from_account,
            to_account=to_account,
            from_amount=data.from_amount,
            to_amount=data.to_amount,
            date=data.date,
            description=data.description,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, transfer_id: int, data: TransferCreate) -> Transfer:
        """Fully replace a transfer.

        Editing a transfer whose accounts were archived since is allowed, but
        retargeting either side to an archived account is rejected.
        """
        transfer = TransferService.get(transfer_id, workspace_id)

        from_account, to_account = TransferService._validate(workspace_id, data, allow_archived=True)
        for new_account, current_id in ((from_account, transfer.from_account_id), (to_account, transfer.to_account_id)):
            if new_account.id != current_id and new_account.is_archived:
                raise TransferAccountArchivedError()

        transfer.from_account = from_account
        transfer.to_account = to_account
        transfer.from_amount = data.from_amount
        transfer.to_amount = data.to_amount
        transfer.date = data.date
        transfer.description = data.description
        transfer.updated_by = user
        transfer.save()
        return transfer

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, transfer_id: int) -> None:
        """Delete a transfer. Balances are computed, so nothing else to revert."""
        transfer = TransferService.get(transfer_id, workspace_id)
        transfer.delete()
