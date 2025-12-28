from django.conf import settings
from django.db import models


class CurrencyExchange(models.Model):
    """Currency exchange model for multi-currency transactions."""

    budget_period = models.ForeignKey(
        'budget_periods.BudgetPeriod',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='currency_exchanges',
    )
    date = models.DateField()
    description = models.TextField(blank=True, null=True)
    from_currency = models.CharField(max_length=3)
    from_amount = models.DecimalField(max_digits=15, decimal_places=2)
    to_currency = models.CharField(max_length=3)
    to_amount = models.DecimalField(max_digits=15, decimal_places=2)
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, blank=True, null=True)
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'currency_exchanges'

    def __str__(self):
        return f'{self.date} - {self.from_amount} {self.from_currency} → {self.to_amount} {self.to_currency}'
