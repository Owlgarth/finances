# B6 — Transfers between accounts

Size **M** · Deps: B2 (B5 recommended first for shared test fixtures) · Plan:
`IMPLEMENTATION_PLAN.md` · Design: `docs/design/domain-redesign.md` §1, §2.5

## Objective
First-class transfers between two accounts of the same workspace: same-currency (one amount) and
cross-currency (two amounts, rate implied). Transfers move both account balances and are never
income/expense. This replaces the concept behind `currency_exchanges` (whose app is deleted in
B8 — untouched here).

## Read first
- `.agents/skills/django-backend/SKILL.md`, `.agents/skills/backend-testing/SKILL.md`
- B2: `backend/accounts/services.py` (`_transfers_delta`, `_record_count`, `balance`)
- `backend/transactions/api.py`/`services.py` post-B5 (filter/list conventions to mirror)
- `backend/currency_exchanges/models.py` (only as a reference for what the legacy shape was)

## Create: new Django app `backend/transfers/`

### Model (`transfers/models.py`)
```python
class Transfer(WorkspaceScopedModel):
    from_account = models.ForeignKey('accounts.Account', on_delete=models.PROTECT,
                                     related_name='transfers_out')
    to_account = models.ForeignKey('accounts.Account', on_delete=models.PROTECT,
                                   related_name='transfers_in')
    from_amount = models.DecimalField(max_digits=15, decimal_places=2)
    to_amount = models.DecimalField(max_digits=15, decimal_places=2)
    date = models.DateField()
    description = models.TextField(blank=True, default='')
    class Meta:
        db_table = 'transfers'
        indexes = [models.Index(fields=['from_account', 'date']),
                   models.Index(fields=['to_account', 'date']),
                   models.Index(fields=['workspace', 'date'])]
        constraints = [CheckConstraint(check=~Q(from_account=F('to_account')),
                                       name='transfer_accounts_differ')]
```
The exchange rate is **never stored** — it is `to_amount / from_amount`, computed in the
output schema when currencies differ.

### Service (`transfers/services.py`, `TransferService`)
- `create(user, workspace_id, data)` / `update(...)` validations (shared `_validate` helper):
  1. Both accounts belong to the workspace (404-style app exception otherwise) and differ
     (schema-level too, but re-check).
  2. On **create**: neither account archived (400). On **update**: allow editing a transfer
     whose accounts have since been archived, but reject changing *to* an archived account.
  3. `from_amount > 0`, `to_amount > 0`.
  4. Same currency (`from_account.currency_id == to_account.currency_id`):
     if `to_amount` omitted in input → set equal to `from_amount`; if provided → must be equal
     (400 `"Amounts must match for same-currency transfers"`).
  5. Different currencies: both amounts required (400 if `to_amount` missing).
- `get`, `delete` — standard.
- `list(workspace_id, *, date_from=None, date_to=None, account_id=None)` — `account_id` matches
  either side (`Q(from_account_id=x) | Q(to_account_id=x)`); order `-date, -id`; paginate the
  same way transactions do.
- Wire **`AccountService._transfers_delta(account)`**:
  `Σ to_amount (transfers_in) − Σ from_amount (transfers_out)` (two aggregates).
  Wire `_record_count` += `transfers_in.count() + transfers_out.count()` — an account with
  transfers can only be archived, not deleted.

### API (`transfers/api.py`, registered as `/transfers`)
| Method | Path | Notes |
|---|---|---|
| GET | `''` | filters `date_from, date_to, account_id`; paginated like `/transactions` |
| GET | `/{transfer_id}` | 404 DetailOut |
| POST | `''` | 201; WRITE_ROLES (same gate as transaction create) |
| PUT | `/{transfer_id}` | full replace |
| DELETE | `/{transfer_id}` | 204 |

Schemas: `TransferCreate{from_account_id, to_account_id, from_amount, to_amount: Decimal|None,
date, description=''}` (validator: accounts differ), `TransferOut{id, workspace_id,
from_account_id, from_account_name, from_currency_code, from_amount, to_account_id,
to_account_name, to_currency_code, to_amount, date, description, rate: str|None, created_at}` —
`rate = (to_amount / from_amount).quantize(Decimal('0.000001'))` only when currencies differ,
else `None`.

### Factory
`transfers/factories.py::TransferFactory` — two `AccountFactory` SubFactories in one workspace
(same currency by default; a `cross_currency` trait or helper for the USD case).

## Tests (`transfers/tests.py`)
1. Same-currency: `to_amount` omitted → equals `from_amount`; provided-but-different → 400.
2. Cross-currency: missing `to_amount` → 400; happy path stores both; `rate` in output correct
   to 6 dp; same-currency output has `rate=None`.
3. `from == to` → 400 (schema) and constraint holds at DB level.
4. Balances: A opening 100, B opening 0, transfer 40 → A=60, B=40 (assert via
   `AccountService.balance` and the `/accounts/{id}/balance` endpoint). Cross-currency:
   PLN→USD 100→25 moves each side by its own amount.
5. Archived account: create → 400; existing transfer readable/editable except retargeting to an
   archived account → 400.
6. Account with a transfer: DELETE `/accounts/{id}` → 400 (archive path still works).
7. List filter `account_id` returns transfers on either side; date range works; scoping (other
   workspace → empty/404); role matrix (viewer 403 on POST).
8. Delete transfer restores both balances.

## Done criteria
- [ ] Full suite green; ruff clean.
- [ ] `AccountService.balance` now = opening + transactions delta + transfers delta —
      combined test with all three components passes (extend test 8 from B5 with a transfer).
- [ ] Legacy `currency_exchanges` app untouched.

## Verification
```bash
cd backend && uv run ruff check --fix . && uv run ruff format . && pytest --create-db -q
# manual: /api/docs — same-currency and PLN→USD transfer; check both /balance endpoints
```
