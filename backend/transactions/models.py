from django.conf import settings
from django.db import models
from django.db.models import Q

from common.models import WorkspaceScopedModel


class Transaction(WorkspaceScopedModel):
    """A dated money movement, optionally on an account.

    `currency` is the money's actual currency - the stored truth. Whenever an
    account is set, the currency equals the account's currency (enforced on
    create/update); account-less rows carry their own currency so history can
    be recorded in a currency without dedicating an account to it (cash
    exchanged while traveling; a closed account's past).

    The original amount/currency facet records what was paid at the point of
    sale (converted card payments): informational only, excluded from every
    aggregate, and required to differ from the transaction's own currency.
    Period membership is derived from category budget + date, never stored.

    `note` is free-text user remarks - informational like `description`.
    Aggregates never read it (by disinterest, not by exclusion: nothing to
    do), and it is optional with no other invariant.
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

    account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='transactions',
    )
    currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT, related_name='transactions')
    date = models.DateField()
    description = models.TextField()
    # Free-text note, informational like description; aggregates never read it.
    note = models.TextField(null=True, blank=True)
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
            models.Index(fields=['currency', 'date']),
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
    def account_name(self) -> str | None:
        return self.account.name if self.account else None

    @property
    def currency_code(self) -> str:
        return self.currency.code

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None

    @property
    def category_budget_id(self) -> int | None:
        return self.category.budget_id if self.category else None

    @property
    def original_currency_code(self) -> str | None:
        return self.original_currency.code if self.original_currency else None

    def __str__(self):
        return f'{self.date} - {self.description} ({self.amount} {self.currency.code})'


class TransactionAttachment(models.Model):
    """A receipt image/PDF stored in the private media bucket.

    The row holds only metadata; bytes live in S3 under `file_key`. Access is
    always via short-lived presigned URLs — the bucket has no public policy.
    Deleting the storage object is the caller's job (services do it) because
    Django cascades don't reach S3.
    """

    EXTRACTION_NONE = 'none'
    EXTRACTION_PENDING = 'pending'
    EXTRACTION_DONE = 'done'
    EXTRACTION_FAILED = 'failed'
    EXTRACTION_CHOICES = [
        (EXTRACTION_NONE, 'None'),
        (EXTRACTION_PENDING, 'Pending'),
        (EXTRACTION_DONE, 'Done'),
        (EXTRACTION_FAILED, 'Failed'),
    ]

    transaction = models.ForeignKey(Transaction, on_delete=models.CASCADE, related_name='attachments')
    file_key = models.CharField(max_length=500, unique=True)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # Receipt extraction. Result holds the parser's contract JSON; a review
    # screen turns it into line items on user confirmation. Failures are retryable.
    extraction_status = models.CharField(max_length=20, choices=EXTRACTION_CHOICES, default=EXTRACTION_NONE)
    extraction_result = models.JSONField(null=True, blank=True)
    extraction_error = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'transaction_attachments'
        ordering = ['created_at', 'id']

    def __str__(self):
        return self.filename


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


class TransactionIdempotencyKey(models.Model):
    """Transient dedup record mapping (key, user, workspace) → transaction for POST /transactions.

    Purpose: survive network-blip double-clicks. When the frontend sends an
    `Idempotency-Key` header, the service looks up (key, user, workspace)
    within a 24h window; on a hit it returns the stored transaction instead of
    creating a second one. The record is NOT user data — it MUST NOT appear in
    GDPR export or import. It CASCADE-deletes with the user and the workspace;
    the transaction link is SET_NULL so a deleted transaction's record can still
    serve replays of its own original response until the 24h TTL expires.

    The unique constraint is (key, user_id, workspace_id): two distinct users
    OR workspaces may use the same key without colliding. created_at is indexed
    for TTL lookups.
    """

    key = models.CharField(max_length=100)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='transaction_idempotency_keys',
    )
    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='transaction_idempotency_keys',
    )
    transaction = models.ForeignKey(
        'Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='idempotency_keys',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'transaction_idempotency_keys'
        indexes = [models.Index(fields=['created_at'])]
        constraints = [
            models.UniqueConstraint(fields=['key', 'user', 'workspace'], name='unique_key_per_user_workspace'),
        ]

    def __str__(self):
        return f'{self.key} → tx:{self.transaction_id}'
