from django.conf import settings
from django.db import models

from common.models import WorkspaceScopedModel


class PlannedTransaction(WorkspaceScopedModel):
    """Planned transaction model for future transactions."""

    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
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

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled'),
    ]

    account = models.ForeignKey('accounts.Account', on_delete=models.PROTECT, related_name='planned_transactions')
    name = models.CharField(max_length=200)
    # The planned amount is in the account's currency, like transactions.
    amount = models.DecimalField(max_digits=15, decimal_places=2)
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

    class Meta:
        db_table = 'planned_transactions'

    @property
    def account_name(self) -> str:
        return self.account.name

    @property
    def currency_code(self) -> str:
        return self.account.currency.code

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None

    def __str__(self):
        return f'{self.name} - {self.amount} ({self.status})'
