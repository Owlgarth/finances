"""Global ISO 4217 currency catalog and per-workspace enablement."""

from django.db import models
from django.db.models import Q


class Currency(models.Model):
    """A currency in the global catalog, or a workspace-owned custom currency.

    Global rows (workspace=NULL, is_custom=False) come from the ISO 4217 seed.
    Custom rows (workspace set, is_custom=True) are visible only to their workspace.
    """

    code = models.CharField(max_length=8)
    name = models.CharField(max_length=64)
    symbol = models.CharField(max_length=8)
    decimals = models.PositiveSmallIntegerField(default=2)
    is_custom = models.BooleanField(default=False)
    workspace = models.ForeignKey(
        'workspaces.Workspace',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='custom_currencies',
    )

    class Meta:
        # The legacy workspaces.Currency model owns the 'currencies' table until B8.
        db_table = 'currencies_catalog'
        verbose_name_plural = 'currencies'
        ordering = ['code']
        constraints = [
            models.UniqueConstraint(
                fields=['code'],
                condition=Q(workspace__isnull=True),
                name='uniq_global_currency_code',
            ),
            models.UniqueConstraint(
                fields=['workspace', 'code'],
                condition=Q(workspace__isnull=False),
                name='uniq_custom_currency_per_workspace',
            ),
            models.CheckConstraint(
                condition=(Q(is_custom=True, workspace__isnull=False) | Q(is_custom=False, workspace__isnull=True)),
                name='custom_currency_has_workspace',
            ),
        ]

    def __str__(self):
        return f'{self.code} ({self.name})'


class WorkspaceCurrency(models.Model):
    """Enablement of a catalog currency for a workspace."""

    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='enabled_currencies')
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name='enablements')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'workspace_currencies'
        verbose_name_plural = 'workspace currencies'
        unique_together = [['workspace', 'currency']]

    def __str__(self):
        return f'{self.workspace_id}: {self.currency.code}'
