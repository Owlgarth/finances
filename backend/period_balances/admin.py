"""Django admin configuration for period_balances app."""

from django.contrib import admin

from period_balances.models import PeriodBalance


@admin.register(PeriodBalance)
class PeriodBalanceAdmin(admin.ModelAdmin):
    """Admin interface for PeriodBalance model."""

    list_display = ('budget_period', 'currency', 'opening_balance', 'total_income', 'total_expenses', 'closing_balance')
    list_filter = ('currency', 'created_at')
    search_fields = ('budget_period__name',)
    readonly_fields = ('created_at', 'updated_at', 'last_calculated_at')
    date_hierarchy = 'created_at'
