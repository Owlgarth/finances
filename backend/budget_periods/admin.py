"""Django admin configuration for budget_periods app."""

from django.contrib import admin

from budget_periods.models import BudgetPeriod


@admin.register(BudgetPeriod)
class BudgetPeriodAdmin(admin.ModelAdmin):
    """Admin interface for BudgetPeriod model."""

    list_display = ('name', 'budget_account', 'start_date', 'end_date', 'weeks', 'created_at')
    list_filter = ('start_date', 'end_date', 'created_at')
    search_fields = ('name', 'budget_account__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
