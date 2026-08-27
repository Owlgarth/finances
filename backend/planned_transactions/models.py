from django.conf import settings
from django.db import models

from common.models import WorkspaceScopedModel


class PlannedTransaction(WorkspaceScopedModel):
    """Planned transaction model for future transactions.

    The planned amount books in the plan's own stored `currency`. When an
    account is set, the currency always equals the account's currency
    (enforced on create/update); an account-less plan carries any currency
    enabled for the workspace.
    """

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

    account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='planned_transactions',
        null=True,
        blank=True,
    )
    currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT, related_name='planned_transactions')
    name = models.CharField(max_length=200)
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
    def account_name(self) -> str | None:
        return self.account.name if self.account else None

    @property
    def currency_code(self) -> str:
        return self.currency.code

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None

    def __str__(self):
        return f'{self.name} - {self.amount} ({self.status})'


class PlannedTransactionIdempotencyKey(models.Model):
    """Transient dedup record mapping (key, user, workspace) → planned transaction
    for POST /planned-transactions. Field-for-field mirror of
    TransactionIdempotencyKey (transactions app) — see that model's docstring for
    the full rationale (24h TTL, SET_NULL target link, CASCADE user/workspace,
    never in GDPR export/import). The dedup flow itself is shared:
    common.idempotency.create_with_idempotency.
    """

    key = models.CharField(max_length=100)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='planned_transaction_idempotency_keys',
    )
    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='planned_transaction_idempotency_keys',
    )
    planned_transaction = models.ForeignKey(
        'PlannedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='idempotency_keys',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'planned_transaction_idempotency_keys'
        indexes = [models.Index(fields=['created_at'])]
        constraints = [
            models.UniqueConstraint(fields=['key', 'user', 'workspace'], name='unique_planned_key_per_user_workspace'),
        ]

    def __str__(self):
        return f'{self.key} → planned:{self.planned_transaction_id}'
