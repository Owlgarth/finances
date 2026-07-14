# B4 — Persistent categories + CategoryBudget (planned amounts)

Size **M/L** · Deps: B3 · Plan: `IMPLEMENTATION_PLAN.md` · Design:
`docs/design/domain-redesign.md` §1, §2.2 (copy-forward), §3 (naming/nesting), audit §2
(category re-parent rationale)

## Objective
Re-parent `Category` from budget-period to **budget** (persistent, archivable), introduce
`CategoryBudget` (planned amount per period × category × currency) in the `budgeting` app,
implement copy-forward, and **delete the legacy allocation app `budgets`**. This is the task
where legacy period-scoped budgeting code gets cut out; several legacy endpoints are removed
(rebuilt properly in B8/F-track).

## Read first
- `.agents/skills/django-backend/SKILL.md`, `.agents/skills/backend-testing/SKILL.md`,
  `.agents/skills/data-deletion-gdpr/SKILL.md`
- B3 result: `backend/budgeting/` (models, `PeriodService.copy_forward` placeholder, api)
- `backend/categories/` (model being re-parented, service, api, factories, tests)
- `backend/budgets/` (legacy allocation app — being deleted)
- Call sites to patch — verify with grep, the known ones are:
  - `backend/transactions/services.py` → `_validate_category` (validates category ∈ period)
  - `backend/planned_transactions/services.py` (category validation, same pattern)
  - `backend/budget_periods/services.py` → period `create` (seeds balances/categories) and
    `copy` (copies categories + budgets between periods)
  - `backend/reports/api.py` + `reports/services.py` → `budget-summary`
  - `backend/users/services.py` → `export_all_data` (categories + budgets sections)
  - `backend/workspaces/demo_fixtures.py`
  - `backend/common/services/base.py` (check for allocation/category helpers)

## Step 1 — Re-parent `categories.Category` (in place; data is disposable)
```python
class Category(WorkspaceScopedModel):
    budget = models.ForeignKey('budgeting.Budget', on_delete=models.CASCADE,
                               related_name='categories')   # replaces budget_period FK
    name = models.CharField(max_length=100)
    is_archived = models.BooleanField(default=False)
    class Meta:
        db_table = 'categories'
        constraints = [UniqueConstraint(Lower('name'), 'budget',
                                        name='uniq_category_name_per_budget_ci')]
        ordering = ['name']
```
`CategoryService` rewrite: `list(workspace_id, budget_id, include_archived=False)`, `get`,
`create(user, workspace_id, budget_id, data)` (budget must belong to workspace; name stripped,
ci-duplicate → 400), `update` (rename with ci-duplicate check), `set_archive_status`, `delete`
(plain delete; FKs from transactions are SET_NULL → allowed, but keep `# B5:` note that the
budget-deletion prompt flow arrives with transactions-on-accounts).

## Step 2 — `CategoryBudget` in `budgeting/models.py`
```python
class CategoryBudget(WorkspaceScopedModel):
    period = models.ForeignKey(Period, on_delete=models.CASCADE, related_name='category_budgets')
    category = models.ForeignKey('categories.Category', on_delete=models.CASCADE,
                                 related_name='category_budgets')
    currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT,
                                 related_name='+')
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    class Meta:
        db_table = 'category_budgets'
        unique_together = [['period', 'category', 'currency']]
```
`CategoryBudgetService`: `list_for_period(workspace_id, budget_id, period_id)`,
`set_amount(user, workspace_id, budget_id, period_id, category_id, currency_code, amount)` —
upsert (`update_or_create`); amount ≥ 0; currency must be enabled
(`CurrencyCatalogService.get_enabled`); category must belong to the same budget as the period
(400 otherwise); `remove(...)` deletes the row. Extend
`CurrencyCatalogService._reference_count` with CategoryBudget counts.

## Step 3 — Copy-forward (fill B3's placeholder)
`PeriodService.copy_forward(period)`: find
`previous = period.budget.periods.filter(start_date__lt=period.start_date).order_by('-start_date').first()`;
if none → return. Bulk-create copies of `previous.category_budgets` **excluding rows whose
category `is_archived`**, attached to the new period (same category/currency/amount,
`workspace_id` set). Runs inside the creation transaction (B3 already calls it there).

## Step 4 — API (all in `budgeting/api.py`; nesting per design §3)
| Method | Path | Notes |
|---|---|---|
| GET | `/budgets/{budget_id}/categories` | `include_archived` query |
| POST | `/budgets/{budget_id}/categories` | 201; ADMIN_ROLES? No — WRITE_ROLES (members budget day-to-day); writes below likewise |
| PUT | `/budgets/{budget_id}/categories/{category_id}` | rename |
| PATCH | `/budgets/{budget_id}/categories/{category_id}/archive` | `{is_archived}` |
| DELETE | `/budgets/{budget_id}/categories/{category_id}` | 204 |
| GET | `/budgets/{budget_id}/periods/{period_id}/category-budgets` | list |
| PUT | `/budgets/{budget_id}/periods/{period_id}/category-budgets` | upsert `{category_id, currency_code, amount}` |
| DELETE | `/budgets/{budget_id}/periods/{period_id}/category-budgets/{category_budget_id}` | 204 |

Use `WRITE_ROLES` (owner/admin/member) for these writes — matching how transactions are gated
today (verify with grep in `transactions/api.py`; follow whatever it uses).
Delete `categories/api.py` and its `config/urls.py` registration (`/categories` route is gone —
legacy FE category page breaks; acceptable on the redesign branch, F4 rebuilds).

## Step 5 — Delete legacy allocation app `budgets/`
Remove the app directory, `INSTALLED_APPS` entry, `config/urls.py` router import/registration,
and every import of `budgets.models.Budget`. Then patch the fallout:

1. `transactions/services.py::_validate_category` → new rule: category exists, belongs to the
   request workspace, is not archived. (Period linkage disappears; transactions still carry
   legacy `budget_period` until B5 — the category check simply no longer involves it.)
2. `planned_transactions/services.py` — same category-validation change.
3. `budget_periods/services.py` — delete the `copy` service method and its endpoint + tests
   (obsolete: copy-forward replaces it). In period `create`, remove any category/allocation
   seeding; keep PeriodBalance seeding (dies in B8).
4. `reports` — delete the `budget-summary` endpoint, service code, schemas, and tests, leaving
   a `# Rebuilt in B8 on budgeting models` comment. Keep `current-balances` untouched.
5. `users/services.py::export_all_data` — remove the per-period `categories` and `budgets`
   sections (leave `# TODO(B10): v3 export`). Keep the rest of the export working.
6. `workspaces/demo_fixtures.py` — stop creating legacy categories/allocations. If demo data
   references them, create **new-model** categories under the workspace's `General` Budget
   (new) instead; planned/transactions in demo keep `category=None` if needed to stay green.
7. Delete `categories`-related fixtures/factory args that set `budget_period`; `CategoryFactory`
   now takes `budget` (add `budgeting.factories.BudgetFactory` SubFactory).

## Transitional state after B4
- Categories are budget-scoped; legacy transactions/planned still have `budget_period` +
  legacy currency FKs (B5/B7 fix), and their `category` FK now points at budget-scoped rows.
- Legacy allocation app gone; reports/budget-summary and period-copy gone until B8.
- Legacy FE: transactions page still works; categories/budgets pages broken (branch-only state).

## Tests
1. Category CRUD nested under budget; ci-uniqueness ("food" vs "Food" → 400) per budget; same
   name across budgets ok; archive excluded from default list.
2. Category persists across periods (create period N and N+1 — same category rows).
3. CategoryBudget upsert (create then overwrite same triple); invalid: category from another
   budget → 400; disabled currency → 400; negative amount → 400.
4. Copy-forward: period with 3 amounts (one archived category) → next auto-created period gets
   2 copied rows; period with no predecessor → none; amounts editable independently
   (change July, June unchanged — decision 9).
5. Patched validators: transaction create with archived/foreign-workspace category → 400.
6. Suite-wide: no import of `budgets.models` remains (grep in CI == zero).

## Done criteria
- [ ] Full suite green (with legacy budget-summary/copy tests deleted); ruff clean.
- [ ] `copy_forward` live and covered; `_reference_count` includes CategoryBudget.
- [ ] `grep -rn "from budgets" backend --include='*.py'` → empty.

## Verification
```bash
cd backend && uv run ruff check --fix . && uv run ruff format . && pytest --create-db -q
```
