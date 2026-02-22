from django.conf import settings
from django.db import models


class Role(models.TextChoices):
    """User roles for workspace access control."""

    OWNER = 'owner', 'Owner'
    ADMIN = 'admin', 'Admin'
    MEMBER = 'member', 'Member'
    VIEWER = 'viewer', 'Viewer'


# Role hierarchy for permission comparisons (higher = more privileged)
ROLE_HIERARCHY = {Role.OWNER: 4, Role.ADMIN: 3, Role.MEMBER: 2, Role.VIEWER: 1}

# Commonly used role groups
WRITE_ROLES = [Role.OWNER, Role.ADMIN, Role.MEMBER]
ADMIN_ROLES = [Role.OWNER, Role.ADMIN]


class Currency(models.Model):
    """Currency model for multi-currency support."""

    name = models.CharField(max_length=50, unique=True)
    symbol = models.CharField(max_length=3, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'currencies'
        verbose_name_plural = 'currencies'
        ordering = ['symbol']

    def __str__(self):
        return f'{self.symbol} ({self.name})'


class Workspace(models.Model):
    """Workspace model for multi-tenant functionality."""

    name = models.CharField(max_length=100)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='owned_workspaces'
    )
    currencies = models.ManyToManyField(Currency, through='WorkspaceCurrency', related_name='workspaces', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'workspaces'

    def __str__(self):
        return self.name


class WorkspaceCurrency(models.Model):
    """Through model for Workspace-Currency M2M relationship."""

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='workspace_currencies')
    currency = models.ForeignKey(Currency, on_delete=models.CASCADE, related_name='workspace_currencies')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'workspace_currencies'
        unique_together = [['workspace', 'currency']]

    def __str__(self):
        return f'{self.workspace.name} - {self.currency.symbol}'


class WorkspaceMember(models.Model):
    """Workspace member model for role-based access control."""

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='workspace_memberships')
    role = models.CharField(max_length=20, choices=Role.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'workspace_members'
        unique_together = [['workspace', 'user']]

    def __str__(self):
        return f'{self.user.email} - {self.workspace.name} ({self.role})'
