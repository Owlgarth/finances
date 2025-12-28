"""Django admin configuration for budgets app."""

from django.contrib import admin

from budgets.models import Budget


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    """Admin interface for Budget model."""

    list_display = ('category', 'budget_period', 'currency', 'amount', 'created_at')
    list_filter = ('currency', 'budget_period', 'created_at')
    search_fields = ('category__name', 'budget_period__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
