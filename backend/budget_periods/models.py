from django.conf import settings
from django.db import models


class BudgetPeriod(models.Model):
    """Budget period model for time-based budget tracking."""

    budget_account = models.ForeignKey(
        'budget_accounts.BudgetAccount', on_delete=models.CASCADE, related_name='budget_periods'
    )
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    weeks = models.IntegerField(blank=True, null=True)
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'budget_periods'

    def __str__(self):
        return f'{self.budget_account.name} - {self.name}'
