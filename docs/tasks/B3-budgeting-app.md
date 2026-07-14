# B3 — Budgeting app (Budget + Period with cadence & lazy auto-creation)

Size **L** · Deps: B1 · Plan: `IMPLEMENTATION_PLAN.md` · Design: `docs/design/domain-redesign.md`
§1 (Budget/Period), §2.2 (cadence, lazy creation, copy-forward), §2.3 (derived membership)

## Objective
Create the new consolidated `budgeting` app containing `Budget` (successor of `BudgetAccount`)
and `Period` (successor of `BudgetPeriod`) with per-budget cadence (monthly / every-N-weeks /
custom) and lazy, concurrency-safe period auto-creation. Old apps (`budget_accounts`,
`budget_periods`, old allocation `budgets`) stay untouched and running until B4/B8.

**Why one app:** Budget, Period, and (from B4) CategoryBudget share one lifecycle and one service
boundary; also the name `budgets` is occupied by the legacy allocation app until B4 deletes it.

## Read first
- `.agents/skills/django-backend/SKILL.md`, `.agents/skills/backend-testing/SKILL.md`
- `backend/budget_accounts/` (CRUD/archive template), `backend/budget_periods/models.py` +
  `services.py` (what is being replaced; note `BudgetPeriodQuerySet.containing()`)
- `backend/budgets/models.py` — legacy allocation model; you rename only its `db_table` here
- `backend/currencies/` (B1), `backend/common/models.py`
- `backend/workspaces/services.py` (`create_workspace`)

## Step 0 — free the `budgets` table name
Legacy `budgets.Budget` has `db_table = 'budgets'`. Change it to `db_table = 'legacy_budgets'`
and generate the (throwaway) migration. No other change to that app.

## Create: new Django app `backend/budgeting/`

### Models (`budgeting/models.py`)
```python
class Cadence(models.TextChoices):
    MONTHLY = 'monthly', 'Monthly'
    WEEKS = 'weeks', 'Every N weeks'
    CUSTOM = 'custom', 'Custom periods'

class Budget(WorkspaceScopedModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    color = models.CharField(max_length=7, blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    display_currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT,
                                         null=True, blank=True, related_name='+')
    cadence = models.CharField(max_length=10, choices=Cadence.choices, default=Cadence.MONTHLY)
    cadence_weeks = models.PositiveSmallIntegerField(null=True, blank=True)   # required iff WEEKS
    cadence_anchor = models.DateField(null=True, blank=True)                  # required iff WEEKS
    class Meta:
        db_table = 'budgets'
        unique_together = [['workspace', 'name']]
        ordering = ['display_order', 'name']

class Period(WorkspaceScopedModel):
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='periods')
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    is_custom = models.BooleanField(default=False)
    class Meta:
        db_table = 'periods'
        constraints = [
            UniqueConstraint(fields=['budget', 'start_date'], name='uniq_period_start_per_budget'),
            CheckConstraint(check=Q(end_date__gte=F('start_date')), name='period_end_gte_start'),
        ]
        ordering = ['-start_date']
```

### Services (`budgeting/services.py`)

**`BudgetService`** — mirror `BudgetAccountService` shape:
`list(workspace_id, include_inactive=False)`, `get`, `create`, `update`, `set_archive_status`,
`delete`. Cadence validation (create + update): `WEEKS` ⇒ `cadence_weeks >= 1` and
`cadence_anchor` set; other cadences ⇒ both must be null (service normalizes them to null).
Changing cadence never touches existing periods (design decision 2 — nothing to do, just don't
"fix up" old periods; test asserts this). `delete` cascades periods (CategoryBudget arrives in
B4; the delete-or-uncategorize transaction prompt is wired in B5 when transactions point at
budget-scoped categories — leave a `# B5:` comment).

**`PeriodService`**:
- `compute_range(budget, target_date) -> tuple[date, date, str]`
  - MONTHLY: first day..last day of `target_date`'s month; name `target_date.strftime('%B %Y')`
    (e.g. "July 2026").
  - WEEKS: `span = budget.cadence_weeks * 7`;
    `k = (target_date - budget.cadence_anchor).days // span` (Python floor division — correct
    for dates before the anchor too); `start = anchor + k*span days`; `end = start + span − 1
    day`; name `f'{start:%d %b} – {end:%d %b %Y}'`.
  - CUSTOM: raise `NoPeriodForDateError` (mapped to 400 with a message explaining the budget
    uses custom periods) — callers must catch-or-propagate.
- `get_or_create_for_date(user, budget, target_date) -> Period` — the single entry point every
  later task calls (B5 on transaction create/update, reports, F-track "current period"):
  - CUSTOM cadence: return `budget.periods.filter(start_date__lte=d, end_date__gte=d).first()`
    or raise `NoPeriodForDateError`.
  - Else compute range; `try: return budget.periods.get(start_date=start)` → on DoesNotExist
    create inside `transaction.atomic()` catching `IntegrityError` and re-fetching (unique
    constraint makes concurrent creation safe). On successful creation call
    `copy_forward(period)`.
- `copy_forward(period) -> None` — **placeholder**: docstring + `# B4 copies CategoryBudget
  amounts from the budget's most recent earlier period.` No-op body for now.
- `create_custom(user, workspace_id, budget_id, data) -> Period` — allowed regardless of
  cadence but sets `is_custom=True`; overlap validation:
  `budget.periods.filter(start_date__lte=data.end_date, end_date__gte=data.start_date).exists()`
  → `PeriodOverlapError` (400).
- `update_custom(...)` — rename/date changes for `is_custom=True` periods only (same overlap
  check excluding self); auto-created periods reject edits (`PeriodNotEditableError`, 400).
- `delete(workspace_id, budget_id, period_id)` — only `is_custom=True`
  (`PeriodNotEditableError` otherwise). Cascade deletes its CategoryBudgets (B4+).
- `list(workspace_id, budget_id)`.

### API (`budgeting/api.py`, router registered as `/budgets` in `config/urls.py`)
Legacy `/budget-accounts` and `/budget-periods` routers stay untouched until B8. New routes
(auth `WorkspaceJWTAuth`; writes `require_role(..., ADMIN_ROLES)`):

| Method | Path | Notes |
|---|---|---|
| GET | `''` | `include_inactive` query |
| GET/POST/PUT/DELETE | `'/{budget_id}'` etc. | CRUD like budget_accounts template |
| PATCH | `/{budget_id}/archive` | `{is_active}` (keep legacy field name style) |
| GET | `/{budget_id}/periods` | list |
| GET | `/{budget_id}/periods/current` | `date: date = Query(default=today)`; calls `get_or_create_for_date`; 400 DetailOut for custom-cadence miss |
| POST | `/{budget_id}/periods` | custom period create; 400 overlap |
| PUT | `/{budget_id}/periods/{period_id}` | custom only |
| DELETE | `/{budget_id}/periods/{period_id}` | custom only; 204 |

Schemas: `BudgetCreate/Update/Out` (Out: id, workspace_id, name, description, color, icon,
is_active, display_order, display_currency_code|null, cadence, cadence_weeks, cadence_anchor,
created_at), `PeriodCreate/Update/Out` (Out: id, budget_id, name, start_date, end_date,
is_custom). Color validator copied from `BudgetAccountCreate`.

### Workspace creation
`WorkspaceService.create_workspace`: after the B2 `Main` account, create
`Budget(name='General', cadence=MONTHLY, created_by=user, workspace=…)` via the new model.
The legacy `General` BudgetAccount creation stays too (legacy FE runs on it until F-track;
B8 deletes it).

### Factories
`budgeting/factories.py`: `BudgetFactory`, `PeriodFactory` (period dates default to current
calendar month; `is_custom=False`).

## Transitional state after B3
- Legacy budget_accounts/budget_periods/budgets apps fully operational; only the legacy
  allocation table was renamed (`legacy_budgets`).
- New `/budgets` API is live but nothing else consumes it yet; `copy_forward` is a no-op.

## Tests (`budgeting/tests.py`)
1. Budget CRUD + roles + scoping + duplicate-name (as B2 matrix).
2. Cadence validation: WEEKS without weeks/anchor → 400; MONTHLY with weeks set → normalized
   to null; cadence change leaves existing periods untouched (create period, switch cadence,
   assert period rows identical).
3. `compute_range` MONTHLY: mid-month, Jan 31, Feb (leap and non-leap), Dec→name "December 2026".
4. `compute_range` WEEKS: anchor Monday 2026-01-05, weeks=4 → date inside first window; date in
   third window; **date before anchor** (k negative) — assert contiguous non-overlapping windows.
5. `get_or_create_for_date`: creates once; second call returns same pk; simulated race
   (pre-insert row, then call — IntegrityError path returns existing).
6. `/periods/current` materializes the period and returns it; custom-cadence budget without
   covering period → 400.
7. Custom periods: create ok; overlapping → 400; edit/delete of auto-created → 400; delete of
   custom → 204.
8. New workspace has a `General` Budget (new model) — and still the legacy General BudgetAccount.

## Done criteria
- [ ] Full suite green; ruff clean.
- [ ] `get_or_create_for_date` + `copy_forward` signatures exactly as specified (B4/B5 wire in).
- [ ] Legacy apps behave exactly as before (their tests untouched and green).

## Verification
```bash
cd backend && uv run ruff check --fix . && uv run ruff format . && pytest --create-db -q
# manual: /api/docs → create budget (weeks cadence), GET periods/current for 3 different dates
```
