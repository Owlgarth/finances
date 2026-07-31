"""Celery tasks for the transactions app (receipt extraction, R5)."""

import logging

from celery import shared_task
from django.conf import settings

from transactions.attachments import AttachmentService
from transactions.models import TransactionAttachment
from transactions.parser_client import ParserServiceError, ParserUnavailableError, parse_receipt
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
