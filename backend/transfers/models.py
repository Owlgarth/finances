"""Transfer model — money movement between two accounts of a workspace."""

from django.db import models
from django.db.models import F, Q

from common.models import WorkspaceScopedModel


class Transfer(WorkspaceScopedModel):
    """A transfer between two accounts. Never income or expense.

    Same currency: both amounts equal. Different currencies: both amounts
    explicit; the exchange rate is implied (to_amount / from_amount) and
    never stored.
    """

    from_account = models.ForeignKey('accounts.Account', on_delete=models.PROTECT, related_name='transfers_out')
    to_account = models.ForeignKey('accounts.Account', on_delete=models.PROTECT, related_name='transfers_in')
    from_amount = models.DecimalField(max_digits=15, decimal_places=2)
    to_amount = models.DecimalField(max_digits=15, decimal_places=2)
    date = models.DateField()
    description = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'transfers'
        indexes = [
            models.Index(fields=['from_account', 'date']),
            models.Index(fields=['to_account', 'date']),
            models.Index(fields=['workspace', 'date']),
        ]
        constraints = [
            models.CheckConstraint(condition=~Q(from_account=F('to_account')), name='transfer_accounts_differ'),
        ]

    def __str__(self):
        return f'{self.date}: {self.from_account.name} → {self.to_account.name} ({self.from_amount})'
