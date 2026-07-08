# Domain Model Redesign — Design Document (Task 1.1, GATE)

Combines roadmap initiatives 3 (hierarchy simplification) and 4 (balance accounts) into one
design with a single migration story. Inputs: `docs/roadmap.md`, `docs/audit-2026-07.md`.
This document is the reference for all Phase 1 tasks (1.2–1.7).

## 1. Target mental model

Today: a four-deep chain the user must traverse before recording money —
`Workspace → Budget Account → Budget Period → (categories, transactions, balances, exchanges)`.

Target: a workspace containing **two sibling concepts** and their records:

- **Accounts** answer *where is my money* — cash PLN, Bank A PLN, Bank B USD.
- **Budgets** answer *what is my money for* — Home, Hobby, General.

Money movements (transactions, transfers) belong to accounts; plans (categories, planned amounts)
belong to budgets; **periods are background objects** that slice budgets by month automatically.

```
Workspace
├── WorkspaceMember                  (unchanged: roles owner/admin/member/viewer)
├── WorkspaceCurrency                (enabled ISO currencies; usually exactly one)
│
├── Account                          NEW — holds money
│   • name, type (cash|bank|other), currency, opening_balance, archived, display_order
│   • balance = opening_balance + Σ transactions ± Σ transfers   (computed, never stored)
│
├── Transaction                      (income | expense | adjustment)
│   • account FK, category FK, date, amount, description
│   • original_amount?, original_currency?  (informational facet for converted payments)
│   • period membership DERIVED from (category → budget) + date — no stored period FK
├── Transfer                         NEW — between two accounts
│   • from_account, from_amount, to_account, to_amount, date, description
│   • same currency: amounts equal; different currencies: both amounts given (rate implied)
├── PlannedTransaction               (as Transaction: account FK, category FK, derived period)
│
└── Budget                           (renamed from BudgetAccount) — plans money
    • name, description, color, icon, display_order, is_active
    ├── Category                     PERSISTENT, budget-scoped (was period-scoped)
    │   • name, archived
    ├── Period                       (renamed from BudgetPeriod) — auto-created monthly
    │   • start_date, end_date, name (auto: "July 2026"), is_custom
    └── CategoryBudget               (renamed from Budget) — planned amount
        • period FK, category FK, currency FK, amount
```

Removed entirely: `CurrencyExchange` (→ Transfer), `ExchangeShortcut`, `PeriodBalance`
(→ computed account balances + adjustment transactions), per-workspace `Currency` rows
(→ global ISO table + `WorkspaceCurrency` enablement).

## 2. Decisions on the open questions

### 2.1 Budgets are spending plans, not envelopes — CONFIRMED (v1)
A budget does not reserve or partition money from accounts. The budget view shows planned vs
actual per category, and (informationally) the workspace's account balances. Nothing enforces
"sum of budget allocations ≤ account balances". Rationale: envelope semantics require an
allocation ledger, funding workflows, and over-allocation UX — a large feature with real value but
not required to make the model coherent. The account/budget separation is designed so envelopes
can be added later as a new relation (allocations from accounts to budgets) without reshaping what
ships now.

### 2.2 Period auto-creation: lazy, on access — no scheduler
When any read or write touches a budget for a date with no covering period, the service creates
the containing period (and, for reads, does not create historical empty periods — only the
requested one). Mechanics:

- **Cadence is a per-budget setting**: `monthly` (default) or `every N weeks` anchored to a
  user-chosen start date. Auto-creation is identical for both — only the range computation
  differs. This preserves the week-based planning the old manual `weeks` field served, without
  manual period management. The raw `weeks` field itself is dropped.
- `get_or_create` guarded by a DB unique constraint on `(budget, start_date)`; concurrent
  requests are safe and idempotent (constraint + retry, per the concurrency conventions).
- **Copy-forward**: categories no longer need copying (they persist on the budget). Only
  `CategoryBudget` amounts copy from the budget's most recent earlier period, so each new period
  opens pre-filled with last period's plan for the user to tweak. Copying happens at period
  creation, once, atomically.
- **Plan history is per period**: planned amounts are independent rows per period × category
  (× currency). Editing the current period's plan never rewrites past periods; any past period
  remains viewable as its original plan vs its actuals. There is no single "budget applied to all
  months" — copy-forward only pre-fills.
- **Custom periods** (advanced, per-budget setting): a budget can opt out of cadence-based
  auto-creation and manage explicit ranges; `is_custom` marks such periods. Custom ranges must not
  overlap within a budget (validated).
- Deleting a period is only possible for custom periods; cadence-generated ones are recreated on
  demand (deleting one would just resurrect it empty — the UI removes the affordance instead).
- Changing a budget's cadence applies from the current date forward; existing periods are never
  reshaped retroactively.

### 2.3 Period membership is derived, not stored
`Transaction`/`PlannedTransaction` lose their `budget_period` FK. A record's period is derived
from its category's budget + its date. Consequences:

- Editing a transaction's date automatically "moves" it between periods — no stale FK.
- The SET_NULL orphan problem documented in the GDPR/deletion rules disappears for these models
  (no period FK to orphan); deletion ordering simplifies (see §7).
- Reports resolve period ranges by date filtering (indexed on `(workspace, date)` /
  `(account, date)`).
- A transaction with no category (allowed today) has no budget/period — it still affects its
  account balance and appears in account/transaction views; budget reports simply don't include
  it. This is the correct semantic (money moved; it wasn't planned).

### 2.4 Balances: computed, anchored, reconciled — `PeriodBalance` removed
- **Account balance** = `opening_balance` + Σ signed transactions + Σ transfers in − Σ transfers
  out. Computed by aggregate query; no stored balance, no recalculate endpoints.
- **Reconciliation**: an explicit **adjustment** transaction type ("Set balance to X" in the UI
  computes the delta). Keeps an audit trail; replaces manual opening-balance overrides.
- **Budget/period summaries** (planned vs actual per category, income/expense totals) are computed
  on demand from indexed queries. If profiling ever shows this is slow at realistic volumes
  (tens of thousands of transactions), add internal snapshot caching then — invisible to users.
- **Performance guardrails**: composite indexes on `Transaction(account, date)`,
  `Transaction(workspace, date)`, `Transfer(from_account, date)`, `Transfer(to_account, date)`,
  `Transaction(category, date)`.

### 2.5 Transfer ergonomics (replaces exchange shortcuts)
The old `ExchangeShortcut` existed to avoid re-picking a currency pair for recurring conversions.
Two things replace it:

- **Most card-conversion cases stop needing any transfer.** A purchase in a foreign currency paid
  from (e.g.) a PLN card is recorded as a single expense on the PLN account for the PLN amount
  charged — in the old model this required an exchange record *plus* an expense, because money
  lived "in currencies". The two-step workflow disappears with the model change.
- **Original-amount facet**: such a transaction may optionally carry `original_amount` +
  `original_currency` (the USD price before conversion). This is informational metadata — one
  record, two facets, never two records. All balance math and budget actuals use the settled
  amount in the account's currency (the expense lands in the PLN budget); the original amount
  renders as a secondary line on statement rows ("−51.20 zł · $12.99"), mirroring how banks
  present converted payments. A "spending by original currency" report is deferred (§8) but the
  data is captured from the start.
- For genuine transfers between the user's accounts, the transfer form: (a) **preselects the
  last-used from/to account pair** (per user, per workspace); (b) auto-fills both fields when the
  workspace has exactly two active accounts; (c) every transfer row in history has a **"Repeat"**
  action that prefills accounts and description. Named/pinned transfer presets are deliberately
  not built until last-used-pair proves insufficient.

### 2.6 Currencies: global ISO table + per-workspace enablement
- Ship a seeded global ISO 4217 table (code, name, symbol, decimals). `WorkspaceCurrency` links a
  workspace to its enabled currencies. Workspace creation asks for exactly **one** currency
  (no four-currency PLN-biased default).
- Custom currencies (crypto, points): a workspace may add a custom entry (flagged
  `is_custom`, workspace-owned) that behaves identically downstream.
- **Progressive disclosure**: with one enabled currency, no currency selector renders anywhere,
  and transfer forms have no dual-amount fields. Enabling a second currency reveals currency
  columns, pickers, and cross-currency transfers.
- Disabling a currency is blocked while any account or record references it.

### 2.7 Single-account invisibility
Every workspace always has ≥ 1 account (default "Main", workspace currency, created with the
workspace). With exactly one active account: no account pickers (auto-selected), no account
column in transaction lists, Accounts nav section still exists (it is the balance view) but shows
one card. The concept surfaces only when the user adds a second account.

## 3. Naming map (one name per concept — models, API, UI, docs)

| Concept | Old model | New model | Old API | New API | UI label |
|---|---|---|---|---|---|
| Tenant/container | Workspace | Workspace | `/workspaces` | `/workspaces` | Workspace |
| Money holder | — (implicit) | **Account** | — | `/accounts` | Account |
| Money movement | Transaction | Transaction | `/transactions` | `/transactions` | Transaction |
| Between accounts | CurrencyExchange (partial) | **Transfer** | `/currency-exchanges` | `/transfers` | Transfer |
| Spending plan | BudgetAccount | **Budget** | `/budget-accounts` | `/budgets` | Budget |
| Plan time-slice | BudgetPeriod | **Period** | `/budget-periods` | `/budgets/{id}/periods` | Period (usually just "July 2026") |
| Grouping of spend | Category | Category (budget-scoped) | `/categories` | `/budgets/{id}/categories` | Category |
| Planned amount | Budget | **CategoryBudget** | `/budgets` | `/budgets/{id}/periods/{id}/category-budgets` | Planned amount |
| Currency | Currency (per-workspace) | Currency (global) + WorkspaceCurrency | `/workspaces/.../currencies` | `/currencies` (global list), `/workspaces/{id}/currencies` (enablement) | Currency |
| Balance snapshot | PeriodBalance | — (removed) | `/period-balances` | `/accounts/{id}/balance`, `/reports/*` | Balance |
| Exchange favorite | ExchangeShortcut | — (removed) | `/exchange-shortcuts` | — | — |

Forbidden terms after redesign: "budget account", "period balance", "exchange" (as a noun for the
record — the UI may still say "exchange currency" as the verb on a cross-currency transfer).
"Account" refers **only** to money-holding accounts; the auth entity is always "user" / "profile".

## 4. API surface changes

**New:** `GET/POST/PUT/DELETE /accounts` (+ archive), `GET /accounts/{id}/balance`,
`GET/POST/PUT/DELETE /transfers`, `GET /currencies` (global ISO list),
`POST/DELETE /workspaces/{id}/currencies` (enable/disable), adjustment type on transactions.

**Renamed/reshaped:** `/budget-accounts` → `/budgets`; `/budget-periods` → nested
`/budgets/{id}/periods` (list/get; create only for custom periods); `/categories` and the old
`/budgets` (allocations) nest under their budget as shown in §3. Transactions gain `account_id`
(server-defaulted when one account) and lose `budget_period_id`.

**Removed:** `/currency-exchanges`, `/exchange-shortcuts`, `/period-balances` (including both
recalculate endpoints), period copy endpoint.

No API versioning/deprecation window: the frontend is the only client and ships in the same
release. Document the break in release notes for anyone who scripted against the API.

## 5. What the frontend model becomes (summary — details in Task 1.6)

Sidebar: **Dashboard · Accounts · Budgets · Transactions · Planned · Members · Settings**.
Budget view = category table (planned vs actual) + period switcher defaulting to current month.
Transfer form reachable from Accounts and the global add action; "exchange" is the same form with
two currencies. Removed pages: Exchanges, Balances, Budget Periods, Budget Accounts (per audit §3).

## 6. Cutover strategy: fresh schema + legacy import (no in-place migration)

**Decision (2026-07-06, supersedes the earlier in-place migration narrative):** all existing
Django migration files are **deleted and regenerated from scratch** on the new model — there are
no schema-evolution or data migrations. History is preserved through a **legacy import endpoint**:
users of an existing deployment export their data (current v2 JSON) from the old version, deploy
the new version on a fresh database, register, and import the file.

### 6.1 Legacy import endpoint

`POST /users/import-legacy` (authenticated; same rate-limiting posture as the existing GDPR
import). Accepts the old system's export JSON (v1 normalized to v2 first, via the existing
normalizer logic carried over). Transformation rules:

1. **Currencies**: map each exported currency symbol to an ISO code in the global table;
   unmappable symbols become `is_custom` workspace currencies. Enable each mapped currency in the
   workspace.
2. **Accounts**: create a `Main <CODE>` account per currency encountered in the file — only if an
   account with that name does not already exist in the workspace (idempotent re-import). The
   import cannot know which historical records were cash vs which bank; splitting `Main` into real
   accounts afterwards is a user action (create accounts, move balances via transfers/adjustments,
   bulk-reassign past transactions — transaction editing must allow changing the account).
3. **Structure**: exported budget accounts → Budgets; their periods → Periods with
   `is_custom=True` (exact historical ranges and names preserved; cadence-based auto-creation
   applies only from the present onward). Period-scoped categories **merge by case-insensitive
   name per budget** into persistent categories; per-period `budgets` entries → `CategoryBudget`
   rows against the merged categories.
4. **Transactions / planned transactions**: imported against the `Main <CODE>` account matching
   each record's currency; categories mapped to the merged rows.
5. **Exchanges → Transfers** between the two matching `Main` accounts (date, both amounts,
   description preserved; rate implied).
6. **Linked-transaction dedup**: the old frontend could auto-create **two transactions per
   exchange** (see `CurrencyExchangeFormModal.tsx`): an *expense* of `from_amount` in
   `from_currency` and an *income* of `to_amount` in `to_currency`, both dated as the exchange,
   with description equal to the exchange's description or the default
   `Currency exchange: <FROM> → <TO>`. Users also wrote manual descriptions like `PLN to USD`
   (`<CODE> to <CODE>`). Since the Transfer already represents the movement, importing these
   transactions would double-count both sides. The importer therefore, for each exchange, searches
   the same period's transactions for the matching pair and **skips** them. Match precedence:
   (a) exact: same date + amount + currency + type + description identical to the exchange's;
   (b) fallback: same date + amount + currency + type + description matching
   `Currency exchange: * → *` or `<FROM> to <TO>` (case-insensitive). Each transaction can be
   consumed by at most one exchange. Skipped records are counted and listed in the import report.
7. **Opening balances**: per account,
   `opening_balance = (Σ latest closing_balance of that currency across exported period balances)
   − (net effect of all records imported into that account)`. This absorbs historical manual
   opening-balance overrides into one anchor.
8. **Verification report (returned by the endpoint)**: per currency, computed post-import account
   balance vs the export's latest closing balance; counts of created budgets/periods/categories/
   transactions/transfers and deduped linked transactions. Mismatches are flagged as warnings for
   manual reconciliation (adjustment transaction), not hard failures — the user sees exactly what
   to check.
9. **Not imported**: exchange shortcuts (concept removed), period balances (used only for anchor
   math), profile/consents/preferences (belong to the account on the new system).

### 6.2 Everything else starts fresh

Demo fixtures (`workspaces/demo_fixtures.py`) are rewritten on the new model; registration demo
data becomes opt-in (audit verdict). Factories, conftest, and seeds are rebuilt against the new
schema. Since there is no in-place migration, no old-schema compatibility code exists anywhere in
the backend — the legacy format lives exclusively inside the import endpoint's transformer.

## 7. GDPR, deletion ordering, export format

- **Export format bumps to v3** (structural: accounts, transfers, persistent categories, no
  period balances). The standard GDPR import endpoint handles **v3 only** (same-system restore).
  Old v1/v2 exports are handled exclusively by the **legacy import endpoint** (§6.1), which owns
  all legacy knowledge — no version normalizers in the main import path.
- **Deletion ordering simplifies**: with `budget_period` FKs gone, the SET_NULL-orphan hazard on
  transactions/planned/exchanges disappears. New rules:
  - `Transaction.account` / `Transfer.from_account/to_account`: **PROTECT** — accounts with
    history are archived, not deleted; deleting an account is allowed only when no records
    reference it (UI offers archive otherwise).
  - `Transaction.category`: SET_NULL (uncategorized is a valid state) — so **budget deletion must
    explicitly delete its categories' transactions or re-home them; decision: budget deletion
    prompts "delete N transactions or keep them uncategorized?" and the service supports both.**
  - Workspace deletion: explicit child deletion in dependency order (transfers, transactions,
    planned, category budgets, periods, categories, budgets, accounts, workspace currencies),
    keeping the defense-in-depth convention.
  - `UserService.delete_account()` / `export_all_data()` updated for every new/renamed model.
- **Legal documents**: this phase collects no new personal data — no privacy-policy change needed.
  (Receipt attachments in Phase 2 **will** require one; noted for Task 2.1.)

## 8. Explicitly deferred (not in Phase 1)

- Envelope-style allocations from accounts to budgets (§2.1).
- Balance snapshot caching (§2.4) — only if profiling demands it.
- Multi-currency budgets' consolidated reporting currency (display conversion) — budgets show
  per-currency figures as today.
- "Spending by original currency" report over the original-amount facet (§2.5).
- Account types beyond cash/bank/other (credit cards with limits, loans).

## 9. Assumption resolution (plan gate checklist)

| Plan working assumption | Resolution |
|---|---|
| 1. Plans, not envelopes | **Confirmed** (§2.1), envelope-ready model shape |
| 2. Target model & renames | **Confirmed + extended**: categories become persistent and budget-scoped |
| 3. Background periods | **Confirmed, lazy creation** (no scheduler); copy-forward = amounts only; `weeks` dropped |
| 4. Exchanges → transfers; shortcuts dropped | **Confirmed** (§1, §6.4) |
| 5. Global ISO currencies | **Confirmed + extended**: custom-currency escape hatch; one default currency at creation |
| 6. Migration default accounts | **Confirmed, refined**: per workspace × active currency, `Main <CODE>`, opening balance solved from pre-migration closing balances (§6.5) |
| 7. Parser in monorepo | Unaffected by this doc (Phase 1-parallel) |

New decisions made here that the plan didn't anticipate: derived period membership (§2.3),
adjustment transaction type (§2.4), account PROTECT + archive semantics (§7), budget-deletion
prompt (§7), opt-in registration demo data (§6).
