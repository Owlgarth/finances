from django.conf import settings
from django.db import models
from django.db.models import Q

from common.models import WorkspaceScopedModel


class Transaction(WorkspaceScopedModel):
    """A dated money movement on an account.

    The transaction's currency IS the account's currency — never stored
    separately. Period membership is derived from category→budget + date,
    never stored. The original amount/currency facet is informational only
    (converted card payments) and excluded from every aggregate.
    """

    TYPE_CHOICES = [
        ('income', 'Income'),
        ('expense', 'Expense'),
        ('adjustment', 'Adjustment'),
    ]

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

    account = models.ForeignKey('accounts.Account', on_delete=models.PROTECT, related_name='transactions')
    date = models.DateField()
    description = models.TextField()
    category = models.ForeignKey(
        'categories.Category', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions'
    )
    # income/expense: amount > 0; adjustment: signed delta != 0.
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    original_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    original_currency = models.ForeignKey(
        'currencies.Currency', on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )

    class Meta:
        db_table = 'transactions'
        indexes = [
            models.Index(fields=['account', 'date']),
            models.Index(fields=['workspace', 'date']),
            models.Index(fields=['category', 'date']),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(original_amount__isnull=True, original_currency__isnull=True)
                    | Q(original_amount__isnull=False, original_currency__isnull=False)
                ),
                name='original_facet_both_or_neither',
            ),
        ]

    @property
    def account_name(self) -> str:
        return self.account.name

    @property
    def currency_code(self) -> str:
        return self.account.currency.code

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None

    @property
    def original_currency_code(self) -> str | None:
        return self.original_currency.code if self.original_currency else None

    def __str__(self):
        return f'{self.date} - {self.description} ({self.amount} {self.account.currency.code})'


class TransactionItem(models.Model):
    """An ordered receipt line item attached to a transaction.

    Items are informational only — the transaction's `amount` stays the
    source of truth. Aggregates never read items; the API returns their sum
    so the UI can hint at mismatches without blocking anything.
    """

    transaction = models.ForeignKey(Transaction, on_delete=models.CASCADE, related_name='items')
    position = models.PositiveIntegerField()
    name = models.CharField(max_length=300)
    # 3 decimal places: weighed goods print quantities like 0.782 kg.
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    line_total = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = 'transaction_items'
        ordering = ['position', 'id']
        indexes = [models.Index(fields=['transaction', 'position'])]

    def __str__(self):
        return f'{self.name} x{self.quantity}'
