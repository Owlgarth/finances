"""Django admin configuration for workspaces app."""

from django.contrib import admin

from workspaces.models import Workspace, WorkspaceMember


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
