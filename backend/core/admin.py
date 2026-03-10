from django.contrib import admin

from core.models import LegalDocument


@admin.register(LegalDocument)
class LegalDocumentAdmin(admin.ModelAdmin):
    list_display = ('doc_type', 'version', 'effective_date', 'is_active', 'created_at')
    list_filter = ('doc_type', 'is_active')
    ordering = ('doc_type', '-created_at')
    readonly_fields = ('created_at',)

    def save_model(self, request, obj, form, change):
        """When marking a document active, deactivate others of same type."""
        if obj.is_active:
            LegalDocument.objects.filter(doc_type=obj.doc_type, is_active=True).exclude(pk=obj.pk).update(
                is_active=False
            )
        super().save_model(request, obj, form, change)
