# B1 — Global currencies (ISO catalog + per-workspace enablement)

Size **M** · Deps: none · Plan: `IMPLEMENTATION_PLAN.md` · Design: `docs/design/domain-redesign.md` §2.6

## Objective
Introduce a global ISO 4217 currency catalog with per-workspace enablement, replacing the
"4 per-workspace currencies created on signup" behavior. New workspaces get exactly **one**
enabled currency. The old per-workspace `workspaces.Currency` model **stays alive** (legacy
models still FK it) and is deleted later in B8.

## Read first
- `.agents/skills/django-backend/SKILL.md`, `.agents/skills/backend-testing/SKILL.md`
- `backend/common/models.py`, `backend/common/querysets.py` (base patterns)
- `backend/workspaces/models.py`, `backend/workspaces/services.py` (`create_workspace`,
  `CurrencyService`), `backend/workspaces/api.py`, `backend/workspaces/schemas.py`
- `backend/core/services.py` (`register`), `backend/core/schemas/` (RegisterIn location)
- `backend/budget_accounts/api.py` + `schemas.py` + `services.py` (app template to imitate)
- `backend/config/urls.py` (router registration)
- `backend/conftest.py` (session fixtures pattern)
- `backend/workspaces/demo_fixtures.py` (will need updating for single-currency creation)

## Create: new Django app `backend/currencies/`
Standard app layout (`apps.py`, `admin.py`, `models.py`, `schemas.py`, `services.py`, `api.py`,
`exceptions.py`, `factories.py`, `tests.py`, `migrations/`). Add to `INSTALLED_APPS`.

### Models (`currencies/models.py`)
Plain `models.Model` (NOT `WorkspaceScopedModel` — the catalog is global):

```python
class Currency(models.Model):
    code = models.CharField(max_length=8)          # 'USD'; custom codes may be longer
    name = models.CharField(max_length=64)         # 'US Dollar'
    symbol = models.CharField(max_length=8)        # '$'
    decimals = models.PositiveSmallIntegerField(default=2)
    is_custom = models.BooleanField(default=False)
    workspace = models.ForeignKey('workspaces.Workspace', null=True, blank=True,
                                  on_delete=models.CASCADE, related_name='custom_currencies')
    class Meta:
        db_table = 'currencies_catalog'
        constraints = [
            UniqueConstraint(fields=['code'], condition=Q(workspace__isnull=True),
                             name='uniq_global_currency_code'),
            UniqueConstraint(fields=['workspace', 'code'], condition=Q(workspace__isnull=False),
                             name='uniq_custom_currency_per_workspace'),
            CheckConstraint(check=(Q(is_custom=True, workspace__isnull=False)
                                   | Q(is_custom=False, workspace__isnull=True)),
                            name='custom_currency_has_workspace'),
        ]

class WorkspaceCurrency(models.Model):
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE,
                                  related_name='enabled_currencies')
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name='enablements')
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'workspace_currencies'
        unique_together = [['workspace', 'currency']]
```

`db_table='currencies_catalog'` because the legacy model owns `currencies` until B8. Keep the
name permanently (renaming later buys nothing).

### Seed data (`currencies/data.py` + management command)
- `currencies/data.py`: `ISO_4217: list[dict]` with the full active ISO 4217 list —
  `{'code', 'name', 'symbol', 'decimals'}` per entry (decimals: JPY=0, KWD/BHD/OMR=3, most=2;
  symbol falls back to the code where no common symbol exists).
- `currencies/management/commands/seed_currencies.py`: idempotent —
  `update_or_create(code=..., workspace=None, defaults=...)` per entry; prints created/updated
  counts. Mirror the style of `core/management/.../seed_legal_documents.py`.
- `backend/conftest.py`: add a session-scoped autouse fixture (same pattern as
  `seed_legal_documents`) that runs the seeding inside `django_db_blocker.unblock()`.
- Add `python manage.py seed_currencies` to `backend/docker-entrypoint.sh` right after the
  existing `migrate` call (check `celery-entrypoint.sh` too; only the web entrypoint seeds).

### Service (`currencies/services.py`, class `CurrencyCatalogService`, all `@staticmethod`)
- `list_catalog(workspace_id) -> QuerySet` — global rows + this workspace's custom rows,
  ordered by code.
- `list_enabled(workspace_id) -> list[Currency]` — via `WorkspaceCurrency`, ordered by code.
- `get_enabled(workspace_id, code) -> Currency` — raise `CurrencyNotEnabledError` if not enabled
  (custom rows match only their own workspace).
- `enable(user, workspace_id, code) -> Currency` — resolve code from catalog
  (global first, then workspace-custom); `UnknownCurrencyError` if absent;
  `WorkspaceCurrency.objects.get_or_create(...)` (idempotent).
- `create_custom(user, workspace_id, code, name, symbol, decimals) -> Currency` — creates
  `is_custom=True` row for the workspace **and enables it**; reject codes colliding with a
  global code (`DuplicateCurrencyError`).
- `disable(workspace_id, code) -> None` — rules, in order:
  1. `LastCurrencyError` if it is the workspace's only enabled currency (a workspace always has ≥1).
  2. `CurrencyInUseError` if referenced — implement `_reference_count(workspace_id, currency)`
     returning `0` for now with a `# Extended by B2 (accounts), B4 (category budgets), B5
     (transaction original facet)` comment. Later tasks add their models' counts here.
  3. Delete the `WorkspaceCurrency` row; if the currency `is_custom` and now has zero
     enablements, delete the custom row too.
- Exceptions in `currencies/exceptions.py`, registered/handled exactly like existing app
  exceptions (grep how e.g. `workspaces/exceptions.py` errors reach HTTP responses; follow it).

### API
- New router `currencies/api.py` (`Router(tags=['Currencies'])`) registered in `config/urls.py`
  as `api.add_router('/currencies', currencies_router)`:
  - `GET ''` → catalog for current workspace (`WorkspaceJWTAuth`), `list[CurrencyCatalogOut]`
    (`id, code, name, symbol, decimals, is_custom`).
- On the **workspaces router** (`workspaces/api.py`), new endpoints (keep the OLD
  `/workspaces/currencies` legacy-model endpoints untouched — B8 deletes them):
  - `GET /enabled-currencies` → `list[CurrencyCatalogOut]`.
  - `POST /enabled-currencies` (ADMIN_ROLES) body `EnableCurrencyIn`: either
    `{code}` (enable existing) or `{code, name, symbol, decimals?}` with `custom=True`
    (create custom + enable). 201.
  - `DELETE /enabled-currencies/{code}` (ADMIN_ROLES) → 204; 400 `DetailOut` for
    LastCurrency/CurrencyInUse; 404 for unknown/not-enabled.

### Workspace creation & registration changes
- `WorkspaceService.create_workspace(user, name, currency_code='PLN', create_demo=False)`:
  - Stop calling `CurrencyService.create_default_currencies` (delete that method + its tests).
  - Create **one** legacy `workspaces.Currency` row: `symbol=currency_code`, `name` looked up
    from the catalog (fallback: code). Legacy models (BudgetAccount.default_currency etc.)
    keep working off this row until B8.
  - `CurrencyCatalogService.enable(user, workspace.id, currency_code)`.
  - `General` budget account keeps using the legacy row as before.
  - `demo_fixtures.py`: wherever demo data needs additional currencies, it must create the
    legacy `Currency` rows itself **and** call `enable()` for each. Adjust so demo creation
    still works with a single pre-created currency.
- `POST /workspaces` create schema: add `currency_code: str = Field(default='PLN',
  pattern=r'^[A-Z]{3,8}$')`; pass through.
- `RegisterIn`: add the same field; `AuthService.register` passes it to `create_workspace`.
  (Default stays 'PLN' so the current FE keeps working; F7 makes the FE send it explicitly.)

## Transitional state after B1
- Legacy `workspaces.Currency` + its endpoints + all legacy FKs: unchanged, still used by
  budget_accounts/transactions/budgets/exchanges/period_balances. Deleted in B8.
- New catalog is authoritative for: workspace enablement, everything built from B2 onward.
- Migrations: generate normally (`makemigrations currencies workspaces`) — they are throwaway;
  B9 regenerates all initials.

## Tests (`currencies/tests.py` + touched apps; follow backend-testing skill)
1. Seed command idempotent (run twice → same counts, no dupes); USD/JPY decimals correct.
2. Catalog list returns global + own-workspace custom only (not another workspace's custom).
3. Enable ISO code; enable twice → idempotent single row.
4. Enable unknown code → 400/404 per exception mapping.
5. Create custom currency → enabled; collides with global code → 400; another workspace can
   reuse the same custom code.
6. Disable: last currency blocked; not-enabled code → 404; happy path removes enablement;
   orphaned custom row cleaned up.
7. Role enforcement: member cannot enable/disable (403), admin can.
8. `create_workspace('EUR')` → exactly one legacy Currency row (EUR) + one enablement; General
   account uses it; registration with `currency_code` propagates; registration without it → PLN.
9. Workspace-scoping: enabled list never leaks across workspaces.

## Done criteria
- [ ] Full suite green (`pytest`), including updated workspace/demo tests.
- [ ] New workspace has exactly 1 enabled currency + 1 legacy currency row.
- [ ] `ruff check` + `ruff format` clean.
- [ ] Legacy currency endpoints and models untouched.

## Verification
```bash
cd backend && uv run ruff check --fix . && uv run ruff format . && pytest --create-db -q
# manual: python manage.py seed_currencies (twice); register via /api/docs with currency_code
```
