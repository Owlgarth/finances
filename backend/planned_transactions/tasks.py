"""Celery tasks for the planned_transactions app."""

import logging

from celery import shared_task
from django.db import transaction as db_transaction
from django.utils import timezone

from planned_transactions.models import PlannedTransaction
from transactions.schemas import TransactionCreate
from transactions.services import TransactionService

logger = logging.getLogger(__name__)


@shared_task(bind=True, autoretry_for=(Exception,), max_retries=3, retry_backoff=True)
def execute_planned_transaction(self, planned_id: int) -> None:
    """Create a Transaction and update PeriodBalance for an executed planned transaction.

    Idempotency: if the planned transaction already has a transaction_id set,
    the task skips execution — this prevents duplicate Transactions if the task
    is retried after a partial failure.
    """
    planned = PlannedTransaction.objects.select_related('account', 'category', 'currency').filter(id=planned_id).first()
    if not planned:
        logger.warning('PlannedTransaction %s not found, skipping.', planned_id)
        return

    # Idempotency guard — skip if already processed
    if planned.transaction_id:
        logger.info(
            'PlannedTransaction %s already has transaction_id=%s, skipping.',
            planned_id,
            planned.transaction_id,
        )
        return

    payment_date = planned.payment_date
    if not payment_date:
        logger.error('PlannedTransaction %s has no payment_date, skipping.', planned_id)
        return

    with db_transaction.atomic():
        # Re-fetch with lock to prevent race conditions on retry.
        # Note: select_for_update() cannot be combined with select_related()
        # on nullable FKs (category) — PostgreSQL raises
        # "FOR UPDATE cannot be applied to the nullable side of an outer join".
        planned = PlannedTransaction.objects.select_for_update().get(id=planned_id)

        # Double-check idempotency inside the lock
        if planned.transaction_id:
            return

        transaction_obj = TransactionService.create(
            planned.created_by,
            planned.workspace_id,
            TransactionCreate(
                date=payment_date,
                description=planned.name,
                account_id=planned.account_id,
                currency_code=planned.currency.code,
                category_id=planned.category_id,
                amount=planned.amount,
                type='expense',
            ),
        )

        planned.transaction_id = transaction_obj.id
        planned.save(update_fields=['transaction_id'])

    logger.info(
        'Created Transaction %s for PlannedTransaction %s.',
        transaction_obj.id,
        planned_id,
    )


@shared_task(bind=True, autoretry_for=(Exception,), max_retries=3, retry_backoff=True)
def generate_recurring_transactions(self) -> int:
    """Materialize due planned transactions for every active recurring rule (all workspaces).

    Transport layer only: all DB work delegates to
    RecurringTransactionService.generate_due - tasks never create records
    directly (case file 2026-05-21). The service is idempotent (pointer +
    partial unique constraint on (recurring, planned_date)), so an autoretry
    after a partial pass re-processes rules as no-ops.
    """
    # Function-body import (the celery-tasks skill's circular-import
    # exception): planned_transactions.services already imports this module
    # at module level (execute_planned_transaction, services.py line ~33), so
    # a module-level import here would raise ImportError mid-cycle.
    from planned_transactions.services import RecurringTransactionService

    return RecurringTransactionService.generate_due(timezone.now().date())
