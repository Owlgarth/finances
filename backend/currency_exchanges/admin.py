"""Django admin configuration for currency_exchanges app."""

from django.contrib import admin

from currency_exchanges.models import CurrencyExchange


@admin.register(CurrencyExchange)
class CurrencyExchangeAdmin(admin.ModelAdmin):
    """Admin interface for CurrencyExchange model."""

    list_display = ('date', 'from_currency', 'from_amount', 'to_currency', 'to_amount', 'created_at')
    list_filter = ('from_currency', 'to_currency', 'date', 'created_at')
    search_fields = ('description',)
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'date'
