"""Django admin configuration for transactions app."""

from django.contrib import admin
from django.utils.html import format_html

from common.storage import StorageService
from transactions.attachments import DOWNLOAD_URL_EXPIRY_SECONDS, AttachmentService
from transactions.models import Transaction, TransactionAttachment


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    """Admin interface for Transaction model."""

    list_display = ('date', 'description', 'account', 'category', 'type', 'amount', 'created_at')
    list_filter = ('type', 'date', 'created_at')
    search_fields = ('description', 'category__name', 'account__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'date'


@admin.register(TransactionAttachment)
class TransactionAttachmentAdmin(admin.ModelAdmin):
    """Attachment metadata admin; bytes stay in the private media bucket.

    The readonly download link is a short-lived presigned URL - the only
    live consumer of StorageService.get_presigned_url now that API
    responses no longer embed one.
    """

    list_display = ('id', 'filename', 'transaction', 'content_type', 'size', 'uploaded_by', 'created_at')
    list_filter = ('content_type',)
    search_fields = ('filename', 'transaction__description')
    readonly_fields = ('file_key', 'created_at', 'presigned_download_link')

    @admin.display(description='Download link')
    def presigned_download_link(self, obj: TransactionAttachment) -> str:
        url = StorageService.get_presigned_url(
            AttachmentService._media_bucket(), obj.file_key, expiry=DOWNLOAD_URL_EXPIRY_SECONDS
        )
        if url is None:
            return 'storage disabled'
        return format_html('<a href="{}" target="_blank" rel="noreferrer">Presigned URL</a>', url)
