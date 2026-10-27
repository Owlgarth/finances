from django.conf import settings
from django.db import models
from django.db.models import Q

from common.models import WorkspaceScopedModel


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
OWNER_ROLES = [Role.OWNER]


class Workspace(models.Model):
    """Workspace model for multi-tenant functionality."""

    name = models.CharField(max_length=100)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='owned_workspaces'
    )
    # Preselected in record forms when the workspace has more than one budget.
    default_budget = models.ForeignKey(
        'budgeting.Budget', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'workspaces'

    def __str__(self):
        return self.name


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


class UserWorkspaceSettings(WorkspaceScopedModel):
    """One user's stored view settings inside one workspace.

    Personal per workspace, like bookmarks: rows carry user + workspace,
    and a member sees and manages only their own row - isolation is the
    (user, workspace) pair, never a role gate (every role, viewer through
    owner, manages its own settings row).

    settings is an opaque, versioned JSON blob (per-page view
    preferences); the blob's shape is owned by the service layer's
    Pydantic schema, which validates it on every write - the model
    stores it verbatim, with no DB-level shape constraints (JSONField
    equality against a shape is not cleanly expressible in a check
    constraint). version is the blob's storage-format marker for future
    shape changes, constrained to >= 1.
    """

    # user is declared before the settings field on purpose: this class
    # body evaluates settings.AUTH_USER_MODEL (the django.conf import)
    # when declaring the FK below, and a field named `settings` assigned
    # first would shadow it (AttributeError on the JSONField instance).
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='workspace_settings',
    )
    settings = models.JSONField(default=dict, blank=True)
    version = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = 'user_workspace_settings'
        constraints = [
            models.UniqueConstraint(fields=['user', 'workspace'], name='unique_usersettings_per_user_workspace'),
            models.CheckConstraint(condition=Q(version__gte=1), name='usersettings_version_gte_1'),
        ]

    def __str__(self):
        return f'{self.user.email} - {self.workspace.name}'
