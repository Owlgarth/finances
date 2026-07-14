# Denarly Roadmap — Initiative Descriptions

This document describes the planned initiatives for evolving Denarly from a personal tool into a
usable open-source product. It is **not** an implementation plan — each section is a problem
statement and scope definition meant to be turned into a concrete implementation plan later.

## How the initiatives relate

Two forces shape the ordering:

1. **The domain model is changing.** Initiatives 3 (hierarchy simplification) and 4 (balance
   accounts) both reshape the core data model. They must be designed **together, as one domain
   redesign**, so there is a single migration story instead of two consecutive breaking changes.
2. **The receipt pipeline is independent.** Initiatives 5 (receipt attachments) and 6 (receipt
   parsing service) touch almost none of the existing domain model and can proceed in parallel
   with the redesign.

Suggested order:

| Phase | Initiative | Why here |
|-------|-----------|----------|
| 0 | 1. Feature & complexity audit | Cheap, review-only; its output feeds directly into the domain redesign |
| 1 | 3 + 4. Domain model redesign (hierarchy + balance accounts, one design) | Highest-impact structural change; everything else builds on the new model |
| 1 (parallel) | 6. Receipt parsing service | Fully independent, separate repo/service; can start any time |
| 2 | 5. Receipt attachments & transaction items | Needs file storage plumbing; auto-fill mode depends on Phase 1-parallel service |
| 3 | 2. UI/UX consistency pass | Most valuable after workflows have stabilized, so polish isn't redone |

Initiative 2 (UI/UX) also has an "ongoing" component: fix visual defects opportunistically, but
defer the systematic consistency pass until after the redesign lands.

---

## 1. Feature & complexity audit ("de-overengineering" review)

**Priority: high (do first — it's cheap and informs everything else)**
**Type: review / decision document, no code changes**

### Problem

Denarly grew around one specific personal workflow: heavy multi-currency use with frequent
currency exchanges. Features that are natural for that workflow may be confusing, mandatory-feeling,
or simply invisible-value for users who live in a single currency. To be a viable open-source tool,
the single-currency user must have a first-class, friction-free experience, and the multi-currency
machinery must become opt-in flexibility rather than an assumed workflow.

### Goal

Produce a keep / simplify / hide-behind-opt-in / remove decision for every feature, with special
attention to currency-related machinery. The output is a short decision document that becomes
input to the domain model redesign (initiative 3+4).

### Known candidates to examine

- **Per-workspace `Currency` model** — users currently define their own currencies (name + symbol)
  per workspace instead of picking from an ISO 4217 list. Review whether a global currency table
  with per-workspace "enabled currencies" would be simpler, and whether a single-currency workspace
  can avoid seeing currency selection entirely.
- **`ExchangeShortcut`** — an entire Django app for saved currency-pair shortcuts. Useful for a
  power user exchanging PLN↔USD weekly; likely noise for everyone else.
- **`CurrencyExchange` records + `PeriodBalance.exchanges_in/exchanges_out`** — exchange tracking
  is woven into the core balance math. Review whether it can be isolated so single-currency users
  never encounter it.
- **`BudgetPeriod` manual creation, `weeks` field** — review whether periods can default to
  auto-created monthly periods with manual/custom periods as the advanced option.
- **Onboarding path** — what does a brand-new user have to understand and create before recording
  their first transaction? Count the concepts (workspace, budget account, period, currency,
  category). Target: record a first expense within a minute of registering, understanding at most
  one or two concepts.

### Acceptance criteria

- A written audit covering every user-facing feature and every model/app, each tagged
  keep / simplify / make-optional / remove, with a one-paragraph rationale.
- An explicit description of the "simple user" happy path (single currency, one budget) and which
  current concepts it can skip.
- Decisions feed into initiative 3+4's design rather than being implemented independently.

---

## 2. UI/UX consistency & polish

**Priority: medium (ongoing for defects; systematic pass after the domain redesign)**

### Problem

The UI looks acceptable at a glance but degrades on inspection: small elements are off (e.g. wrong
borders around dropdowns), and there are many inconsistencies in how similar workflows behave in
different places — the same kind of action is presented differently depending on the screen.

### Goal

One coherent design language and one predictable interaction pattern per kind of task, applied
everywhere.

### Scope

Two distinct workstreams:

1. **Visual consistency (design-system level).** Audit all primitive components (dropdowns/selects,
   inputs, buttons, modals, date pickers, tables) against the design tokens in
   `frontend/` — borders, focus rings, spacing, radii, hover/disabled states, dark-mode parity.
   Fix the primitives once so every usage inherits the fix. Produce a component inventory listing
   each primitive, where it's used, and its defects.
2. **Interaction consistency (workflow level).** Audit recurring workflows — create/edit/delete a
   record, confirm destructive actions, form validation and error display, empty states, loading
   states — and define one canonical pattern for each. Document the canonical patterns (in
   `docs/frontend.md` or the design system docs) so future features follow them.

### Constraints & notes

- The systematic workflow pass should happen **after** initiative 3+4, because the redesign will
  change or remove some screens; polishing them first is wasted work.
- Obvious visual defects (the dropdown borders etc.) can be fixed at any time as small, independent
  changes.
- Deliverable includes updated documentation of the canonical patterns, not just the fixes.

---

## 3. Simplify the account → workspace → budget account → budget period hierarchy

**Priority: super important — design jointly with initiative 4**

### Problem

The current chain is `User account → Workspace → Budget Account → Budget Period → data`. Four
nested concepts must be understood (and navigated) before any money is recorded. The naming
overlaps confusingly ("account" appears at two unrelated levels), and navigation across the chain
is cumbersome.

### Goal

Reduce the number of concepts a user must understand, rename what remains so each name is
self-explanatory, and make navigation feel like Notion's workspace model: a workspace switcher at
the top, and lightweight sections/pages inside — not a deep drill-down hierarchy.

### Direction (to be validated during design)

- **Workspace stays** as the top-level container (it also carries membership/roles and is the
  multi-tenancy boundary — that part works).
- **Budget Account is the concept under most pressure.** With initiative 4 introducing real
  balance-holding accounts, "budget account" stops being where money lives and becomes a *budget*
  — a plan/envelope over the shared money. Candidate rename: `Budget Account` → `Budget` (which
  requires renaming the current `Budget` model, e.g. to `CategoryBudget` or `BudgetLine`).
- **Budget Period should fade into the background.** Instead of a user-managed object, periods
  could be auto-created (monthly by default, configurable per budget), with custom periods as an
  advanced feature. The user thinks "February", not "create a period object first".
- Consider whether the resulting mental model is simply:
  `Workspace → (Accounts hold money) + (Budgets plan money, sliced by period)`
  — two sibling concepts instead of a four-deep chain.

### Open questions (answer during design, before planning)

- Is `Budget Account` merged away entirely, renamed, or kept as an optional grouping?
- Do periods become implicit/auto-created? What happens to period-scoped categories and category
  budgets when a new period starts (copy forward? templates?)?
- Migration story for existing data (including the demo dataset and the GDPR export/import
  format — see `data-deletion-gdpr` constraints).
- Final naming pass across UI, API, models, and docs — one name per concept everywhere.

### Acceptance criteria

- A new-user can explain the object model after one session without reading docs.
- No concept name is used for two different things ("account" only means one thing).
- Documented migration path from the current schema.

---

## 4. Balance accounts (workspace-level money accounts)

**Priority: super important — design jointly with initiative 3**

### Problem

Today, money implicitly "lives" inside budget accounts (via per-period `PeriodBalance` rows). That
conflates two different questions: **where is my money physically** (cash in PLN, Bank A account in
PLN, Bank B account in USD) and **what is that money for** (home budget, hobby budget, general
budget). In reality one bank account funds several budgets, and the current model cannot express
that.

### Goal

Introduce workspace-level **balance accounts** (working name — alternatives: *accounts*, *money
accounts*, *wallets*; note YNAB calls these "accounts" and Firefly III "asset accounts") that
represent real-world money holdings. Budget accounts (→ "budgets" after initiative 3) stop holding
money themselves and instead **source their balances from the workspace's balance accounts**.

### Core model

- A workspace has N balance accounts; each has a name, a type (cash / bank / other), and one
  currency (e.g. "Cash PLN", "Bank A PLN", "Bank B USD").
- Every transaction is associated with a balance account (the money moved in/out of somewhere) in
  addition to its budget/category (what it was for).
- A budget's available funds are derived from balance accounts, not stored per-budget. Multiple
  budgets can draw on the same balance account.
- Currency exchanges become transfers between balance accounts of different currencies — which may
  significantly simplify the current `CurrencyExchange` / `exchanges_in/out` machinery (audit
  finding from initiative 1 applies here).
- Transfers between balance accounts (same currency) become a first-class operation, distinct from
  income/expense.

### Open questions

- **Allocation semantics**: do budgets *reserve* amounts from balance accounts (envelope-style,
  sum of allocations ≤ account balance), or are budgets pure spending plans with balances shown
  informationally? This is the biggest product decision in the initiative.
- Does `PeriodBalance` survive (as a per-account, per-period snapshot for performance/history), or
  is it replaced by computed balances with opening-balance anchors?
- Reconciliation: does the user ever "correct" an account balance to match the real bank balance
  (adjustment transactions)?
- Migration: existing transactions have no balance account. Default to a single auto-created
  "Main" account per workspace/currency?
- Single-account users must not feel this: with exactly one balance account, the concept should be
  invisible (auto-selected everywhere).

### Acceptance criteria

- The PLN/USD multi-bank scenario from the problem statement is fully expressible.
- A single-currency, single-account user never has to pick an account manually.
- Balances per balance account and per budget are both visible and always consistent.

---

## 5. Receipt attachments & transaction line items

**Priority: super important**
**Depends on: file/photo storage; initiative 6 for the auto-extract mode**

### Problem

Transactions are single-line records. There is no way to keep the receipt itself, nor the
individual items purchased ("what exactly did I buy for 180 PLN at the supermarket?").

### Goal

Attach a receipt (photo, image, or PDF) to a transaction, and store **line items** (product name,
quantity/position, price) inside a transaction — entered manually or extracted automatically by
the receipt parsing service (initiative 6).

### User flows (all three must be supported)

1. **Manual attach + manual items**: open an existing transaction → attach a file → type in line
   items by hand. Works with no LLM service configured.
2. **Attach + extract**: transaction exists, receipt attached → user clicks "extract items" →
   photo is sent to the parsing service → returned items are saved as the transaction's line
   items (user can review/edit before or after saving — decide during design).
3. **Receipt-first creation**: user clicks "new transaction from receipt" → uploads photo →
   service extracts items and total → a transaction is created pre-filled (amount = receipt total,
   date if detected, line items populated); user picks category/account and confirms.

### Scope

- New `TransactionItem` model (name, quantity, unit price / line total, order) — child of
  `Transaction`. Line items are informational detail; the transaction `amount` remains the source
  of truth for balances (decide: warn when items don't sum to the amount?).
- Attachment storage: files stored in the existing S3-compatible storage (see `docker-infra`
  conventions — dual URLs, bucket policy, private bucket + signed URLs since receipts are
  sensitive personal data).
- Attachment model supports images and PDF; probably multiple attachments per transaction.
- Frontend: attachment upload UI (file picker + camera on mobile), line-item editor, extraction
  review flow.
- Integration point to the parsing service is a **configurable URL** (env var); when unset, the
  extract buttons are hidden and only manual flows exist. The parsing service must remain
  optional — the open-source tool cannot require a local LLM.

### Constraints & notes

- GDPR: attachments must be included in account data export and deleted with the account
  (see `data-deletion-gdpr`).
- Extraction should run asynchronously (Celery task calling the service), with a visible
  pending/failed state — local LLM inference can be slow.
- Extraction results are suggestions; the user must be able to correct them.

---

## 6. Receipt parsing service (standalone)

**Priority: super important**
**Independent — separate service/repo; can start immediately, in parallel with everything else**

### Problem

Item extraction from receipts requires a vision-capable LLM. That capability must not live inside
Denarly's backend: it has different dependencies, different hardware needs (local LLM), and should
be optional and swappable.

### Goal

A small standalone HTTP service that accepts a receipt/invoice as photo, image, or PDF and returns
structured JSON: the line items (name, quantity, unit price, line total), the final total, and —
if detectable — currency, date, and merchant name.

### Shape

- **FastAPI** service with essentially one endpoint: `POST /parse` (multipart file upload) →
  JSON result. Plus `GET /health`.
- Internally calls an **OpenAI-compatible API** (chat completions with image input), pointed at a
  local LLM server (e.g. Ollama/llama.cpp/vLLM) via configurable base URL, model name, and API
  key. Because the API is OpenAI-compatible, the same service works with a hosted provider if a
  user prefers that over local inference.
- PDF handling: render PDF pages to images before sending to the vision model.
- Response is a **stable, versioned JSON schema** — this schema is the contract Denarly
  (initiative 5) codes against; define it first. Include a confidence/warnings field so the client
  can flag uncertain extractions for review.
- Stateless: no database, no stored files — receives bytes, returns JSON. Auth via a simple shared
  API token. This keeps the privacy story trivial: receipts never persist outside Denarly.

### Open questions

- Which local vision model to target/recommend first (affects prompt design and quality testing).
- Sync vs async API: local inference may take tens of seconds — is a long-lived HTTP request
  acceptable (Denarly already calls it from a Celery task, so probably yes), or does the service
  need a job/poll API?
- Same repo (monorepo `services/receipt-parser/`) vs separate repository.

### Acceptance criteria

- Given a photo of a typical grocery receipt, returns items + total in the documented schema.
- Works against any OpenAI-compatible endpoint via configuration only (no code change).
- Handles JPEG/PNG/HEIC/PDF input; returns a clean, machine-readable error for unreadable input.
- Documented JSON schema, versioned, with example payloads.
