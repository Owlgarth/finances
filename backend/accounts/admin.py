from django.contrib import admin

from accounts.models import Account


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ('name', 'workspace', 'type', 'currency', 'opening_balance', 'is_archived')
    list_filter = ('type', 'is_archived')
    search_fields = ('name', 'workspace__name')
