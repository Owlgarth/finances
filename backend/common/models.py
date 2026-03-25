from django.conf import settings
from django.db import models

from common.querysets import WorkspaceScopedQuerySet


class WorkspaceScopedModel(models.Model):
    """
    Abstract base model for all workspace-scoped entities.

    Provides:
    - Direct workspace FK for efficient filtering
    - Common audit fields (created_by, updated_by, created_at, updated_at)
    - Default manager with for_workspace() method
    - Validation to prevent workspace_id changes
    """

    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='%(class)s_set',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_%(class)s_set',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_%(class)s_set',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    objects = WorkspaceScopedQuerySet.as_manager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.workspace_id:
            raise ValueError(f'{self.__class__.__name__}.workspace_id must be set before save')

        update_fields = kwargs.get('update_fields')
        if self.pk and (update_fields is None or 'workspace' in update_fields or 'workspace_id' in update_fields):
            current = self.__class__.objects.filter(pk=self.pk).values_list('workspace_id', flat=True).first()
            if current and current != self.workspace_id:
                raise ValueError(f'{self.__class__.__name__}.workspace_id cannot be changed after creation')

        super().save(*args, **kwargs)
