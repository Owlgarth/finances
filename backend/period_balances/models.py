from django.conf import settings
from django.db import models


class PeriodBalance(models.Model):
    """Period balance model for tracking balances within budget periods."""

    budget_period = models.ForeignKey(
        'budget_periods.BudgetPeriod', on_delete=models.CASCADE, related_name='period_balances'
    )
    currency = models.CharField(max_length=3)
    opening_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_income = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_expenses = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    exchanges_in = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    exchanges_out = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    closing_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    last_calculated_at = models.DateTimeField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_period_balances',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_period_balances',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'period_balances'
        unique_together = [['budget_period', 'currency']]

    def __str__(self):
        return f'{self.budget_period.name} - {self.currency}: {self.closing_balance}'
