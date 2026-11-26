"""Stored receipts: a photo kept before any transaction exists.

Bytes live in the private media bucket under `receipts/<workspace_id>/<uuid hex><ext>`;
the row (ReceiptCapture) holds the metadata and the reading state. Every storage
interaction goes through the AttachmentService helpers, so this module never imports
StorageService and one patch of transactions.attachments.StorageService isolates both
services in tests.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction as db_transaction
from django.db.models import Q
from django.utils import timezone

from transactions import parser_client
from transactions.attachments import ALLOWED_CONTENT_TYPES, AttachmentService
from transactions.exceptions import ReceiptNotFoundError
from transactions.models import ReceiptCapture

RESUME_INTERVAL_SECONDS = 15 * 60  # equals the beat interval of resume-waiting-receipts

# A trailing store number: 1 to 6 digits, optionally behind a standalone "#", "no" or "nr".
_STORE_NUMBER_SUFFIX = re.compile(r'(?<!\S)(?:#|no\.?|nr)\s*\d{1,6}$|\s+\d{1,6}$')


def normalize_merchant(merchant: str | None) -> str | None:
    """The key two receipts from one shop share: the merchant name, folded and trimmed.

    NFKC-normalized, case-folded, whitespace collapsed, a trailing store number dropped, at
    most 255 characters (the width of `ReceiptCapture.merchant_key`), None when nothing is left.
    """
    if not merchant:
        return None
    text = unicodedata.normalize('NFKC', merchant).casefold()
    text = _STORE_NUMBER_SUFFIX.sub('', ' '.join(text.split())).strip()
    return text[:255] or None


class ReceiptService:
    @staticmethod
    def _build_key(workspace_id: int, content_type: str) -> str:
        ext = ALLOWED_CONTENT_TYPES[content_type]
        return f'receipts/{workspace_id}/{uuid.uuid4().hex}{ext}'

    @staticmethod
    def _dispatch_read(receipt_id: int) -> None:
        # Imported in the body: tasks.py imports this module, so a module-level import would be circular.
        from transactions.tasks import read_receipt

        # on_commit: a worker must not start a read before the row it fetches is committed.
        # Outside an atomic block (the beat job) the callback runs at once.
        db_transaction.on_commit(lambda: read_receipt.delay(receipt_id))

    @staticmethod
    def _inflight_stuck_before():
        """Before this instant, a `queued` or `reading` row is a read nobody is running.

        A worker crash or a lost queue message leaves a receipt in flight for good. The
        threshold outlasts any legitimate wait: a full resume batch read one after the
        other, plus one beat interval. Settings are read here, at call time.
        """
        return timezone.now() - timedelta(
            seconds=settings.RECEIPT_RESUME_BATCH_SIZE * settings.PARSER_TIMEOUT_SECONDS + RESUME_INTERVAL_SECONDS
        )

    @staticmethod
    @db_transaction.atomic
    def create_from_upload(user, workspace_id: int, file) -> ReceiptCapture:
        """Store the uploaded photo and record it; nothing is read yet.

        The photo is saved whether or not the parser is configured, so hand
        entry stays possible. A failing row write removes the object it
        would have referenced before the error propagates.
        """
        content_type = AttachmentService.validate_content_type(file)
        key = ReceiptService._build_key(workspace_id, content_type)
        stored_key = AttachmentService.store_file(key, file.read(), content_type)
        try:
            receipt = ReceiptCapture.objects.create(
                workspace_id=workspace_id,
                created_by=user,
                updated_by=user,
                file_key=stored_key,
                filename=(file.name or 'receipt')[:255],
                content_type=content_type,
                size=file.size,
                state=ReceiptCapture.QUEUED if parser_client.is_enabled() else ReceiptCapture.WAITING,
            )
        except Exception:
            # The row never landed, so nothing references the object any more.
            AttachmentService.delete_storage_objects([stored_key])
            raise
        if receipt.state == ReceiptCapture.QUEUED:
            ReceiptService._dispatch_read(receipt.id)
        return receipt

    @staticmethod
    def get(receipt_id: int, workspace_id: int) -> ReceiptCapture:
        """The receipt of this workspace; a foreign id reads as missing (ReceiptNotFoundError)."""
        receipt = ReceiptCapture.objects.for_workspace(workspace_id).filter(id=receipt_id).first()
        if not receipt:
            raise ReceiptNotFoundError()
        return receipt

    @staticmethod
    def list_open(workspace_id: int):
        """Every receipt of the workspace that has not become a transaction, newest first."""
        return (
            ReceiptCapture.objects.for_workspace(workspace_id)
            .exclude(state=ReceiptCapture.SAVED)
            .select_related('created_by')
        )

    @staticmethod
    def read_bytes(receipt: ReceiptCapture) -> bytes | None:
        """The stored photo; None once the file was handed over or the object is unreachable."""
        if not receipt.file_key:
            return None
        return AttachmentService.fetch_file(receipt.file_key)

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, receipt_id: int) -> None:
        """Delete the row and, only while it still owned one, its storage object."""
        receipt = ReceiptService.get(receipt_id, workspace_id)
        file_key = receipt.file_key
        receipt.delete()
        if file_key:
            AttachmentService.delete_storage_objects([file_key])

    @staticmethod
    def delete_storage_for_workspace(workspace_id: int) -> None:
        """Remove the stored objects of every receipt in the workspace that still owns one.

        Call BEFORE deleting the rows: the FK cascade removes them, and S3
        objects would otherwise be orphaned. Handed-over receipts (file_key
        is '') are skipped because their object belongs to an attachment.
        """
        keys = list(
            ReceiptCapture.objects.for_workspace(workspace_id).exclude(file_key='').values_list('file_key', flat=True)
        )
        AttachmentService.delete_storage_objects(keys)

    @staticmethod
    @db_transaction.atomic
    def begin_reading(receipt_id: int) -> ReceiptCapture | None:
        """Claim a receipt for one read. None when the row is gone, `ready` or `saved`.

        The lock covers this short section only. The parser answers after it, with no lock held.
        """
        try:
            receipt = ReceiptCapture.objects.select_for_update().get(id=receipt_id)
        except ReceiptCapture.DoesNotExist:
            return None
        if receipt.state in (ReceiptCapture.READY, ReceiptCapture.SAVED):
            return None
        receipt.state = ReceiptCapture.READING
        receipt.save(update_fields=['state', 'updated_at'])
        return receipt

    @staticmethod
    def mark_waiting(receipt: ReceiptCapture) -> None:
        """Park a receipt for the scanner. It stays open, so hand entry still works.

        A compare-and-set out of `reading`, the state `begin_reading` left: a read that ends
        after the receipt was saved, retried or deleted changes nothing.
        """
        ReceiptCapture.objects.filter(id=receipt.id, state=ReceiptCapture.READING).update(
            state=ReceiptCapture.WAITING, error='', updated_at=timezone.now()
        )

    @staticmethod
    def mark_failed(receipt: ReceiptCapture, message: str) -> None:
        """Record a read the same bytes could never pass. The receipt stays open and retryable."""
        ReceiptCapture.objects.filter(id=receipt.id, state=ReceiptCapture.READING).update(
            state=ReceiptCapture.FAILED, error=message, updated_at=timezone.now()
        )

    @staticmethod
    @db_transaction.atomic
    def store_result(receipt_id: int, result: dict) -> bool:
        """Keep a read's result. False when the receipt moved on and nothing was written."""
        try:
            receipt = ReceiptCapture.objects.select_for_update().get(id=receipt_id)
        except ReceiptCapture.DoesNotExist:
            return False
        if receipt.state == ReceiptCapture.SAVED or not receipt.file_key:
            return False
        receipt.result = result
        receipt.merchant_key = normalize_merchant(result.get('merchant'))
        receipt.error = ''
        receipt.state = ReceiptCapture.READY
        receipt.save(update_fields=['result', 'merchant_key', 'error', 'state', 'updated_at'])
        return True

    @staticmethod
    @db_transaction.atomic
    def retry(user, workspace_id: int, receipt_id: int) -> ReceiptCapture:
        """Queue a fresh read. Works from every open state; a `saved` receipt is returned as it is.

        A saved receipt no longer owns a file, so nothing is read and nothing is dispatched.
        Without a configured parser the receipt waits instead of queueing.
        """
        try:
            receipt = ReceiptCapture.objects.select_for_update().for_workspace(workspace_id).get(id=receipt_id)
        except ReceiptCapture.DoesNotExist:
            raise ReceiptNotFoundError()
        if receipt.state == ReceiptCapture.SAVED:
            return receipt

        receipt.error = ''
        receipt.updated_by = user
        if parser_client.is_enabled():
            receipt.state = ReceiptCapture.QUEUED
        else:
            receipt.state = ReceiptCapture.WAITING
        receipt.save(update_fields=['state', 'error', 'updated_by', 'updated_at'])
        if receipt.state == ReceiptCapture.QUEUED:
            ReceiptService._dispatch_read(receipt.id)
        return receipt

    @staticmethod
    def resume_waiting() -> int:
        """Queue reads for every receipt that waits, oldest first. Returns how many were queued.

        Run by beat once the parser answers again. Also picks up reads lost in flight. A
        `failed` receipt is never picked: the same bytes would be rejected again. Nothing is deleted.
        """
        stuck_before = ReceiptService._inflight_stuck_before()
        picked = list(
            ReceiptCapture.objects.filter(
                Q(state=ReceiptCapture.WAITING)
                | Q(state__in=(ReceiptCapture.QUEUED, ReceiptCapture.READING), updated_at__lt=stuck_before)
            )
            .order_by('created_at', 'id')
            .values_list('id', 'state')[: settings.RECEIPT_RESUME_BATCH_SIZE]
        )

        dispatched = 0
        for receipt_id, state in picked:
            # Compare-and-set: the pick ran without a lock, so flip only a row still as picked.
            changed = ReceiptCapture.objects.filter(id=receipt_id, state=state).update(
                state=ReceiptCapture.QUEUED, error='', updated_at=timezone.now()
            )
            if not changed:
                continue
            ReceiptService._dispatch_read(receipt_id)
            dispatched += 1
        return dispatched
