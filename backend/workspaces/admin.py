"""Django admin configuration for workspaces app."""

from django.contrib import admin

from workspaces.models import Currency, Workspace, WorkspaceCurrency, WorkspaceMember


@admin.register(Currency)
class CurrencyAdmin(admin.ModelAdmin):
    """Admin interface for Currency model."""

    list_display = ('symbol', 'name', 'created_at', 'updated_at')
    list_filter = ('created_at', 'updated_at')
    search_fields = ('symbol', 'name')
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


@admin.register(WorkspaceCurrency)
class WorkspaceCurrencyAdmin(admin.ModelAdmin):
    """Admin interface for WorkspaceCurrency model."""

    list_display = ('workspace', 'currency', 'created_at')
    list_filter = ('created_at', 'currency')
    search_fields = ('workspace__name', 'currency__symbol')
    readonly_fields = ('created_at',)
    date_hierarchy = 'created_at'


@admin.register(WorkspaceMember)
class WorkspaceMemberAdmin(admin.ModelAdmin):
    """Admin interface for WorkspaceMember model."""

    list_display = ('user', 'workspace', 'role', 'created_at', 'updated_at')
    list_filter = ('role', 'created_at', 'updated_at')
    search_fields = ('user__email', 'workspace__name', 'role')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
