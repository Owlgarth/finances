"""Django admin configuration for budget_accounts app."""

from django.contrib import admin

from budget_accounts.models import BudgetAccount


@admin.register(BudgetAccount)
class BudgetAccountAdmin(admin.ModelAdmin):
    """Admin interface for BudgetAccount model."""

    list_display = ('name', 'workspace', 'default_currency', 'is_active', 'display_order', 'created_at')
    list_filter = ('is_active', 'default_currency', 'created_at')
    search_fields = ('name', 'description', 'workspace__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
