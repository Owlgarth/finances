from django.conf import settings
from django.db import models


class BudgetAccount(models.Model):
    """Budget account model for organizing budgets within workspaces."""

    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='budget_accounts')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    default_currency = models.CharField(max_length=3, default='PLN')
    color = models.CharField(max_length=7, blank=True, null=True)  # Hex color like #3B82F6
    icon = models.CharField(max_length=50, blank=True, null=True)  # Icon identifier
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'budget_accounts'
        unique_together = [['workspace', 'name']]

    def __str__(self):
        return f'{self.workspace.name} - {self.name}'
