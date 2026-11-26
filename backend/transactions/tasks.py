"""Celery tasks for the transactions app (receipt extraction, R5)."""

import logging

from celery import shared_task
from django.conf import settings

from transactions import parser_client
from transactions.attachments import AttachmentService
from transactions.models import TransactionAttachment
from transactions.parser_client import ParserServiceError, ParserUnavailableError, parse_receipt
from transactions.receipts import ReceiptService
from transactions.services import TransactionService

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(ParserUnavailableError,),
    max_retries=settings.PARSER_EXTRACT_MAX_RETRIES,
    retry_backoff=settings.PARSER_EXTRACT_RETRY_BACKOFF,
    retry_backoff_max=settings.PARSER_EXTRACT_RETRY_BACKOFF_MAX,
    retry_jitter=True,
)
def extract_attachment(self, attachment_id: int) -> None:
    """Send an attachment to the parser and store the contract result on it.

    The parser lives on an intermittently-available host, so an unreachable
    service is not a failure: the attachment stays `pending` and the task
    retries with exponential backoff (~12h by default) until the host returns.
    Only a rejected file — or exhausted retries — records a `failed` state,
    which stays retryable from the UI so manual work is never blocked.
    """
    attachment = TransactionAttachment.objects.filter(id=attachment_id).first()
    if not attachment:
        logger.warning('Attachment %s not found, skipping extraction.', attachment_id)
        return

    content = AttachmentService.read_bytes(attachment)
    if content is None:
        AttachmentService.mark_extraction_failed(attachment, 'The stored file could not be read.')
        return

    try:
        result = parse_receipt(content, attachment.filename, attachment.content_type)
    except ParserUnavailableError as exc:
        if self.request.retries >= self.max_retries:
            logger.warning(
                'Extraction for attachment %s gave up after %s retries: %s', attachment_id, self.max_retries, exc
            )
            AttachmentService.mark_extraction_failed(
                attachment, 'The scanning service stayed unavailable. Try again once it is back online.'
            )
            return
        # autoretry_for reschedules this with backoff; the row stays pending.
        logger.info(
            'Extraction for attachment %s deferred (attempt %s): %s', attachment_id, self.request.retries + 1, exc
        )
        raise
    except ParserServiceError as exc:
        logger.warning('Extraction failed for attachment %s: %s', attachment_id, exc)
        AttachmentService.mark_extraction_failed(attachment, str(exc))
        return

    AttachmentService.mark_extraction_done(attachment, result)

    created_items = TransactionService.auto_fill_from_extraction(attachment.transaction, result)
    if created_items:
        logger.info(
            'Extraction auto-filled items for transaction %s from attachment %s.',
            attachment.transaction_id,
            attachment_id,
        )
    else:
        logger.info(
            'Extraction did not auto-fill items for transaction %s (already populated or nothing to fill).',
            attachment.transaction_id,
        )


@shared_task(
    bind=True,
    autoretry_for=(ParserUnavailableError,),
    max_retries=settings.PARSER_EXTRACT_MAX_RETRIES,
    retry_backoff=settings.PARSER_EXTRACT_RETRY_BACKOFF,
    retry_backoff_max=settings.PARSER_EXTRACT_RETRY_BACKOFF_MAX,
    retry_jitter=True,
)
def read_receipt(self, receipt_id: int) -> None:
    """Read one stored receipt and keep the parser's result on it.

    Like extract_attachment, except that an unavailable parser is never a failure: the
    receipt goes to `waiting` and the task retries with backoff; when the retries run out
    it stays `waiting` for the beat job. Only a rejected file or unreadable bytes record
    `failed`, which stays retryable so manual work is never blocked. A read that ends
    after the receipt was saved or deleted changes nothing.
    """
    receipt = ReceiptService.begin_reading(receipt_id)
    if receipt is None:
        return

    if not parser_client.is_enabled():
        ReceiptService.mark_waiting(receipt)
        return

    content = ReceiptService.read_bytes(receipt)
    if content is None:
        ReceiptService.mark_failed(receipt, 'The stored file could not be read.')
        return

    try:
        result = parse_receipt(content, receipt.filename, receipt.content_type)
    except ParserUnavailableError as exc:
        ReceiptService.mark_waiting(receipt)
        if self.request.retries >= self.max_retries:
            logger.warning('Reading receipt %s gave up after %s retries: %s', receipt_id, self.max_retries, exc)
            return
        # autoretry_for reschedules this with backoff.
        logger.info('Reading receipt %s deferred (attempt %s): %s', receipt_id, self.request.retries + 1, exc)
        raise
    except ParserServiceError as exc:
        logger.warning('Reading failed for receipt %s: %s', receipt_id, exc)
        ReceiptService.mark_failed(receipt, str(exc))
        return

    if not ReceiptService.store_result(receipt.id, result):
        logger.info('Receipt %s was saved or deleted while it was read; result discarded.', receipt_id)


@shared_task
def resume_waiting_receipts() -> int:
    """Queue reads again for receipts that waited for the scanner, or lost their read.

    Beat runs this every 15 minutes. It only queues: nothing here deletes a receipt or its
    file, and a `failed` receipt is never resumed (the same bytes would be rejected again).
    """
    if not parser_client.is_reachable():
        return 0
    return ReceiptService.resume_waiting()
