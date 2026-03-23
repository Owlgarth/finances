from django.conf import settings
from django.db import models

from common.querysets import WorkspaceScopedQuerySet


class Category(models.Model):
    """Category model for organizing transactions within budget periods."""

    WORKSPACE_FILTER = 'budget_period__budget_account__workspace_id'
    objects = WorkspaceScopedQuerySet.as_manager()

    budget_period = models.ForeignKey(
        'budget_periods.BudgetPeriod', on_delete=models.CASCADE, related_name='categories'
    )
    name = models.CharField(max_length=100)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_categories'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_categories'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'categories'
        unique_together = [['budget_period', 'name']]
        verbose_name_plural = 'Categories'

    def __str__(self):
        return f'{self.budget_period.name} - {self.name}'
