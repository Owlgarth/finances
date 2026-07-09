# Denarly — Ultimate Implementation Plan

**Status: approved.** This is the single source of truth for the redesign and roadmap work.
It supersedes `.ipm/IMPLEMENTATION_PLAN.md`. Authoritative design details live in
`docs/design/domain-redesign.md` (the design doc); feature verdicts in `docs/audit-2026-07.md`;
product framing in `docs/roadmap.md`. Tasks below are deliberately small; each is implementable
in isolation once its dependencies are done. Tasks specify behavior ("how it should work"), not
code — expand into a code-level spec when picking one up.

---

## Part I — Context (everything a task implementer needs to know)

### What Denarly is
A self-hostable personal-finance web app: Django 6 + Django Ninja + PostgreSQL + Celery/Redis
backend (`backend/`), React 19 + TypeScript + Vite + TanStack Query frontend (`frontend/`),
JWT auth, multi-tenant workspaces with roles (owner/admin/member/viewer), GDPR export/import,
2FA, legal-consent machinery. Conventions live in `AGENTS.md` and the `.agents/skills/` folder
(django-backend, frontend-react, backend-testing, data-deletion-gdpr, auth-security,
celery-tasks, email-sending, docker-infra) — **all mandatory reading for the files you touch**.

### Current (old) domain model — being replaced
`Workspace → BudgetAccount → BudgetPeriod → {period-scoped Category, Budget(allocation),
Transaction, PlannedTransaction, CurrencyExchange, PeriodBalance}` plus per-workspace `Currency`
rows (4 created per workspace, PLN-biased) and an `ExchangeShortcut` app. Pain: 6 concepts before
a first transaction, categories die each period, money implicitly lives "in currencies" inside
periods, stored balance caches with user-facing recalculate endpoints.

### Target domain model
```
Workspace
├── WorkspaceMember                  (roles unchanged)
├── WorkspaceCurrency                (enabled ISO currencies; usually one)
├── Account                          holds money: name, type cash|bank|other, currency,
│   │                                opening_balance, archived, display_order
│   │                                balance = opening + Σrecords (COMPUTED, never stored)
│   ├── Transaction                  income|expense|adjustment; account FK, category FK, date,
│   │                                amount (in account currency), description,
│   │                                original_amount?/original_currency? (info facet),
│   │                                period DERIVED from category→budget + date (no period FK)
│   ├── Transfer                     from/to account, from/to amount (equal if same currency),
│   │                                date, description; not income/expense
│   └── PlannedTransaction           same shape as Transaction (status pending|done|cancelled)
└── Budget                           plans money: name, description, color, icon, is_active,
    │                                display_order, cadence (monthly | every-N-weeks anchored)
    ├── Category                     PERSISTENT, budget-scoped, archivable
    ├── Period                       auto-created lazily per cadence; is_custom for manual ranges
    └── CategoryBudget               planned amount per period × category × currency
```
Removed concepts: `CurrencyExchange` (→ Transfer), `ExchangeShortcut`, `PeriodBalance`
(→ computed balances + adjustment transactions), per-workspace `Currency` rows, the `weeks`
field, the period copy feature, demo data forced on registration.

### Decisions already made (do not re-litigate; details in the design doc §)
| # | Decision | § |
|---|---|---|
| 1 | Budgets are spending plans, **not envelopes** (no reservation of account money) | 2.1 |
| 2 | Periods auto-create **lazily on access**, unique-constraint-guarded, no scheduler; per-budget cadence monthly or every N weeks; custom ranges advanced; cadence changes apply forward only | 2.2 |
| 3 | Period membership of records is **derived from date**, never a stored FK | 2.3 |
| 4 | Balances always **computed** (indexed aggregates); reconciliation = **adjustment** transaction; no recalculate endpoints, no snapshots unless profiling demands | 2.4 |
| 5 | Transfer ergonomics replace shortcuts: last-used pair preselected, auto-fill at 2 accounts, "Repeat" on history rows; converted card payments = **one expense** with optional original_amount/original_currency facet (settled amount drives all math; lands in the settled currency's budget) | 2.5 |
| 6 | **Global ISO 4217 currency table** + per-workspace enablement; one currency at workspace creation; `is_custom` escape hatch; single enabled currency ⇒ zero currency UI | 2.6 |
| 7 | Single-account invisibility: exactly one active account ⇒ no pickers/columns anywhere | 2.7 |
| 8 | Accounts with history are **archived, never deleted** (PROTECT); budget deletion prompts delete-or-uncategorize its transactions | 7 |
| 9 | Plan history is per period: copy-forward pre-fills only; past periods immutable views | 2.2 |
| 10 | **Fresh schema**: all Django migrations deleted and regenerated; **no data migrations**; history preserved via the **legacy import endpoint** | 6 |
| 11 | GDPR export bumps to **v3**; main import handles v3 only; all v1/v2 knowledge lives in the legacy importer | 7 |
| 12 | Receipt parser = standalone FastAPI service in this monorepo (`services/receipt-parser/`), OpenAI-compatible client, optional to run | roadmap §6 |

### Cutover for existing deployments
Old version → GDPR export (v2 JSON) → deploy new version on a **fresh database** → register →
`POST /users/import-legacy` with the file. The importer (task B11) creates `Main <CODE>` accounts,
converts exchanges to transfers, **dedupes the linked transactions** the old FE auto-created per
exchange (expense of `from_amount` in `from_currency` + income of `to_amount` in `to_currency`,
same date, description = exchange description or `Currency exchange: <FROM> → <TO>`; manual
convention `<FROM> to <TO>`, e.g. "PLN to USD"), solves opening balances so computed balances
equal the export's latest closing balances, and returns a verification report. Full algorithm:
design doc §6.1.

### Naming discipline
One name per concept across models/API/UI/docs. Forbidden after redesign: "budget account",
"period balance", "exchange" as a record noun ("exchange currency" as a verb on a cross-currency
transfer is fine). "Account" means only money-holding accounts; the auth entity is "user"/"profile".

### Sidebar target
Dashboard · Accounts · Budgets · Transactions · Planned · Members · Settings (7 destinations;
removed pages: Exchanges, Balances, Budget Periods, Budget Accounts, top-level Categories).

---

## Part II — Tasks

Sizing: **S** ≈ half a day, **M** ≈ a day, **L** ≈ 2–3 days of focused work.
Every backend task: follow `django-backend` + `backend-testing` skills, ruff check/format, tests
for every service path. Every frontend task: `frontend-react` skill, design tokens, `npm run lint`.

**Detailed task specs** live in `docs/tasks/` (e.g. `docs/tasks/B1-global-currencies.md`) — when
a spec exists, it overrides the summary below. Specs are written in waves: only for tasks whose
dependencies are done or in flight, so they never describe code that later tasks will reshape.
Wave 1 (specs ready): B1–B6, P1, P2.

**Migrations during the redesign:** B1–B8 generate migrations normally — they are throwaway
(databases are disposable, decision 10). B9 deletes every migration file and regenerates clean
initials.

**Branching:** the whole B/F redesign happens on one long-lived feature branch. Between B4 and
the end of the F-track, parts of the legacy frontend are intentionally broken against the new
backend — the specs call out each breakage. Merge to main only when F-track restores parity.

### Track B — Backend domain redesign (sequential unless noted)

**B1 — Global currencies (M)** · deps: —
New `Currency` global table (ISO 4217: code, name, symbol, decimals; seeded by a management
command) + `is_custom` workspace-owned rows + `WorkspaceCurrency` enablement join.
`WorkspaceService.create_workspace` takes exactly one currency code (no 4-currency default).
Endpoints: `GET /currencies` (global list), `GET/POST/DELETE /workspaces/{id}/currencies`;
disabling blocked while referenced. *Done:* single-currency workspace never needs a currency
param anywhere downstream; enable/disable rules tested.

**B2 — Accounts app (M)** · deps: B1
New `accounts` app: model per Part I diagram; service + CRUD API (`/accounts`), admin-role gated,
workspace-scoped; archive/unarchive (archived hidden from pickers, kept in history); balance
endpoint (`GET /accounts/{id}/balance`) computing opening + Σ transactions ± transfers via
aggregates; default `Main` account created with every workspace (workspace currency). Deleting
allowed only with zero records (else API says archive). *Done:* balance correct under
income/expense/adjustment/transfer fixtures; default account exists for new workspaces;
PROTECT verified.

**B3 — Budgeting app: Budget + Period (L)** · deps: B1 · spec: `docs/tasks/B3-budgeting-app.md`
New consolidated app **`budgeting`** with `Budget` (successor of BudgetAccount; optional display
currency; cadence `monthly` | `every N weeks` + anchor | `custom`) and `Period` (no `weeks`
field; `is_custom`). Lazy auto-creation: on any access to a budget+date without a covering
period, create it (get_or_create + unique `(budget, start_date)`, concurrency-safe) and run the
copy-forward hook (filled by B4). Custom periods: explicit ranges, non-overlapping; only custom
periods editable/deletable. Legacy apps stay running until B4/B8. *Done:* touching a fresh month
materializes the period; concurrent creation yields one row; N-weeks cadence slices correctly
from the anchor incl. dates before it; changing cadence never reshapes existing periods.

**B4 — Categories re-parent + CategoryBudget (M/L)** · deps: B3 · spec:
`docs/tasks/B4-categories-categorybudgets.md`
`Category` becomes budget-scoped and persistent (ci-unique name per budget, `is_archived`).
New `CategoryBudget` in the budgeting app (period × category × currency, unique per triple);
copy-forward implemented. **Deletes the legacy allocation app `budgets`** and patches/removes
dependent legacy code (period copy service, legacy budget-summary report, export sections).
API nests under `/budgets/...` (design §3/§4). *Done:* categories survive across periods;
per-period planned amounts independent (editing July never touches June — tested).

**B5 — Transactions rework (L)** · deps: B2, B4
`Transaction`: add `account` FK (PROTECT), `adjustment` to type choices, optional
`original_amount`/`original_currency` (must both be set or both null; original_currency must
differ from the account currency), drop `budget_period` FK and `currency` FK (currency = the
account's). Server defaults `account` when exactly one active account exists. Period/budget
derivation helper: category→budget + date→period (creating the period lazily via B3). Editing may
change account, category, date — derivation follows. Composite indexes: `(account, date)`,
`(workspace, date)`, `(category, date)`. Category is optional (uncategorized affects account
balance, excluded from budget actuals). *Done:* CRUD + derivation + single-account defaulting +
facet validation tested; adjustment type affects balance but is excluded from income/expense
reporting.

**B6 — Transfers (M)** · deps: B2
New `Transfer` model per diagram + service + `/transfers` CRUD. Same currency ⇒ one amount (both
sides equal, validated); different currencies ⇒ both amounts required (rate implied, not stored).
Affects both account balances; never income/expense. From/to must differ and belong to the
workspace. *Done:* both variants move balances correctly; validation matrix tested.

**B7 — Planned transactions alignment (S)** · deps: B5
`PlannedTransaction` gets the same shape: account FK, no period FK, no own currency FK; the
execute-planned Celery task creates the real transaction on the planned account (idempotency
guard kept, `celery-tasks` skill). *Done:* execution produces a correct transaction; task retry
semantics unchanged.

**B8 — Remove legacy apps + rebuild reports (M/L)** · deps: B5, B6, B7
Delete apps `currency_exchanges`, `exchange_shortcuts`, `period_balances`, **`budget_accounts`,
`budget_periods`** (routers, services, tests, factories), the legacy per-workspace
`workspaces.Currency` model and its `/workspaces/currencies` endpoints, and the legacy `General`
BudgetAccount creation in `create_workspace`. Rebuild `reports`: `budget-summary` (planned vs
actual per category for a budget+period, computed from budgeting models + transactions) and
`current-balances` (per account + per currency totals). *Done:* no references to deleted apps
anywhere; report numbers match fixtures computed by hand.

**B9 — Fresh migrations + test infrastructure (M)** · deps: B1–B8
Delete **all** migration files in every app; generate new initial migrations; rebuild Factory Boy
factories, `conftest.py`, and seeds for the new schema; full test suite green on a fresh database.
Decision 10 applies: no schema-evolution compatibility with old databases, anywhere. *Done:*
`manage.py migrate` from empty DB succeeds; whole suite passes; `makemigrations --check` clean.

**B10 — GDPR v3 export + account deletion (M)** · deps: B9
`export_all_data` v3: accounts, transfers, budgets/periods/categories/category-budgets,
transactions (incl. original facet), planned — no period balances, no shortcuts. Main import
accepts v3 only. `delete_account` explicit deletion order per design doc §7 (transfers,
transactions, planned, category budgets, periods, categories, budgets, accounts, workspace
currencies, workspace) — defense-in-depth per `data-deletion-gdpr`. *Done:* export→wipe→import
round-trip reproduces balances exactly; deletion leaves zero orphans (tested against PROTECT
chains).

**B11 — Legacy import endpoint (L)** · deps: B10
`POST /users/import-legacy` implementing design doc §6.1 in full: v1→v2 normalization reuse;
ISO mapping with `is_custom` fallback; idempotent `Main <CODE>` account creation; budget
accounts→Budgets; periods→`is_custom` Periods preserving exact ranges; category merge by
case-insensitive name per budget; allocations→CategoryBudgets; transactions→`Main <CODE>` by
currency; exchanges→Transfers; **linked-transaction dedup** (exact match first: date + amount +
currency + type + description equal to the exchange's; fallback: date/amount/currency/type +
description matching `Currency exchange: * → *` or `<FROM> to <TO>` case-insensitive; each
transaction consumed at most once); opening balances solved from latest exported closing
balances; response = verification report (per-currency computed vs expected balance, created
counts, deduped list) with mismatches as warnings, not failures. Rate-limited like GDPR import.
*Done:* fixture built from a real old-format export imports with balances matching and both
linked-pair conventions deduped; re-import doesn't duplicate accounts.

**B12 — Demo data + opt-in sample data (S)** · deps: B9
Rewrite `workspaces/demo_fixtures.py` for the new model (accounts, transfers, budgets with
cadences, categories). Registration gains a "start with sample data" flag (default **off**);
`create_workspace(create_demo=...)` honors it. *Done:* fresh registration is empty but usable
(default account, default budget, current period, starter categories); flag adds sample records.

### Track F — Frontend (F1 after B-track API stabilizes; F2–F6 parallelizable after F1)

**F1 — Navigation shell (M)** · deps: B8
New sidebar per Part I target; routes added (`/accounts`) and removed (`/exchanges`, `/balances`,
`/budget-periods`, `/budget-accounts`, top-level `/categories`); workspace switcher stays top.
Old pages/components deleted with their routes. *Done:* 7 destinations; no dead links; removed
concepts absent from all labels.

**F2 — Accounts UI (M)** · deps: F1, B2
Accounts section: card per account (name, type icon, balance, currency chip only when
multi-currency); create/edit/archive; "Set balance…" opens an adjustment flow (user types the
real balance, app computes and shows the delta before saving). Archived accounts behind a toggle.
*Done:* full lifecycle through UI; single-account workspace shows one card and no account
concepts elsewhere.

**F3 — Transfers UI (M)** · deps: F2, B6
Transfer form (from Accounts + the global add action): last-used pair preselected (persisted per
user/workspace), auto-filled when exactly two active accounts; cross-currency shows both amount
fields + implied rate readout; same-currency shows one. Transfer history list with "Repeat"
(prefills all but amounts/date). Delete exchange modals/pages and shortcut management UI.
*Done:* weekly PLN→USD flow takes amounts-only typing after the first time; no exchange UI
remains.

**F4 — Budget view (L)** · deps: F1, B3, B4
Budget page = category table (planned | actual | remaining, per currency column group when
multi-currency) + period switcher (current period default; past periods read as historical
plan-vs-actual, decision 9) + inline category management (add/rename/archive) + budget settings
(name, color/icon, cadence with N-weeks input, custom-period management for `is_custom` budgets).
Planned-amount cells editable in place. *Done:* monthly ritual = tweak pre-filled numbers;
history browsable; cadence changes visible from next period only.

**F5 — Transactions UI (M)** · deps: F1, B5
List: account column + filter (hidden at one account), adjustment rows visually distinct,
original-amount secondary line ("−51.20 zł · $12.99"). Form: account picker (hidden at one
account), "Paid in another currency?" toggle revealing original amount+currency, category
optional, date inline picker kept. Editing can move a transaction between accounts (bulk
reassignment of a filtered selection — needed post-legacy-import to split `Main`). *Done:*
single-currency single-account user sees zero new complexity; bulk account reassignment works.

**F6 — Dashboard + Planned rebuild (M)** · deps: F2, F4
Dashboard on the new model: account balance cards, current-period budget progress, recent
records. Planned page aligned to account-based records. *Done:* no component reads removed
endpoints; dashboard follows `dataviz`-consistent styling with existing tokens.

**F7 — Onboarding (S)** · deps: F1, B12
Registration: workspace name + **one currency** + optional sample-data checkbox (default off).
First login lands on a usable workspace (default account/budget/period/starter categories from
B12). *Done:* register → first expense recorded in ≤ 3 interactions after login.

**F8 — Legacy import UI (S)** · deps: F1, B11
Settings/profile: upload legacy export JSON → progress → render the verification report
(per-currency balance check, created counts, deduped linked transactions) with guidance to
reconcile warnings via account adjustments. *Done:* full old→new cutover achievable by a
non-technical user from the UI.

### Track P — Receipt parser service (independent; anytime)

**P1 — Contract (S)** · deps: —
`services/receipt-parser/CONTRACT.md`: versioned JSON schema — items (name, quantity, unit price,
line total), total, optional currency/date/merchant, per-field confidence + warnings, structured
error shape. ≥ 3 worked examples (typical, partial, unreadable). *Done:* schema reviewed and
frozen as v1.

**P2 — FastAPI service (M)** · deps: P1
`POST /parse` (multipart JPEG/PNG/HEIC/PDF → contract JSON), `GET /health`; bearer token (env);
OpenAI-compatible chat-completions client (env: base URL, model, key) — local (Ollama/vLLM) or
hosted by config only; PDF pages rendered to images, multi-page merge; stateless, nothing
persisted; unreadable input → contract error, never 500. Dockerfile + compose service + README.
*Done:* contract tests green against a mocked model; provider swap = env change.

**P3 — Quality harness (M)** · deps: P2
Fixture receipts (incl. PLN, multiple formats/languages) with expected outputs; scoring script
(item recall, totals accuracy); document a recommended local vision model and its measured
scores. *Done:* one command prints per-fixture scores against a live model.

### Phase 2 — Receipts in Denarly (after Track B+F merged)

**R1 — Attachment storage backend (M)** · deps: B9
`TransactionAttachment` model (multiple per transaction; image/PDF; size-capped); private bucket
in existing S3-compatible storage, short-lived signed URLs (`docker-infra` dual-URL rules);
upload/download/delete endpoints role-gated like the transaction. GDPR: files in export, deleted
with transaction/account/user. *Done:* round-trip works; direct bucket access denied; deletion
verified in storage.

**R2 — Line items backend (S)** · deps: B9
`TransactionItem` (ordered; name, quantity, unit price, line total) child of Transaction; CRUD
nested under the transaction. Items are informational — transaction `amount` stays the source of
truth; API returns items sum so the UI can hint mismatches. In GDPR v3 export. *Done:* CRUD +
ordering tested; export includes items.

**R3 — Line items editor UI (M)** · deps: R2, F5
Items table in transaction detail: add/edit/reorder/delete; non-blocking mismatch hint when
Σitems ≠ amount. Fully functional with no parser configured. *Done:* manual item entry pleasant
(keyboard row-to-row); hint never blocks saving.

**R4 — Attachments UI (S)** · deps: R1, F5
Upload (file picker + mobile camera capture), thumbnail/preview via signed URLs, PDF indicator,
delete with confirm. *Done:* attach/view/remove from transaction detail on desktop + mobile
viewport.

**R5 — Extraction integration (L)** · deps: R3, R4, P2
Env-configured parser URL + token; unset ⇒ every extraction affordance hidden (UI identical to
manual-only). "Extract items" on an attachment dispatches a Celery task calling the parser;
pending state on the transaction; result opens a **review screen** (low-confidence fields
flagged per contract warnings; user edits then confirms replace/append); failure = retryable
error state, never silent, never blocking manual work. *Done:* end-to-end against a live parser;
outage degrades gracefully; no-config renders zero dead buttons.

**R6 — Receipt-first creation (M)** · deps: R5
"New transaction from receipt": upload → extraction → pre-filled transaction form (amount =
detected total, date if detected, items populated, attachment linked); user picks
account/category, confirms; cancel saves nothing. *Done:* grocery receipt → confirmed transaction
in one flow; cancel leaves no residue (incl. stored file).

**R7 — Privacy/legal update (S)** · deps: R1
Receipts are personal data processed partly by a configurable LLM service: update
`privacy-policy.md` (+ terms if needed), bump version for re-consent, `seed_legal_documents`.
*Done:* legal pages describe attachment storage and optional external processing; re-consent
triggers.

### Phase 3 — UI/UX consistency (after Track F)

**U1 — Primitive audit + fixes (M)** · deps: F1–F6
Inventory every primitive (inputs, selects, buttons, modals, date pickers, tables) against
`design/tokens.md`: borders (the known dropdown-border defect), focus rings, radii, spacing,
hover/disabled, dark-mode parity. Fix at primitive level; checklist recorded in
`design/components.md`. *Done:* inventory complete; all listed defects fixed or ticketed;
dropdown borders correct in both themes everywhere.

**U2 — Interaction patterns + sweep (M)** · deps: U1
One canonical pattern each: create/edit/delete flow, destructive confirm, validation + error
display, empty states, loading states — documented in `design/patterns.md`; sweep all screens to
conform. *Done:* same action type behaves identically everywhere; deviations fixed.

### Docs

**D1 — Documentation rewrite (M)** · deps: B12, F8
`docs/architecture.md` (new hierarchy + diagram), `README.md` (features, quick start incl. parser
service + legacy import cutover guide), `AGENTS.md` + affected `.agents/skills/` (model map in
`data-deletion-gdpr`, scoping in `django-backend`), `docs/permissions.md`. Delete/rewrite stale
references to removed concepts. *Done:* grep for forbidden terms (Part I) returns nothing in
docs; cutover guide tested by following it verbatim.

---

## Progress Tracker
- [x] B1 Global currencies
- [x] B2 Accounts app
- [x] B3 Budget + Period rework
- [x] B4 Categories + CategoryBudget
- [x] B5 Transactions rework
- [x] B6 Transfers
- [x] B7 Planned alignment
- [x] B8 Remove legacy apps + reports
- [x] B9 Fresh migrations + test infra
- [x] B10 GDPR v3 + deletion
- [x] B11 Legacy import endpoint
- [x] B12 Demo data + opt-in samples
- [x] F1 Navigation shell
- [x] F2 Accounts UI
- [x] F3 Transfers UI
- [x] F4 Budget view
- [x] F5 Transactions UI
- [x] F6 Dashboard + Planned
- [x] F7 Onboarding
- [x] F8 Legacy import UI
- [x] P1 Parser contract
- [x] P2 Parser service
- [x] P3 Quality harness
- [x] R1 Attachment storage
- [x] R2 Line items backend
- [x] R3 Line items UI
- [x] R4 Attachments UI
- [x] R5 Extraction integration
- [x] R6 Receipt-first creation
- [x] R7 Privacy/legal update
- [ ] U1 Primitive audit + fixes
- [ ] U2 Interaction patterns
- [x] D1 Documentation rewrite

## Dependency Graph
```
B1 ─► B2 ─► B5 ─► B7 ─┐         P1 ─► P2 ─► P3   (independent track)
B1 ─► B3 ─► B4 ─► B5  │
      B2 ─► B6 ─┬► B8 ─► B9 ─► B10 ─► B11 ─► F8
      B5 ───────┘        B9 ─► B12 ─► F7
B8 ─► F1 ─► F2 ─► F3          B9 ─► R1 ─► R4 ─► R5 ─► R6
      F1 ─► F4 ─► F6          B9 ─► R2 ─► R3 ─► R5   (R5 also needs P2)
      F1 ─► F5                R1 ─► R7
F1–F6 ─► U1 ─► U2             B12,F8 ─► D1
```

## Suggested execution order
1. B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9 (the redesign core; P1–P3 in parallel anytime)
2. B10 → B11 → B12, then F1 → (F2, F4, F5 in parallel) → F3, F6 → F7, F8
3. R1 + R2 in parallel → R3, R4 → R5 → R6, R7
4. U1 → U2 → D1
