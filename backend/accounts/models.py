"""Account model — the money-holding entity of a workspace."""

from django.db import models
from django.db.models import Q, UniqueConstraint

from common.models import WorkspaceScopedModel


class AccountType(models.TextChoices):
    CASH = 'cash', 'Cash'
    BANK = 'bank', 'Bank'
    OTHER = 'other', 'Other'


class Account(WorkspaceScopedModel):
    """A workspace-scoped account holding money in a single currency.

    Balance is always computed (opening_balance + records), never stored.
    Accounts with history are archived, never deleted.
    """

    name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=AccountType.choices, default=AccountType.BANK)
    currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT, related_name='accounts')
    opening_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    is_archived = models.BooleanField(default=False)
    is_default_for_currency = models.BooleanField(default=False)
    display_order = models.IntegerField(default=0)

    class Meta:
        db_table = 'accounts'
        unique_together = [['workspace', 'name']]
        ordering = ['display_order', 'name']
        constraints = [
            UniqueConstraint(
                condition=Q(is_default_for_currency=True),
                fields=['workspace', 'currency'],
                name='one_default_account_per_currency',
            ),
        ]

    def __str__(self):
        return self.name
