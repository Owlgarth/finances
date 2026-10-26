"""Django admin configuration for bookmarks app."""

from django.contrib import admin

from bookmarks.models import Bookmark


@admin.register(Bookmark)
class BookmarkAdmin(admin.ModelAdmin):
    """Admin interface for Bookmark model."""

    list_display = ('name', 'user', 'workspace', 'kind', 'position', 'is_active', 'is_archived', 'created_at')
    list_filter = ('kind', 'is_active', 'is_archived')
    search_fields = ('name', 'user__email', 'workspace__name')
    readonly_fields = ('created_at', 'updated_at')
