from django.contrib import admin

from exchange_shortcuts.models import ExchangeShortcut


@admin.register(ExchangeShortcut)
class ExchangeShortcutAdmin(admin.ModelAdmin):
    list_display = ('id', 'workspace', 'from_currency', 'to_currency', 'created_at')
