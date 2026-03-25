from datetime import date

from django.conf import settings
from django.db import models

from common.models import WorkspaceScopedModel
from common.querysets import WorkspaceScopedQuerySet


class BudgetPeriodQuerySet(WorkspaceScopedQuerySet):
    def containing(self, target_date: date):
        return self.filter(start_date__lte=target_date, end_date__gte=target_date)


class BudgetPeriod(WorkspaceScopedModel):
    """Budget period model for time-based budget tracking."""

    objects = BudgetPeriodQuerySet.as_manager()

    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='budget_periods',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_budget_periods',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_budget_periods',
    )
    budget_account = models.ForeignKey(
        'budget_accounts.BudgetAccount', on_delete=models.CASCADE, related_name='budget_periods'
    )
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    weeks = models.IntegerField(blank=True, null=True)

    class Meta:
        db_table = 'budget_periods'

    def __str__(self):
        return f'{self.budget_account.name} - {self.name}'
