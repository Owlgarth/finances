"""Stored receipts: a photo kept before any transaction exists.

Bytes live in the private media bucket under `receipts/<workspace_id>/<uuid hex><ext>`;
the row (ReceiptCapture) holds the metadata and the reading state. Every storage
interaction goes through the AttachmentService helpers, so this module never imports
StorageService and one patch of transactions.attachments.StorageService isolates both
services in tests.
"""

from __future__ import annotations

import uuid

from django.db import transaction as db_transaction

from transactions import parser_client
from transactions.attachments import ALLOWED_CONTENT_TYPES, AttachmentService
from transactions.exceptions import ReceiptNotFoundError
from transactions.models import ReceiptCapture


class ReceiptService:
    @staticmethod
    def _build_key(workspace_id: int, content_type: str) -> str:
        ext = ALLOWED_CONTENT_TYPES[content_type]
        return f'receipts/{workspace_id}/{uuid.uuid4().hex}{ext}'

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
            return ReceiptCapture.objects.create(
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
