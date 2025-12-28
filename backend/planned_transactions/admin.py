"""Django admin configuration for planned_transactions app."""

from django.contrib import admin

from planned_transactions.models import PlannedTransaction


@admin.register(PlannedTransaction)
class PlannedTransactionAdmin(admin.ModelAdmin):
    """Admin interface for PlannedTransaction model."""

    list_display = ('name', 'budget_period', 'amount', 'currency', 'status', 'planned_date', 'created_at')
    list_filter = ('status', 'currency', 'planned_date', 'created_at')
    search_fields = ('name', 'category__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
