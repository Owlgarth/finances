from django.contrib import admin

from currencies.models import Currency, WorkspaceCurrency


@admin.register(Currency)
class CurrencyAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'symbol', 'decimals', 'is_custom', 'workspace')
    list_filter = ('is_custom',)
    search_fields = ('code', 'name')


@admin.register(WorkspaceCurrency)
class WorkspaceCurrencyAdmin(admin.ModelAdmin):
    list_display = ('workspace', 'currency', 'created_at')
    search_fields = ('currency__code', 'workspace__name')
