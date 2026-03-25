from django.conf import settings
from django.db import models

from common.models import WorkspaceScopedModel


class CurrencyExchange(WorkspaceScopedModel):
    """Currency exchange model for multi-currency transactions."""

    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='currency_exchanges',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_currency_exchanges',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_currency_exchanges',
    )

    budget_period = models.ForeignKey(
        'budget_periods.BudgetPeriod',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='currency_exchanges',
    )
    date = models.DateField()
    description = models.TextField(blank=True, null=True)
    from_currency = models.ForeignKey('workspaces.Currency', on_delete=models.PROTECT, related_name='exchanges_from')
    from_amount = models.DecimalField(max_digits=15, decimal_places=2)
    to_currency = models.ForeignKey('workspaces.Currency', on_delete=models.PROTECT, related_name='exchanges_to')
    to_amount = models.DecimalField(max_digits=15, decimal_places=2)
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, blank=True, null=True)

    class Meta:
        db_table = 'currency_exchanges'

    def __str__(self):
        return (
            f'{self.date} - {self.from_amount} {self.from_currency.symbol} → {self.to_amount} {self.to_currency.symbol}'
        )
