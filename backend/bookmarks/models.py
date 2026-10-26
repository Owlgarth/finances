"""Bookmark model - personal quick-access links, one user's rows per workspace."""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from common.models import WorkspaceScopedModel


class BookmarkKind(models.TextChoices):
    BUDGET = 'budget', 'Budget'
    TRANSACTIONS = 'transactions', 'Transactions'
    PLANNED = 'planned', 'Planned transactions'


class Bookmark(WorkspaceScopedModel):
    """A personal quick-access link saved by one user inside one workspace.

    Personal per workspace: rows carry user + workspace; a member sees and
    manages only their own bookmarks. Two independent toggles: is_active
    (sidebar / More-menu visibility; the row stays on the manage page) and
    is_archived (visible only in the manage page's Archived section).

    Target shape per kind:
    - budget: budget FK + currency_code set. Opens the budget page with that
      currency preselected; no period is captured (periods rot).
    - transactions / planned: budget FK and currency_code NULL; params holds
      the page's URL query params verbatim as a JSON object of single strings
      (CSV lists inside one value, as the pages write them). Empty params is
      a plain page link.

    position is sparse (never renumbered; stays at the column default 0 until
    the service assigns the next position on create) and ordering never
    assumes contiguity.

    params emptiness for kind=budget is enforced at the service layer, not
    the DB: JSONField equality against {} is not cleanly expressible in a
    check constraint, and non-empty params on a budget row is harmless
    (params is read only for filter kinds). The kind/budget/currency
    coherence IS a DB constraint - see Meta.constraints.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='bookmarks',
    )
    kind = models.CharField(max_length=12, choices=BookmarkKind.choices)
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=50, null=True, blank=True)
    # Swatch KEY ('neutral', 'blue', ...), never a hex value - the palette
    # lives in the frontend as theme-aware CSS variables (var(--bookmark-c-*));
    # the backend validates format only (pattern ^[a-z][a-z0-9-]*$, task 2).
    color = models.CharField(max_length=20, null=True, blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)
    budget = models.ForeignKey(
        'budgeting.Budget',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='bookmarks',
    )
    currency_code = models.CharField(max_length=3, null=True, blank=True)
    params = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'bookmarks'
        ordering = ['position', 'id']
        constraints = [
            # Case-insensitive name uniqueness per (user, workspace) - the
            # categories Lower('name') precedent.
            models.UniqueConstraint(
                Lower('name'), 'user', 'workspace', name='uniq_bookmark_name_per_user_workspace_ci'
            ),
            # Constraint values are literals mirroring BookmarkKind.values
            # (recurring_transactions constraint style - stable migration
            # serialization). The kind/target checks are implications
            # (guard | requirement, recurring_materialize_all_requires_end
            # precedent): a check constraint must hold TRUE for every row, so
            # "budget kind requires a target" is written "not a budget kind,
            # OR target fields set" - a bare Q(kind='budget', ...) would
            # reject every filter-kind row.
            models.CheckConstraint(
                condition=Q(kind__in=('budget', 'transactions', 'planned')), name='bookmark_kind_valid'
            ),
            models.CheckConstraint(
                condition=Q(kind__in=('transactions', 'planned'))
                | Q(budget__isnull=False, currency_code__isnull=False),
                name='bookmark_budget_kind_requires_target',
            ),
            models.CheckConstraint(
                condition=Q(kind='budget') | Q(budget__isnull=True, currency_code__isnull=True),
                name='bookmark_filter_kind_targetless',
            ),
        ]

    def __str__(self):
        return self.name
