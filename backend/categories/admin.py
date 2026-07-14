"""Django admin configuration for categories app."""

from django.contrib import admin

from categories.models import Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    """Admin interface for Category model."""

    list_display = ('name', 'budget', 'is_archived', 'created_at', 'updated_at')
    list_filter = ('is_archived', 'created_at')
    search_fields = ('name', 'budget__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
