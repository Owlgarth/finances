"""Budget and Period models — spending plans with per-budget cadence."""

from django.db import models
from django.db.models import F, Q

from common.models import WorkspaceScopedModel


class Cadence(models.TextChoices):
    MONTHLY = 'monthly', 'Monthly'
    WEEKS = 'weeks', 'Every N weeks'
    CUSTOM = 'custom', 'Custom periods'


class Budget(WorkspaceScopedModel):
    """A spending plan (successor of BudgetAccount). Plans money, never holds it."""

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    color = models.CharField(max_length=7, blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    cadence = models.CharField(max_length=10, choices=Cadence.choices, default=Cadence.MONTHLY)
    # cadence_weeks/cadence_anchor are required iff cadence == WEEKS, null otherwise.
    cadence_weeks = models.PositiveSmallIntegerField(null=True, blank=True)
    cadence_anchor = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'budgets'
        unique_together = [['workspace', 'name']]
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name

    @property
    def currency_codes(self) -> list[str]:
        """Codes of the budget's currency set, in stored position order."""
        return [bc.currency.code for bc in self.currencies.all()]


class BudgetCurrency(models.Model):
    """One entry in a budget's ordered currency set (first = default view).

    Plain Model, not WorkspaceScopedModel - matches the WorkspaceCurrency
    precedent: scoped transitively via the budget FK, no audit fields.
    """

    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='currencies')
    currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT, related_name='budget_currencies')
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'budget_currencies'
        verbose_name_plural = 'budget currencies'
        unique_together = [['budget', 'currency']]
        ordering = ['position', 'id']

    def __str__(self):
        return f'{self.budget.name}: {self.currency.code}'


class Period(WorkspaceScopedModel):
    """A time slice of a budget. Auto-created lazily per cadence; is_custom for manual ranges."""

    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='periods')
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    is_custom = models.BooleanField(default=False)

    class Meta:
        db_table = 'periods'
        constraints = [
            models.UniqueConstraint(fields=['budget', 'start_date'], name='uniq_period_start_per_budget'),
            models.CheckConstraint(condition=Q(end_date__gte=F('start_date')), name='period_end_gte_start'),
        ]
        ordering = ['-start_date']

    def __str__(self):
        return f'{self.budget.name} - {self.name}'


class CategoryBudget(WorkspaceScopedModel):
    """Planned amount for a category within a period, per currency."""

    period = models.ForeignKey(Period, on_delete=models.CASCADE, related_name='category_budgets')
    category = models.ForeignKey('categories.Category', on_delete=models.CASCADE, related_name='category_budgets')
    currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT, related_name='+')
    amount = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        db_table = 'category_budgets'
        unique_together = [['period', 'category', 'currency']]

    def __str__(self):
        return f'{self.category.name} - {self.amount} {self.currency.code}'
