from django.conf import settings
from django.db import models


class Budget(models.Model):
    """Budget model for allocating amounts to categories within periods."""

    budget_period = models.ForeignKey('budget_periods.BudgetPeriod', on_delete=models.CASCADE, related_name='budgets')
    category = models.ForeignKey('categories.Category', on_delete=models.CASCADE, related_name='budgets')
    currency = models.CharField(max_length=3)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_budgets'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_budgets'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'budgets'
        unique_together = [['budget_period', 'category', 'currency']]

    def __str__(self):
        return f'{self.category.name} - {self.amount} {self.currency}'
