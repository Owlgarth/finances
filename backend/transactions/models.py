from django.conf import settings
from django.db import models

from common.models import WorkspaceScopedModel


class Transaction(WorkspaceScopedModel):
    """Transaction model for tracking income and expenses."""

    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='transactions',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_transactions',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_transactions',
    )

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
    currency = models.ForeignKey('workspaces.Currency', on_delete=models.PROTECT, related_name='transactions')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)

    class Meta:
        db_table = 'transactions'

    def __str__(self):
        return f'{self.date} - {self.description} ({self.amount} {self.currency.symbol})'
