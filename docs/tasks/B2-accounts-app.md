# B2 — Accounts app (the new money-holding entity)

Size **M** · Deps: B1 · Plan: `IMPLEMENTATION_PLAN.md` · Design: `docs/design/domain-redesign.md`
§1 (Account), §2.4 (computed balances), §2.7 (single-account invisibility), §7 (PROTECT/archive)

## Objective
New `accounts` app: workspace-scoped accounts that hold money (one currency each), with computed
balances, archive semantics, and a default `Main` account per workspace. In this task the balance
equals `opening_balance` (no records reference accounts yet); B5/B6 wire transactions/transfers
into the same computation via explicit extension points defined here.

## Read first
- `.agents/skills/django-backend/SKILL.md`, `.agents/skills/backend-testing/SKILL.md`
- `docs/tasks/B1-global-currencies.md` result: `currencies/models.py`, `currencies/services.py`
- `backend/budget_accounts/` (entire app — this is the template: thin api.py, static-method
  service, schemas with validators, archive endpoint pattern)
- `backend/common/models.py`, `backend/common/auth.py`, `backend/common/permissions.py`
- `backend/workspaces/services.py` (`create_workspace` — you extend it again)
- `backend/config/urls.py`

## Create: new Django app `backend/accounts/`

### Model (`accounts/models.py`)
```python
class AccountType(models.TextChoices):
    CASH = 'cash', 'Cash'
    BANK = 'bank', 'Bank'
    OTHER = 'other', 'Other'

class Account(WorkspaceScopedModel):
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=AccountType.choices, default=AccountType.BANK)
    currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT,
                                 related_name='accounts')
    opening_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    is_archived = models.BooleanField(default=False)
    display_order = models.IntegerField(default=0)
    class Meta:
        db_table = 'accounts'
        unique_together = [['workspace', 'name']]
        ordering = ['display_order', 'name']
```

### Service (`accounts/services.py`, class `AccountService`)
- `list(workspace_id, include_archived=False)`.
- `get(account_id, workspace_id)` — `for_workspace` scoping; app-specific NotFound exception
  matching repo pattern.
- `create(user, workspace_id, data)` — resolve currency by `data.currency_code` via
  `CurrencyCatalogService.get_enabled(workspace_id, code)` (only enabled currencies allowed).
- `update(user, workspace_id, account_id, data)` — name/type/opening_balance/display_order
  editable. **Currency is immutable after creation** (changing it under existing records would
  corrupt history): reject with `AccountCurrencyImmutableError` (400) if
  `data.currency_code` is present and differs.
- `set_archive_status(user, workspace_id, account_id, is_archived)` — archived accounts keep all
  history, are excluded from pickers/defaults, still count in balances.
- `delete(workspace_id, account_id)` — allowed only when `_record_count(account) == 0`, else
  `AccountInUseError` (400, message tells the user to archive instead).
- `_record_count(account) -> int` — returns `0` now. Comment:
  `# B5 adds transactions count, B6 adds transfers count.`
- `balance(account) -> Decimal` — `account.opening_balance + _transactions_delta(account)
  + _transfers_delta(account)`. Both helpers return `Decimal('0')` now with comments
  `# B5: + income − expense + signed adjustments (single aggregate query)` and
  `# B6: + Σ transfers_in.to_amount − Σ transfers_out.from_amount`.
- `single_active_account(workspace_id) -> Account | None` — returns the account iff exactly one
  non-archived account exists, else `None`. (B5 uses this for server-side defaulting; F-track
  uses the count for single-account invisibility.)
- Extend `CurrencyCatalogService._reference_count`: add
  `Account.objects.filter(workspace_id=..., currency=currency).count()` so a currency with
  accounts can't be disabled.

### API (`accounts/api.py`, registered as `/accounts` in `config/urls.py`)
Follow `budget_accounts/api.py` exactly (auth `WorkspaceJWTAuth`, writes gated
`require_role(..., ADMIN_ROLES)`):

| Method | Path | Notes |
|---|---|---|
| GET | `''` | `include_archived: bool = Query(False)` |
| GET | `/{account_id}` | 404 DetailOut |
| POST | `''` | 201; 400 on disabled currency / duplicate name |
| PUT | `/{account_id}` | 400 on currency change attempt |
| PATCH | `/{account_id}/archive` | body `{is_archived: bool}` |
| DELETE | `/{account_id}` | 204; 400 AccountInUse |
| GET | `/{account_id}/balance` | `{account_id, currency_code, balance}` (Decimal as str) |

Schemas (`accounts/schemas.py`): `AccountCreate` (name, type, currency_code, opening_balance=0,
display_order=0; name strip/non-empty validator like `BudgetAccountCreate`), `AccountUpdate`
(all optional), `AccountArchive`, `AccountOut` (id, workspace_id, name, type, currency_code,
opening_balance, is_archived, display_order, created_at; currency_code via
`field_validator(mode='before')` extracting `.code` like the template does with `.symbol`),
`AccountBalanceOut`.

### Default `Main` account
In `WorkspaceService.create_workspace`, after currency enablement (B1): create
`Account(workspace=…, name='Main', type=BANK, currency=<the enabled catalog row>,
created_by=user)`. Every workspace therefore always has ≥ 1 account. Add the same to any other
workspace-creation path if one exists (grep for `create_workspace(` callers; demo fixtures may
create extra accounts later — not in this task).

### Factory (`accounts/factories.py`)
`AccountFactory(DjangoModelFactory)` following an existing factory (e.g.
`transactions/factories.py`): workspace SubFactory, name Sequence, currency — a helper that
gets-or-creates the global 'PLN' catalog row (tests run with seeded catalog via B1's conftest
fixture).

## Transitional state after B2
- Nothing references Account yet; balances = opening_balance.
- Legacy `budget_accounts` app untouched (removed in B8). The similar names will coexist until
  then — never import across the two.

## Tests (`accounts/tests.py`)
1. CRUD happy paths; workspace scoping (other workspace's account → 404); role matrix
   (viewer/member 403 on writes, admin/owner ok).
2. Duplicate name within workspace → 400; same name across workspaces ok.
3. Create with non-enabled currency code → 400; with enabled custom currency → ok.
4. Currency immutable: PUT with different `currency_code` → 400; PUT without it → ok.
5. Archive: hidden from default list, present with `include_archived=true`;
   `single_active_account` returns None when 0 active among 2 total, the account when 1 active.
6. Delete: zero-record account deletes (204); `_record_count` monkeypatched to 1 → 400.
7. Balance endpoint returns opening_balance; Decimal serialized as string.
8. New workspace has exactly one account named 'Main' in the chosen currency.
9. Disabling a currency that has an account → 400 CurrencyInUse.

## Done criteria
- [ ] Full suite green; ruff clean.
- [ ] Extension-point helpers (`_record_count`, `_transactions_delta`, `_transfers_delta`,
      `single_active_account`) exist with the documented signatures — B5/B6 depend on them.
- [ ] Every new workspace has a `Main` account.

## Verification
```bash
cd backend && uv run ruff check --fix . && uv run ruff format . && pytest --create-db -q
# manual via /api/docs: create/archive/delete accounts, balance endpoint
```
