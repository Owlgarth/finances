"""Django admin configuration for workspaces app."""

from django.contrib import admin

from workspaces.models import Currency, Workspace, WorkspaceMember


@admin.register(Currency)
class CurrencyAdmin(admin.ModelAdmin):
    """Admin interface for Currency model."""

    list_display = ('symbol', 'name', 'workspace', 'created_at', 'updated_at')
    list_filter = ('workspace', 'created_at', 'updated_at')
    search_fields = ('symbol', 'name', 'workspace__name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    """Admin interface for Workspace model."""

    list_display = ('name', 'owner', 'created_at', 'updated_at')
    list_filter = ('created_at', 'updated_at')
    search_fields = ('name', 'owner__email')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'


@admin.register(WorkspaceMember)
class WorkspaceMemberAdmin(admin.ModelAdmin):
    """Admin interface for WorkspaceMember model."""

    list_display = ('user', 'workspace', 'role', 'created_at', 'updated_at')
    list_filter = ('role', 'created_at', 'updated_at')
    search_fields = ('user__email', 'workspace__name', 'role')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
