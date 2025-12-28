from django.conf import settings
from django.db import models


class Transaction(models.Model):
    """Transaction model for tracking income and expenses."""

    TYPE_CHOICES = [
        ('income', 'Income'),
        ('expense', 'Expense'),
    ]

    budget_period = models.ForeignKey(
        'budget_periods.BudgetPeriod', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions'
    )
    date = models.DateField()
    description = models.TextField()
    category = models.ForeignKey(
        'categories.Category', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions'
    )
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.CharField(max_length=3)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_transactions'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_transactions'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'transactions'

    def __str__(self):
        return f'{self.date} - {self.description} ({self.amount} {self.currency})'
