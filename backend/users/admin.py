"""Django admin configuration for users app."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from users.models import User, UserConsent


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin interface for custom User model."""

    list_display = ('email', 'full_name', 'current_workspace', 'is_active', 'is_staff', 'created_at')
    list_filter = ('is_active', 'is_staff', 'is_superuser', 'created_at')
    search_fields = ('email', 'full_name')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('full_name',)}),
        ('Workspace', {'fields': ('current_workspace',)}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'created_at', 'updated_at')}),
    )

    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('email', 'full_name', 'password1', 'password2'),
            },
        ),
    )

    ordering = ('email',)


@admin.register(UserConsent)
class UserConsentAdmin(admin.ModelAdmin):
    """Admin interface for UserConsent records."""

    list_display = ('user', 'consent_type', 'version', 'granted_at', 'withdrawn_at', 'ip_address')
    list_filter = ('consent_type', 'version')
    search_fields = ('user__email',)
    readonly_fields = ('user', 'consent_type', 'version', 'granted_at', 'ip_address')
    date_hierarchy = 'granted_at'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
