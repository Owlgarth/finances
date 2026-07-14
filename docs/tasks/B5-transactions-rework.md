# B5 — Transactions on accounts (derived periods, adjustment type, original facet)

Size **L** · Deps: B2, B4 · Plan: `IMPLEMENTATION_PLAN.md` · Design:
`docs/design/domain-redesign.md` §1, §2.3 (derived period), §2.4 (adjustments), §2.5
(original-amount facet), §2.7 (single-account defaulting)

## Objective
Rework `Transaction` onto the new model: it belongs to an **account** (which defines its
currency), optionally to a budget-scoped **category** (which, with the date, derives its
period), gains the **adjustment** type and the **original amount/currency facet**, and stops
touching period balances. Account balances become real (wire `_transactions_delta`).

## Read first
- `.agents/skills/django-backend/SKILL.md`, `.agents/skills/backend-testing/SKILL.md`
- `backend/transactions/` — every file; the service methods you are rewriting:
  `get_transaction, update_period_balance, _resolve_period, _validate_category,
  _resolve_display_descriptions, _build_filtered_queryset, list, totals, totals_combined,
  frequent_descriptions, create, update, delete, export, import_data`
- B2 result: `accounts/services.py` (`single_active_account`, `_transactions_delta`,
  `_record_count`, `balance`)
- B3/B4 result: `budgeting/services.py` (`PeriodService.get_or_create_for_date`),
  `categories` re-parented model
- `backend/planned_transactions/services.py` (it creates Transactions on execution — must keep
  compiling; full alignment is B7)
- `backend/users/services.py::export_all_data` (transactions section)

## Model changes (`transactions/models.py`, in place — data disposable)
Remove: `budget_period` FK, `currency` FK.
Add / change:
```python
TYPE_CHOICES = [('income', 'Income'), ('expense', 'Expense'), ('adjustment', 'Adjustment')]
account = models.ForeignKey('accounts.Account', on_delete=models.PROTECT,
                            related_name='transactions')
original_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
original_currency = models.ForeignKey('currencies.Currency', on_delete=models.PROTECT,
                                      null=True, blank=True, related_name='+')
class Meta:
    db_table = 'transactions'
    indexes = [models.Index(fields=['account', 'date']),
               models.Index(fields=['workspace', 'date']),
               models.Index(fields=['category', 'date'])]
    constraints = [CheckConstraint(
        check=(Q(original_amount__isnull=True, original_currency__isnull=True)
               | Q(original_amount__isnull=False, original_currency__isnull=False)),
        name='original_facet_both_or_neither')]
```
The transaction's currency **is** `account.currency` — never stored separately again.

## Semantics (single source of truth for later tasks)
- `income`: `amount > 0`, adds to account balance, counts in budget actuals as income.
- `expense`: `amount > 0`, subtracts from balance, counts in actuals as expense.
- `adjustment`: **signed** `amount != 0` (delta; UI computes it from "set balance to X"),
  applied to balance as-is; `category` must be null (400 otherwise); **excluded** from
  income/expense totals and budget actuals everywhere.
- Original facet: both fields or neither; `original_currency` must exist in the catalog
  (global or this workspace's custom) and **differ from `account.currency`** (400);
  `original_amount > 0`. Informational only — never used in any aggregate.
- Category optional. With category: on create/update call
  `PeriodService.get_or_create_for_date(user, category.budget, date)` to lazily materialize the
  period (propagate `NoPeriodForDateError` as 400 for custom-cadence budgets without a covering
  period). Without category: no budget/period involvement at all.

## Service rewrite (`transactions/services.py`)
- **Delete** `update_period_balance`, `_resolve_period`, and every import/call of
  `period_balances`/`get_or_create_period_balance` in this app. Transactions no longer maintain
  any stored balance.
- `create(user, workspace_id, data)`:
  1. Resolve account: `data.account_id` or `AccountService.single_active_account(workspace_id)`;
     if neither → `AccountRequiredError` (400, "multiple accounts — specify account_id").
     Account must be in workspace and **not archived** (400).
  2. Validate type/amount/category/original facet per Semantics.
  3. Save; then period-touch if category set.
- `update(user, workspace_id, transaction_id, data)`: full-replace like today; account may
  change (same validations; archived target account → 400); date/category changes re-derive
  (period-touch new combination).
- `delete`: unchanged apart from removed balance calls.
- `_build_filtered_queryset(workspace_id, *, date_from=None, date_to=None, account_id=None,
  category_id=None, budget_id=None, type=None, search=None)` — replaces the period-based
  filtering. `budget_id` filters `category__budget_id`. Keep the existing search/description
  behavior (`_resolve_display_descriptions` stays as-is if it doesn't touch periods).
- `list(...)` — same pagination/ordering as today, new filters above.
- `totals(...)` / `totals_combined(...)` — same shapes, but: date-range+filters instead of
  period; **group by `account__currency__code`** where they grouped by currency before;
  exclude `adjustment` rows.
- `frequent_descriptions` — keep, scoped by workspace (drop any period arg).
- `export` — CSV/JSON export by `date_from/date_to` (+ optional filters) instead of period;
  include `account_name`, `currency_code`, `original_amount`, `original_currency_code`.
- `import_data(user, workspace_id, account_id, rows)` — rows import into one explicit account;
  category matched by name within a given `budget_id` (optional param) else left null.
- **New** `bulk_set_account(user, workspace_id, transaction_ids, account_id) -> int` — validate
  every transaction and the target account are in the workspace (else 400, nothing applied);
  single `UPDATE`; returns count. (Needed to split `Main` after legacy import — design §6.1.)
- Wire **`accounts/services.py::AccountService._transactions_delta(account)`**: one aggregate —
  `Σ amount WHERE type='income'` − `Σ amount WHERE type='expense'` + `Σ amount WHERE
  type='adjustment'` for the account. Wire `_record_count` += account's transaction count.

## API (`transactions/api.py`)
Same router; adjust:
- `POST ''` / `PUT /{id}`: schema `TransactionCreate{date, description, type,
  amount: Decimal, account_id: int | None, category_id: int | None,
  original_amount: Decimal | None, original_currency_code: str | None}` (pydantic validator:
  facet both-or-neither).
- `GET ''` + totals endpoints: query params per new filters (`date_from`, `date_to`,
  `account_id`, `category_id`, `budget_id`, `type`, `search`) — delete `budget_period_id`.
- `POST /bulk-account` body `{transaction_ids: list[int], account_id: int}` →
  `{updated: int}`; gate with the same role group as create (check current file; WRITE_ROLES).
- `TransactionOut`: `id, workspace_id, account_id, account_name, currency_code, date,
  description, category_id, category_name, amount, type, original_amount,
  original_currency_code, created_at`.
- Export/import endpoints: swap period param for the new ones (`account_id` required on import).

## Fallout patches (keep the suite green)
- `planned_transactions/services.py`: where it builds a `Transaction` on execution, pass an
  account: use `single_active_account` or the planned row's legacy currency→`Main`-matching is
  NOT available — simplest compiling bridge until B7: require/lookup the workspace's single
  active account and drop the `currency`/`budget_period` kwargs. Mark `# B7 aligns fully.`
  Adjust its tests minimally.
- `users/services.py::export_all_data`: transactions section — export **by workspace** (not per
  period): date, description, amount, type, category_name, account_name, currency_code,
  original facet. `# TODO(B10): full v3 export.`
- `workspaces/demo_fixtures.py`: demo transactions get `account=` the demo workspace's `Main`
  account; drop `currency=`/`budget_period=` kwargs.
- `transactions/factories.py`: `account = SubFactory(AccountFactory)`, drop currency/period.
- Legacy `currency_exchanges` FE "linked transactions" endpoint calls will now 422 on missing
  fields — that app is deleted in B8; do not fix it, but if its **backend tests** construct
  Transactions, update those constructions.

## Transitional state after B5
- Account balances now include transactions (B6 adds transfers).
- PlannedTransaction still has legacy currency/period fields (B7). PeriodBalance/currency
  exchange apps still exist but transactions no longer feed period balances (their numbers go
  stale — deleted in B8).

## Tests (rewrite `transactions/tests.py` around the new semantics)
1. Create: explicit account; defaulting with exactly one active account; two active accounts +
   no account_id → 400; archived account → 400; cross-workspace account → 404/400.
2. Adjustment: negative amount ok, zero → 400, with category → 400; balance reflects it;
   excluded from totals.
3. Original facet: both-or-neither (400 on one); same-as-account currency → 400; unknown code →
   400; happy path stored and returned.
4. Derived period: create with category → period for that month exists (assert via budgeting
   models); date change to next month → next period materialized; category=None → zero periods
   created.
5. Custom-cadence budget without covering period → 400 on create with that category.
6. Filters: date range, account, budget (via category), type; adjustment excluded from totals;
   totals grouped per account currency.
7. `bulk_set_account`: happy path count; one foreign id → 400 and no partial update.
8. `AccountService.balance`: opening 100 + income 50 − expense 30 + adjustment(−20) = 100.
9. Account delete blocked (400) once it has a transaction; archive still allowed.
10. Export includes account/currency/original columns; import lands rows in the given account.

## Done criteria
- [ ] Full suite green; ruff clean; no `period_balances` import left in `transactions/`.
- [ ] `AccountService.balance` correct per test 8 (this is the linchpin number).
- [ ] Indexes + constraint exist in migrations.

## Verification
```bash
cd backend && uv run ruff check --fix . && uv run ruff format . && pytest --create-db -q
# manual: /api/docs — create income/expense/adjustment on Main; GET /accounts/{id}/balance
```
