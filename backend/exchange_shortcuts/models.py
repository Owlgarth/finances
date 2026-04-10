from django.conf import settings
from django.db import models

from common.models import WorkspaceScopedModel


class ExchangeShortcut(WorkspaceScopedModel):
    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='exchange_shortcuts',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_exchange_shortcuts',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_exchange_shortcuts',
    )
    from_currency = models.CharField(max_length=3)
    to_currency = models.CharField(max_length=3)

    class Meta:
        db_table = 'exchange_shortcuts'

    def __str__(self):
        return f'{self.from_currency} → {self.to_currency}'
