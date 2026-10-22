import calendar
from datetime import date, timedelta

from django.conf import settings
from django.db import models
from django.db.models import F, Q, UniqueConstraint

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
    recurring = models.ForeignKey(
        'RecurringTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='planned_transactions',
    )

    class Meta:
        db_table = 'planned_transactions'
        constraints = [
            # Partial: rows with recurring=NULL (ordinary one-shot plans) are
            # unconstrained; a linked row may exist at most once per rule+date.
            UniqueConstraint(
                fields=['recurring', 'planned_date'],
                condition=Q(recurring__isnull=False),
                name='uniq_planned_per_recurring_date',
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

    def __str__(self):
        return f'{self.name} - {self.amount} ({self.status})'


class RecurringIntervalKind(models.TextChoices):
    DAILY = 'daily', 'Daily'
    WEEKLY = 'weekly', 'Weekly'
    MONTHLY = 'monthly', 'Monthly'


class RecurringTransaction(WorkspaceScopedModel):
    """Recurring payment rule that materializes into PlannedTransaction rows.

    Standalone schedule grammar (no budget-cadence linkage): interval_kind x
    interval_count anchored at start_date, optional end_date, per-rule lead
    window (occurrence D materializes when today >= D - lead_days), and an
    is_active pause flag. The day-of-month for monthly rules is derived from
    start_date.day and clamped in short months (Jan 31 -> Feb 28/29 -> Mar
    31). Materialized rows link back via PlannedTransaction.recurring;
    last_generated_date is the occurrence pointer guaranteeing an occurrence
    never generates twice; the schedule itself is derived by
    next_occurrence_on_or_after (pure date math on the model).
    """

    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='recurring_transactions',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_recurring_transactions',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_recurring_transactions',
    )

    account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='recurring_transactions',
        null=True,
        blank=True,
    )
    currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT, related_name='recurring_transactions')
    category = models.ForeignKey(
        'categories.Category', on_delete=models.SET_NULL, null=True, blank=True, related_name='recurring_transactions'
    )
    name = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    interval_kind = models.CharField(
        max_length=10, choices=RecurringIntervalKind.choices, default=RecurringIntervalKind.MONTHLY
    )
    interval_count = models.PositiveSmallIntegerField(default=1)
    start_date = models.DateField()
    lead_days = models.PositiveSmallIntegerField(default=4)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_generated_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'recurring_transactions'
        constraints = [
            models.CheckConstraint(condition=Q(interval_count__gte=1), name='recurring_interval_count_gte_1'),
            models.CheckConstraint(condition=Q(lead_days__gte=0, lead_days__lte=31), name='recurring_lead_days_range'),
            models.CheckConstraint(
                condition=Q(end_date__isnull=True) | Q(end_date__gte=F('start_date')),
                name='recurring_end_gte_start',
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
    def next_occurrence_date(self) -> date | None:
        """Next unmaterialized occurrence, or None when paused, ended, or exhausted.

        The candidate is the first occurrence strictly after the
        last_generated_date pointer once anything has been generated, else
        the grammar's first occurrence on/after start_date - the same
        derivation the generator starts its catch-up loop from. Paused
        rules report None (a paused rule has no upcoming occurrence).
        """
        if not self.is_active:
            return None
        if self.last_generated_date is not None:
            candidate = self.next_occurrence_on_or_after(self.last_generated_date + timedelta(days=1))
        else:
            candidate = self.next_occurrence_on_or_after(self.start_date)
        if self.end_date is not None and candidate > self.end_date:
            return None
        return candidate

    def _step(self, occurrence: date) -> date:
        """Return the occurrence strictly after `occurrence` (pure date math).

        Monthly = month-stepping with the day-of-month taken from
        start_date.day (NOT the previous occurrence's day, which would drag
        31 down to 28 permanently) and clamped to the target month's length.
        """
        if self.interval_kind == RecurringIntervalKind.DAILY:
            return occurrence + timedelta(days=self.interval_count)
        if self.interval_kind == RecurringIntervalKind.WEEKLY:
            return occurrence + timedelta(weeks=self.interval_count)
        day = self.start_date.day
        total = occurrence.year * 12 + (occurrence.month - 1) + self.interval_count
        year, month = divmod(total, 12)
        month += 1
        return date(year, month, min(day, calendar.monthrange(year, month)[1]))

    def next_occurrence_on_or_after(self, target: date) -> date:
        """First occurrence on or after `target` (pure math, no DB access).

        interval_count >= 1 is enforced by the check constraint, so every
        step strictly advances and the loop terminates. end_date/is_active
        filtering is the materialization engine's concern (Task 3), not this
        method's.
        """
        occurrence = self.start_date
        while occurrence < target:
            occurrence = self._step(occurrence)
        return occurrence

    def __str__(self):
        return f'{self.name} - every {self.interval_count} {self.interval_kind}(s) from {self.start_date}'


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
