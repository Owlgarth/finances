"""Business logic for the planned_transactions app."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounts.models import Account
from accounts.services import AccountService
from categories.models import Category
from common.enums import TotalsLabel
from common.idempotency import IDEMPOTENCY_TTL, create_with_idempotency
from core.schemas.pagination import DEFAULT_PAGE_SIZE, paginate_queryset
from planned_transactions.exceptions import (
    PlannedTransactionAccountArchivedError,
    PlannedTransactionAccountRequiredError,
    PlannedTransactionAlreadyExecutedError,
    PlannedTransactionCannotRevertError,
    PlannedTransactionCategoryNotFoundError,
    PlannedTransactionImportError,
    PlannedTransactionNotFoundError,
)
from planned_transactions.models import PlannedTransaction, PlannedTransactionIdempotencyKey
from planned_transactions.schemas import PlannedTransactionCreate, PlannedTransactionImport
from planned_transactions.tasks import execute_planned_transaction
from transactions.models import Transaction


class PlannedTransactionService:
    @staticmethod
    def _resolve_account(workspace_id: int, account_id: int | None) -> Account:
        """Resolve the target account, defaulting when exactly one active account exists."""
        if account_id is not None:
            account = AccountService.get(account_id, workspace_id)
        else:
            account = AccountService.single_active_account(workspace_id)
            if not account:
                raise PlannedTransactionAccountRequiredError()
        if account.is_archived:
            raise PlannedTransactionAccountArchivedError()
        return account

    @staticmethod
    def _validate_category(category_id: int | None, workspace_id: int) -> None:
        """Raise if the category is missing, in another workspace, or archived."""
        if not category_id:
            return
        category = Category.objects.for_workspace(workspace_id).filter(id=category_id).first()
        if not category or category.is_archived:
            raise PlannedTransactionCategoryNotFoundError()

    @staticmethod
    def _build_filtered_queryset(
        workspace_id: int,
        status: str | None = None,
        account_id: list | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        currency_code: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
    ):
        """Build a filtered queryset for planned transactions."""
        queryset = PlannedTransaction.objects.for_workspace(workspace_id)
        if status:
            queryset = queryset.filter(status=status)
        if account_id:
            queryset = queryset.filter(account_id__in=account_id)
        if start_date:
            queryset = queryset.filter(planned_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(planned_date__lte=end_date)
        if category_id:
            queryset = queryset.filter(category_id__in=category_id)
        if budget_id:
            queryset = queryset.filter(category__budget_id__in=budget_id)
        if currency_code:
            queryset = queryset.filter(account__currency__code__in=currency_code)
        if search:
            queryset = queryset.filter(name__icontains=search)
        if amount_gte is not None:
            queryset = queryset.filter(amount__gte=amount_gte)
        if amount_lte is not None:
            queryset = queryset.filter(amount__lte=amount_lte)
        return queryset

    @staticmethod
    def _lookup_idempotency_key(user, workspace_id: int, key: str) -> PlannedTransactionIdempotencyKey | None:
        """Return the user's unexpired dedup record for `key` in this workspace, or None.

        Mirror of TransactionService._lookup_idempotency_key — "unexpired" = created
        within IDEMPOTENCY_TTL; a record whose planned FK was SET_NULL'd by a delete is
        returned as-is (create_with_idempotency decides what to do with it). Scoped to
        workspace so a replay under workspace B cannot return workspace A's planned row.
        """
        cutoff = timezone.now() - IDEMPOTENCY_TTL
        return (
            PlannedTransactionIdempotencyKey.objects.filter(
                key=key, user=user, workspace_id=workspace_id, created_at__gt=cutoff
            )
            .select_related('planned_transaction')
            .first()
        )

    @staticmethod
    def _do_create(user, workspace_id: int, data: PlannedTransactionCreate) -> PlannedTransaction:
        """Build and persist the planned transaction — no idempotency logic.

        Runs inside the caller's atomic block when a key is given
        (create_with_idempotency's SAVEPOINT); standalone otherwise. Do NOT add a
        method-level @db_transaction.atomic — the done-branch dispatches its Celery
        task after its own inner commit, and wrapping the whole method would enqueue
        the message before the outer commit.
        """
        account = PlannedTransactionService._resolve_account(workspace_id, data.account_id)
        PlannedTransactionService._validate_category(data.category_id, workspace_id)

        if data.status == 'done':
            with db_transaction.atomic():
                planned = PlannedTransaction.objects.create(
                    workspace_id=workspace_id,
                    account=account,
                    name=data.name,
                    amount=data.amount,
                    category_id=data.category_id,
                    planned_date=data.planned_date,
                    status='done',
                    payment_date=data.planned_date,
                    created_by=user,
                    updated_by=user,
                )
            execute_planned_transaction.delay(planned.id)
            planned.refresh_from_db()
            return planned

        return PlannedTransaction.objects.create(
            workspace_id=workspace_id,
            account=account,
            name=data.name,
            amount=data.amount,
            category_id=data.category_id,
            planned_date=data.planned_date,
            status=data.status,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    def get_planned(planned_id: int, workspace_id: int) -> PlannedTransaction:
        """Get a planned transaction and verify it belongs to the workspace."""
        planned = (
            PlannedTransaction.objects.select_related('account__currency', 'category')
            .for_workspace(workspace_id)
            .filter(id=planned_id)
            .first()
        )
        if not planned:
            raise PlannedTransactionNotFoundError()
        return planned

    @staticmethod
    def list(
        workspace_id: int,
        status: str | None = None,
        account_id: list | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        currency_code: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
        ordering: str | None = None,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> dict:
        queryset = PlannedTransactionService._build_filtered_queryset(
            workspace_id,
            status,
            account_id,
            start_date,
            end_date,
            category_id=category_id,
            budget_id=budget_id,
            currency_code=currency_code,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        )
        sort_order = ordering or 'planned_date'
        queryset = queryset.select_related('account__currency', 'category').order_by(sort_order, '-id')

        items, total, page, page_size, total_pages = paginate_queryset(queryset, page, page_size)
        return {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        }

    @staticmethod
    def totals(
        workspace_id: int,
        status: str | None = None,
        account_id: list | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
        group_by: str = 'currency',
    ) -> list[dict]:
        """Return aggregated totals grouped by currency or category."""
        queryset = PlannedTransactionService._build_filtered_queryset(
            workspace_id,
            status,
            account_id,
            start_date,
            end_date,
            category_id=category_id,
            budget_id=budget_id,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        )

        if group_by == 'category':
            rows = (
                queryset.annotate(
                    account_currency_code=F('account__currency__code'),
                    grouped_category_name=Coalesce('category__name', Value(str(TotalsLabel.UNCATEGORIZED))),
                )
                .values('grouped_category_name', 'account_currency_code')
                .annotate(total=Sum('amount'))
                .order_by('grouped_category_name', 'account_currency_code')
            )
            return [
                {'group': r['grouped_category_name'], 'currency': r['account_currency_code'], 'total': r['total']}
                for r in rows
            ]

        # Default: group by currency
        rows = (
            queryset.annotate(account_currency_code=F('account__currency__code'))
            .values('account_currency_code')
            .annotate(total=Sum('amount'))
            .order_by('account_currency_code')
        )
        return [
            {'group': r['account_currency_code'], 'currency': r['account_currency_code'], 'total': r['total']}
            for r in rows
        ]

    @staticmethod
    def create(
        user,
        workspace_id: int,
        data: PlannedTransactionCreate,
        idempotency_key: str | None = None,
    ) -> PlannedTransaction:
        """Create a planned transaction on an account.

        If `idempotency_key` is provided, dedup within a 24h window per user per
        workspace: a replay with the same key returns the originally-created
        planned transaction instead of creating a second one (Stripe-style —
        same key, same result, regardless of payload). Mirrors
        TransactionService.create; the dedup flow itself is shared in
        common.idempotency.create_with_idempotency.
        """
        if not idempotency_key:
            return PlannedTransactionService._do_create(user, workspace_id, data)
        return create_with_idempotency(
            user=user,
            workspace_id=workspace_id,
            data=data,
            key=idempotency_key,
            lookup=PlannedTransactionService._lookup_idempotency_key,
            do_create=PlannedTransactionService._do_create,
            record_model=PlannedTransactionIdempotencyKey,
            target_model=PlannedTransaction,
            target_field='planned_transaction',
        )

    @staticmethod
    def update(user, workspace_id: int, planned_id: int, data: PlannedTransactionCreate) -> PlannedTransaction:
        """Update a planned transaction.

        Editing a done planned re-applies name/amount/category/account to the
        transaction its execution created, so the two never desync; the
        transaction keeps its own date (the payment date).
        """
        planned = PlannedTransactionService.get_planned(planned_id, workspace_id)

        if planned.status == 'done' and data.status != 'done':
            raise PlannedTransactionCannotRevertError()

        account = PlannedTransactionService._resolve_account(workspace_id, data.account_id or planned.account_id)
        PlannedTransactionService._validate_category(data.category_id, workspace_id)

        planned.account = account
        planned.name = data.name
        planned.amount = data.amount
        planned.category_id = data.category_id
        planned.planned_date = data.planned_date
        planned.updated_by = user

        if data.status == 'done' and planned.status != 'done':
            planned.status = 'done'
            planned.payment_date = planned.planned_date
            with db_transaction.atomic():
                planned.save()
            execute_planned_transaction.delay(planned.id)
            planned.refresh_from_db()
            return planned

        planned.status = data.status
        with db_transaction.atomic():
            planned.save()
            if planned.transaction_id:
                mirror = Transaction.objects.filter(id=planned.transaction_id, workspace_id=workspace_id).first()
                if mirror:
                    mirror.description = planned.name
                    mirror.amount = planned.amount
                    mirror.category_id = planned.category_id
                    mirror.account_id = planned.account_id
                    mirror.updated_by = user
                    mirror.save()
        return planned

    @staticmethod
    def delete(workspace_id: int, planned_id: int) -> None:
        """Delete a planned transaction."""
        planned = PlannedTransactionService.get_planned(planned_id, workspace_id)
        planned.delete()

    @staticmethod
    def execute(user, workspace_id: int, planned_id: int, payment_date: date) -> PlannedTransaction:
        """Execute a planned transaction, creating an actual transaction on its account."""
        planned = PlannedTransactionService.get_planned(planned_id, workspace_id)

        if planned.status == 'done':
            raise PlannedTransactionAlreadyExecutedError()

        planned.status = 'done'
        planned.payment_date = payment_date
        planned.updated_by = user
        with db_transaction.atomic():
            planned.save()
        execute_planned_transaction.delay(planned.id)
        planned.refresh_from_db()
        return planned

    @staticmethod
    def export(
        workspace_id: int,
        status: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[dict]:
        """Return serialisable planned transaction data filtered by status and date range."""
        queryset = PlannedTransactionService._build_filtered_queryset(
            workspace_id, status=status, start_date=start_date, end_date=end_date
        ).select_related('account__currency', 'category')

        return [
            {
                'name': pt.name,
                'amount': str(pt.amount),
                'account_name': pt.account_name,
                'currency_code': pt.currency_code,
                'category_name': pt.category_name,
                'planned_date': pt.planned_date.isoformat(),
            }
            for pt in queryset.order_by('planned_date')
        ]

    @staticmethod
    def import_data(user, workspace_id: int, account_id: int, data: list, budget_id: int | None = None) -> int:
        """Bulk-create planned transactions into one explicit account.

        Categories are matched by name within budget_id when given, else left null.
        """
        account = PlannedTransactionService._resolve_account(workspace_id, account_id)

        category_map: dict[str, int] = {}
        if budget_id is not None:
            category_map = {
                name.lower(): pk
                for pk, name in Category.objects.for_workspace(workspace_id)
                .filter(budget_id=budget_id, is_archived=False)
                .values_list('id', 'name')
            }

        new_transactions = []
        for item in data:
            try:
                import_item = PlannedTransactionImport(**item)
            except Exception as e:
                raise PlannedTransactionImportError(f'Invalid data format: {e}')

            category_id = None
            if import_item.category_name:
                category_id = category_map.get(import_item.category_name.lower())

            new_transactions.append(
                PlannedTransaction(
                    workspace_id=workspace_id,
                    account=account,
                    name=import_item.name,
                    amount=import_item.amount,
                    planned_date=import_item.planned_date,
                    category_id=category_id,
                    status='pending',
                    created_by=user,
                    updated_by=user,
                )
            )

        if not new_transactions:
            return 0

        PlannedTransaction.objects.bulk_create(new_transactions)
        return len(new_transactions)
