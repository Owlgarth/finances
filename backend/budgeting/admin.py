from django.contrib import admin

from budgeting.models import Budget, Period


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ('name', 'workspace', 'cadence', 'is_active')
    list_filter = ('cadence', 'is_active')
    search_fields = ('name', 'workspace__name')


@admin.register(Period)
class PeriodAdmin(admin.ModelAdmin):
    list_display = ('name', 'budget', 'start_date', 'end_date', 'is_custom')
    list_filter = ('is_custom',)
    search_fields = ('name', 'budget__name')
