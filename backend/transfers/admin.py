from django.contrib import admin

from transfers.models import Transfer


@admin.register(Transfer)
class TransferAdmin(admin.ModelAdmin):
    list_display = ('date', 'from_account', 'from_amount', 'to_account', 'to_amount')
    list_filter = ('date',)
    search_fields = ('description', 'from_account__name', 'to_account__name')
