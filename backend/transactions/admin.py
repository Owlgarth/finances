"""Django admin configuration for transactions app."""

from django.contrib import admin

from transactions.models import Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    """Admin interface for Transaction model."""

    list_display = ('date', 'description', 'category', 'type', 'amount', 'currency', 'created_at')
    list_filter = ('type', 'currency', 'date', 'created_at')
    search_fields = ('description', 'category__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'date'
