# Models, Migrations and Catalog Registries

Part of the `django-backend` skill. Read before adding or changing a model, a constraint, a migration, an FK target, or a shared catalog registry (`backend/common/*.json`). Deletion and export impact: `data-deletion-gdpr` skill.

## Workspace-Scoped Models

All models that belong to a workspace must inherit from `WorkspaceScopedModel`. This provides:
- Direct `workspace` FK for efficient filtering
- Audit fields: `created_by`, `updated_by`, `created_at`, `updated_at`
- `for_workspace()` queryset method via `WorkspaceScopedQuerySet`
- Validation preventing `workspace_id` changes after creation

```python
from common.models import WorkspaceScopedModel

class Category(WorkspaceScopedModel):
    """Category model scoped to a workspace, owned by a Budget."""

    budget = models.ForeignKey('budgeting.Budget', on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=100)
    is_archived = models.BooleanField(default=False)

    class Meta:
        db_table = 'categories'
        constraints = [
            models.UniqueConstraint(Lower('name'), 'budget', name='uniq_category_name_per_budget'),
        ]

# Service usage - always set workspace_id on creation:
Category.objects.create(budget_id=budget_id, workspace_id=workspace_id, name='Food', created_by=user)
```

**Partial unique constraints for "at most one flagged row per partition":** When an invariant is "at most one row with `flag=True` per (scope, partition)" while many rows carry `flag=False`, enforce it at the DB level with a partial unique constraint, not service logic alone:

```python
from django.db.models import Q, UniqueConstraint

class Meta:
    constraints = [
        UniqueConstraint(
            condition=Q(is_default_for_currency=True),
            fields=['workspace', 'currency'],
            name='one_default_account_per_currency',
        ),
    ]
```

The `condition=Q(...)` form lets any number of `False` rows coexist while guaranteeing at most one `True` row per partition - immune to service-layer bugs and direct DB writes. The constraint `name` is part of the contract (service tests assert against it; renaming requires a migration). See §Pre-clear-then-set for the companion service pattern.

**A model field whose name collides with a module import used by LATER field declarations is declared AFTER them.** A field named `settings` shadows `django.conf.settings` mid-class-body, so a later `ForeignKey(settings.AUTH_USER_MODEL, ...)` (or any `settings.*` read in the class body) evaluates the JSONField instance and raises `AttributeError` at import. `UserWorkspaceSettings` declares the `user` FK before its `settings` JSONField, with a comment pinning why the order is load-bearing - keep that comment when editing the model.

**Check constraints are row invariants, not filters - write conditional invariants as `guard | requirement` disjunctions.** A `CheckConstraint` must evaluate TRUE (or NULL) for EVERY row, so a "constraint" written as the subset conjunction you would use in a query filter (`Q(kind='budget', budget__isnull=False, ...)` alongside `Q(kind__in=(...), budget__isnull=True, ...)`) is FALSE for every row outside its subset - two of those together make every possible INSERT fail. The trap is invisible to violation tests: `assertRaises(IntegrityError)` against an unsatisfiable constraint passes VACUOUSLY, and only a happy-path `objects.create` proves insertability - land at least one valid row per constraint before trusting the suite. Implication form (house precedents `recurring_materialize_all_requires_end` = `Q(materialize_all=False) | Q(end_date__isnull=False)` and `bookmark_budget_kind_requires_target` = `Q(kind__in=('transactions', 'planned')) | Q(budget__isnull=False, currency_code__isnull=False)`): the guard arm covers every row the requirement does not apply to.

**Override abstract FK related names:** `WorkspaceScopedModel`'s abstract base uses `%(class)s_set` defaults. Concrete models should set explicit `related_name` on all FKs.

For models with custom querysets:

```python
class AccountQuerySet(WorkspaceScopedQuerySet):
    def active(self):
        return self.filter(is_archived=False)

class Account(WorkspaceScopedModel):
    objects = AccountQuerySet.as_manager()
```

**Workspace-scoped queries:** Prefer `Model.objects.for_workspace(workspace_id)` over manual FK-chain filters like `filter(account__workspace_id=...)`.

## Migrations

- **Keep what `makemigrations` emits, even beyond the spec'd change.** The autodetector may emit `AlterModelOptions` carrying options the model has had all along (`verbose_name_plural` riding along with a new `ordering`) because the existing migration state never recorded them - stripping the "extra" keys leaves latent drift for the next `makemigrations` run to rediscover.
- **Migration dependencies follow the landed tree, not the plan text.** When an earlier task on the same branch already added a sibling-app migration, the new migration depends on THAT migration, not the plan-pinned older one; `makemigrations --check` on a clean tree is the arbiter.
- **Behavior-replacing fields land additive-first: the whole new surface in one commit, model defaults reproducing legacy behavior, before any consumer exists.** New fields, their named check constraints, schema members, domain exceptions, and factory defaults land together while the old field stays the only thing the engine reads (`upfront_count=1` IS the old lead-window materialization; `materialize_all=False` is off); the engine flip and the old field's removal then land as their own reviewable diff. Schema and behavior in one diff is unreviewable, and defaults that change runtime semantics mid-branch break every intermediate commit's suite.
- **A NOT NULL FK column lands as ONE hand-merged migration.** Declare the field nullable → run `makemigrations` (this captures the autodetector's index name and full dependency list) → tighten to NOT NULL → hand-merge into one migration: `AddField(null=True)` + `AlterField(null=False)` + `AddIndex`. The interactive questioner cannot run non-interactively, so the second generation is derived by hand from the first's shape. With the no-existing-data decision, there is no backfill - dev DBs with rows are dropped and recreated, and pytest's fresh test DB proves the apply.
- **An index lands WITH the column it serves**, in the same migration (the reading task expects it there). A nullable-column index needs no nulls-tolerant companion: Postgres btree indexes NULLs, and account-filtered queries never match account-less rows. When the FK's single-column index is declared explicitly in `Meta.indexes`, set `db_index=False` on the field - the autodetector otherwise emits two identical single-column indexes for it (`TransactionItem.category` follows the `source_transaction` precedent).
- **A `RunPython` data backfill mirrors the live service helper it derives from - same rule, same quantization point.** Recompute in Python what the helper computes rather than reaching for a SQL `Coalesce` aggregate: a quantity (3dp) x unit_price (2dp) product is 5dp, and only the helper's sum-level quantize folds it to the value later validations and UI hints read - SQL-side rounding drifts from the helper silently. Chunk the pass pk-paginated; the reverse migration deletes by the FLAG the backfill set, never by re-deriving the rule.
- **A repair migration re-derives the original backfill's rule from the SERVICE helper it mirrors, not from the old migration's code.** A Django migration never re-runs, so rows entering after the backfill was recorded (legacy importers, restores) silently violate its invariant - and the repair's aggregate semantics must account for rows the first pass itself created: the original's sum-over-all-items is provably wrong to copy once its own remainder rows exist, so the repair's user-sum excludes them. Make the repair idempotent by construction (create when missing, resize the system-owned row in place, delete the surplus), keep that row's position on resize (the system owns its size, never its place), and pin idempotence with the direct-call snapshot test (see the `backend-testing` skill).

## FK Flips: Stale-Join Sweep and Aggregate Rewiring

When an FK relationship moves (an aggregate source flipping from `account__currency__code` to a stored own `currency__code`), grep for readers of the OLD path (`account__currency`, `instance.account.currency`) and flip them together - totals annotations, list filters, `ORDERING_PATTERN` tokens, and export `select_related` chains all rewire in one commit; INNER JOINs through a now-NULL FK would silently drop the null-side rows from every aggregate. An aggregate flip touches four surfaces together: the annotation source, the `values()`/map keys, the docstrings, AND the tests - a half-flipped aggregate (annotation renamed, map key not) fails loudly, but a stale docstring misleads silently. Put the newly-required `select_related` member FIRST in the argument list (`select_related('currency', ...)`) so prefix-greps stay honest; argument order is join-plan-neutral. Doc riders (a filter-language paragraph in a UX doc) ride the code task that changes the semantics, never a separate docs-only commit.

**Interim guards carry their own removal conditions.** A guard that exists only because another model's column is still NOT NULL states, in domain terms, what it protects and what completes the change (no task ids); the task that nulls the column REMOVES the guard and completes the behavior in the same commit - an interim guard left behind becomes a permanent wrong branch.

## Shared Catalog Registries

A catalog that both sides of the stack consume (languages, fonts) lives as a shared JSON registry in `backend/common/`: `common/<name>.json` is the single source of truth (the frontend imports it cross-tree), and `common/<name>.py` is the backend's typed view - `REGISTRY_PATH` plus constants (`FONT_CODES`, `DEFAULT_FONT`) derived at import. No `settings.py` row and no env var: the JSON is the only default source. `DEFAULT_LANGUAGE` is the deliberate exception (deploy-time localization overrides are real); a new catalog arguing for an env var must say why it beats the registry default. The pattern exists because hardcoded copies of one list drift - the font list sat in four places (backend choices class, two frontend lookups, index.html webfont loads) before `fonts.json`.

- **Model fields over registry values carry no `choices=`.** Drop the choices class and point the field `default` at the same registry constant the service uses - model default == service default by construction. A dynamic choices class built from the registry at import time was rejected because every registry edit churns a migration; that is why the language fields never had model choices. The autodetector emits a state-only `AlterField` (Django `choices` create no DB constraint) and serializes the default as the resolved literal (`default='geist'`, not the constant reference) - keep makemigrations output verbatim.
- **Semantic-vs-structural validation split.** The Pydantic schema keeps only type/shape checks (Ninja's 422); value checks - registry membership, ranges - raise `common.exceptions.ValidationError` from the service so they ride the global handler as 400 with a translated detail. Move the WHOLE mistake class together: the rejected alternative was a font-only 400 while language/number_format stayed 422 on the same PATCH - one endpoint returning mixed codes for the same kind of mistake. Validate BEFORE `get_or_create` so a rejected request never creates a row, and preserve existing msgids byte-identical when moving a validator - the .po translations carry over with zero i18n churn. Tests pinning the old code flip from Ninja's 422 detail list to the handler's plain-string `{'detail': ...}`.
- **Self-heal-on-read when a registry shrinks.** In the getter, `value not in REGISTRY_CODES` subsumes the old falsy check: rows stored under dropped entries heal to the registry default on read, no data migration. Safe only once no writer of invalid values survives - and verify the GDPR import never restores the field before skipping an import-side check.
