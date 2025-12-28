"""Django admin configuration for categories app."""

from django.contrib import admin

from categories.models import Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    """Admin interface for Category model."""

    list_display = ('name', 'budget_period', 'created_at', 'updated_at')
    list_filter = ('budget_period', 'created_at')
    search_fields = ('name', 'budget_period__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
