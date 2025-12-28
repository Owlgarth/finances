from django.conf import settings
from django.db import models


class PlannedTransaction(models.Model):
    """Planned transaction model for future transactions."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled'),
    ]

    budget_period = models.ForeignKey(
        'budget_periods.BudgetPeriod',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='planned_transactions',
    )
    name = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.CharField(max_length=3)
    category = models.ForeignKey(
        'categories.Category', on_delete=models.SET_NULL, null=True, blank=True, related_name='planned_transactions'
    )
    planned_date = models.DateField()
    payment_date = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    transaction = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='planned_transactions',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_planned_transactions',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_planned_transactions',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'planned_transactions'

    def __str__(self):
        return f'{self.name} - {self.amount} {self.currency} ({self.status})'
