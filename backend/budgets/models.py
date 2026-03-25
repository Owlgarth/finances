from django.conf import settings
from django.db import models

from common.models import WorkspaceScopedModel


class Budget(WorkspaceScopedModel):
    """Budget model for allocating amounts to categories within periods."""

    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='budgets',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_budgets',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_budgets',
    )
    budget_period = models.ForeignKey('budget_periods.BudgetPeriod', on_delete=models.CASCADE, related_name='budgets')
    category = models.ForeignKey('categories.Category', on_delete=models.CASCADE, related_name='budgets')
    currency = models.ForeignKey('workspaces.Currency', on_delete=models.PROTECT, related_name='budgets')
    amount = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        db_table = 'budgets'
        unique_together = [['budget_period', 'category', 'currency']]

    def __str__(self):
        return f'{self.category.name} - {self.amount} {self.currency.symbol}'
