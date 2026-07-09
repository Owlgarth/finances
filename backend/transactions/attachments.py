"""Attachment storage logic for transactions (receipt images/PDFs).

Bytes live in the private media bucket; rows hold metadata only. Every
storage interaction goes through common.storage.StorageService, so this
module stays testable with the service mocked and degrades to a 503 when
S3 storage is disabled.
"""

from __future__ import annotations

import logging
import uuid

from django.conf import settings
from django.db import transaction as db_transaction

from common.storage import StorageService
from transactions.exceptions import (
    AttachmentNotFoundError,
    AttachmentStorageUnavailableError,
    AttachmentTypeError,
)
from transactions.models import Transaction, TransactionAttachment

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/heic': '.heic',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
}
MAX_ATTACHMENT_SIZE_MB = 15
MAX_ATTACHMENTS_PER_TRANSACTION = 10
DOWNLOAD_URL_EXPIRY_SECONDS = 300


class AttachmentService:
    @staticmethod
    def _media_bucket() -> str:
        # Defined in settings only when USE_S3_STORAGE is true.
        return getattr(settings, 'S3_BUCKET_MEDIA', '')

    @staticmethod
    def _build_key(workspace_id: int, transaction_id: int, content_type: str) -> str:
        ext = ALLOWED_CONTENT_TYPES[content_type]
        return f'attachments/{workspace_id}/{transaction_id}/{uuid.uuid4().hex}{ext}'

    @staticmethod
    def _get_attachment(trans: Transaction, attachment_id: int) -> TransactionAttachment:
        attachment = trans.attachments.filter(id=attachment_id).first()
        if not attachment:
            raise AttachmentNotFoundError()
        return attachment

    @staticmethod
    def upload(user, trans: Transaction, file) -> TransactionAttachment:
        """Store the file in the media bucket and record its metadata."""
        if not StorageService._is_enabled():
            raise AttachmentStorageUnavailableError()
        content_type = (file.content_type or '').lower()
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise AttachmentTypeError()
        if trans.attachments.count() >= MAX_ATTACHMENTS_PER_TRANSACTION:
            raise AttachmentTypeError(f'A transaction can have at most {MAX_ATTACHMENTS_PER_TRANSACTION} attachments')

        key = AttachmentService._build_key(trans.workspace_id, trans.id, content_type)
        stored_key = StorageService.save_file(
            AttachmentService._media_bucket(),
            key,
            file.read(),
            content_type=content_type,
        )
        if stored_key is None:
            raise AttachmentStorageUnavailableError()

        return TransactionAttachment.objects.create(
            transaction=trans,
            file_key=stored_key,
            filename=file.name or 'receipt',
            content_type=content_type,
            size=file.size,
            uploaded_by=user,
        )

    @staticmethod
    def list_with_urls(trans: Transaction) -> list[dict]:
        """Attachment metadata plus a short-lived presigned download URL each.

        With storage disabled the URLs come back None — metadata still lists.
        """
        bucket = AttachmentService._media_bucket()
        return [
            {
                'id': a.id,
                'filename': a.filename,
                'content_type': a.content_type,
                'size': a.size,
                'created_at': a.created_at,
                'download_url': StorageService.get_presigned_url(
                    bucket, a.file_key, expiry=DOWNLOAD_URL_EXPIRY_SECONDS
                ),
            }
            for a in trans.attachments.all()
        ]

    @staticmethod
    @db_transaction.atomic
    def delete(trans: Transaction, attachment_id: int) -> None:
        """Delete the row and its storage object."""
        attachment = AttachmentService._get_attachment(trans, attachment_id)
        file_key = attachment.file_key
        attachment.delete()
        AttachmentService._delete_storage_objects([file_key])

    @staticmethod
    def delete_storage_for_transactions(transaction_queryset) -> None:
        """Remove storage objects for every attachment under the given transactions.

        Call BEFORE deleting the transactions — the FK cascade removes the
        metadata rows, and S3 objects would otherwise be orphaned.
        """
        keys = list(
            TransactionAttachment.objects.filter(transaction__in=transaction_queryset).values_list(
                'file_key', flat=True
            )
        )
        AttachmentService._delete_storage_objects(keys)

    @staticmethod
    def _delete_storage_objects(keys: list[str]) -> None:
        if not keys or not StorageService._is_enabled():
            return
        bucket = AttachmentService._media_bucket()
        for key in keys:
            StorageService.delete_file(bucket, key)

    # --- GDPR export/import ---

    @staticmethod
    def export_for_transaction(trans: Transaction) -> list[dict]:
        """Attachment metadata + base64 content for the GDPR export.

        With storage disabled (or an object missing) `content_b64` is None —
        the metadata still documents that the attachment existed.
        """
        import base64

        bucket = AttachmentService._media_bucket()
        result = []
        for a in trans.attachments.all():
            content = StorageService.get_file(bucket, a.file_key) if StorageService._is_enabled() else None
            result.append(
                {
                    'filename': a.filename,
                    'content_type': a.content_type,
                    'size': a.size,
                    'content_b64': base64.b64encode(content).decode('ascii') if content is not None else None,
                }
            )
        return result

    @staticmethod
    def import_for_transaction(user, trans: Transaction, attachments_data: list[dict]) -> int:
        """Recreate attachments from a GDPR export. Skips entries without content or when storage is off."""
        import base64

        if not StorageService._is_enabled():
            return 0
        created = 0
        for att in attachments_data or []:
            content_b64 = att.get('content_b64')
            content_type = (att.get('content_type') or '').lower()
            if not content_b64 or content_type not in ALLOWED_CONTENT_TYPES:
                continue
            content = base64.b64decode(content_b64)
            key = AttachmentService._build_key(trans.workspace_id, trans.id, content_type)
            stored_key = StorageService.save_file(AttachmentService._media_bucket(), key, content, content_type)
            if stored_key is None:
                continue
            TransactionAttachment.objects.create(
                transaction=trans,
                file_key=stored_key,
                filename=att.get('filename') or 'receipt',
                content_type=content_type,
                size=len(content),
                uploaded_by=user,
            )
            created += 1
        return created
