"""Celery tasks for the transactions app (receipt extraction, R5)."""

import logging

from celery import shared_task

from transactions.attachments import AttachmentService
from transactions.models import TransactionAttachment
from transactions.parser_client import ParserServiceError, parse_receipt

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def extract_attachment(self, attachment_id: int) -> None:
    """Send an attachment to the parser and store the contract result on it.

    Never raises out of the task: a failure records a `failed` state with an
    error message (retryable from the UI) so manual work is never blocked.
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
    except ParserServiceError as exc:
        logger.warning('Extraction failed for attachment %s: %s', attachment_id, exc)
        AttachmentService.mark_extraction_failed(attachment, str(exc))
        return

    AttachmentService.mark_extraction_done(attachment, result)
