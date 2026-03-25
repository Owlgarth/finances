from django.conf import settings
from django.db import models

from common.models import WorkspaceScopedModel


class BudgetAccount(WorkspaceScopedModel):
    """Budget account model for organizing budgets within workspaces."""

    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='budget_accounts')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_budget_accounts',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_budget_accounts',
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    default_currency = models.ForeignKey(
        'workspaces.Currency', on_delete=models.PROTECT, related_name='budget_accounts'
    )
    color = models.CharField(max_length=7, blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)

    class Meta:
        db_table = 'budget_accounts'
        unique_together = [['workspace', 'name']]

    def __str__(self):
        return f'{self.workspace.name} - {self.name}'
