from django.db import models
from django.db.models.functions import Lower

from common.models import WorkspaceScopedModel


class Category(WorkspaceScopedModel):
    """A persistent, budget-scoped category for organizing transactions.

    Categories survive across periods; retiring one is an archive, not a delete.
    """

    budget = models.ForeignKey('budgeting.Budget', on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=100)
    is_archived = models.BooleanField(default=False)

    class Meta:
        db_table = 'categories'
        constraints = [
            models.UniqueConstraint(Lower('name'), 'budget', name='uniq_category_name_per_budget_ci'),
        ]
        ordering = ['name']
        verbose_name_plural = 'Categories'

    def __str__(self):
        return f'{self.budget.name} - {self.name}'
