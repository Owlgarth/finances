# System Architecture

This document describes the high-level architecture, data model, and system components
of Denarly after the account-based domain redesign.

## System Overview

Full-stack web application with:
- **Frontend**: React 19 SPA (Vite, TypeScript, TanStack Query)
- **Backend**: Django 6 + Django Ninja REST API
- **Database**: PostgreSQL 17
- **Authentication**: JWT (JSON Web Tokens)
- **Task Queue**: Celery with Redis broker (planned-transaction execution, receipt extraction)
- **Object storage**: S3-compatible (private media bucket for receipt attachments)
- **Receipt parser** (optional): a standalone stateless FastAPI service

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Frontend   │◄───►│      Backend     │◄───►│  PostgreSQL  │
│    (React)   │HTTP │   (Django Ninja) │ SQL │              │
└──────────────┘     └───────┬──────────┘     └──────────────┘
   Port 5173                 │  dispatches            Port 5432
                             ▼
                    ┌──────────────┐   ┌──────────────────────┐
                    │ Celery Worker│──►│ Receipt Parser (opt.)│
                    └──────┬───────┘   │  FastAPI, port 8100  │
                           │           └──────────────────────┘
                           ▼
                    ┌──────────────┐   ┌──────────────┐
                    │    Redis     │   │  S3 storage  │
                    └──────────────┘   └──────────────┘
```

## Data Model

Money-holding **accounts** are the centre of gravity. Budgets *plan* money; accounts
*hold* it. Balances and periods are **computed/derived**, never stored as mutable rows.

```
Workspace (top-level container)
│
├── WorkspaceMember          (user access + role)
├── WorkspaceCurrency        (which catalog currencies are enabled here)
│
├── Account                  (cash / bank / other; holds money in one currency)
│     ├── Transaction        (income / expense / adjustment; optional category)
│     │     ├── TransactionItem        (ordered receipt line items — informational)
│     │     └── TransactionAttachment  (receipt image/PDF in private storage)
│     ├── Transfer           (money moved between two accounts; replaces exchanges)
│     └── PlannedTransaction (scheduled future transaction on an account)
│
└── Budget                   (a plan with a cadence)
      ├── Category           (persistent, budget-scoped)
      └── Period             (derived from cadence; materialized lazily)
            └── CategoryBudget (planned amount per category, per period)
```

### Key principles

| Concept | Rule |
|---------|------|
| **Account balance** | Computed: `opening_balance + Σ(transactions) ± Σ(transfers)`. Never stored. |
| **Currency** | A global ISO 4217 catalog; each workspace enables a subset. A transaction's currency *is* its account's currency. |
| **Periods** | Derived from a budget's cadence (monthly / every-N-weeks / custom) and materialized on demand — not a table of pre-created rows. |
| **Transfers** | Replace the old currency-exchange records. Cross-currency transfers carry both amounts + an implied rate. |
| **Original-amount facet** | A transaction may record what was actually paid in another currency (converted card payments); informational, excluded from aggregates. |
| **Adjustments** | A transaction type that reconciles a balance to a target ("Set balance"); excluded from income/expense totals. |
| **Attachments** | Receipt bytes live in a private S3 bucket; rows hold metadata; access is via short-lived signed URLs only. |

### Multi-Workspace Support

- **Creation**: `POST /api/workspaces/` creates a workspace, enables the chosen
  currency, and seeds a "Main" account + a "General" budget. Registration can
  optionally add sample data.
- **Switching**: `POST /api/workspaces/{id}/switch` changes the active workspace.
- **Deletion**: `DELETE /api/workspaces/{id}` removes a workspace and all its data
  (owner only), in PROTECT-safe dependency order.

All workspace-scoped endpoints use `WorkspaceJWTAuth`, which validates the user has an
active workspace.

## Backend Architecture

### Directory Structure

```
backend/
├── config/                 # Django project config (settings, urls, celery)
├── common/                 # Shared: JWT auth, permissions, storage, test mixins
│   └── services/base.py    # delete_workspace_financial_records (dependency-ordered)
├── users/                  # Custom user model (email auth), GDPR export/import, legacy import
├── workspaces/             # Multi-tenant workspaces, members, enabled currencies
├── currencies/             # Global ISO 4217 catalog + per-workspace enablement
├── accounts/               # Money-holding accounts + computed balances
├── budgeting/              # Budget, Period, CategoryBudget (+ services)
├── categories/             # Budget-scoped categories
├── transactions/           # Transactions, items, attachments, extraction
│   ├── tasks.py            # Celery task: extract_attachment
│   ├── attachments.py      # AttachmentService (storage + extraction state)
│   └── parser_client.py    # HTTP client for the optional receipt parser
├── transfers/              # Transfers between accounts
├── planned_transactions/   # Scheduled transactions
│   └── tasks.py            # Celery task: execute_planned_transaction
└── reports/                # budget-summary (planned vs actual), current-balances
```

Each app with business logic has a `services.py`; `api.py` files are thin request
parsers that delegate to services. Apps with async work have a `tasks.py`.

### Async Task Flows

**Planned transaction execution** — the service sets `status='done'` + `payment_date`,
then dispatches `execute_planned_transaction.delay(id)`. The worker re-fetches with
`select_for_update()`, guards idempotency via `transaction_id`, and creates the
`Transaction` on the planned account.

**Receipt extraction** — `POST .../attachments/{id}/extract` marks the attachment
`pending` and dispatches `extract_attachment.delay(id)`. The worker reads the stored
file, calls the parser's `/parse`, and records `done` + the contract result or a
retryable `failed` + error. It never raises, so manual work is never blocked. The UI
polls `GET .../extraction`.

The parser is self-hosted on a machine that is not always powered on, so
"configured but offline" is a normal state rather than an error:

- `parser_client` splits failures into `ParserUnavailableError` (connection
  failure or 5xx — transient) and `ParserServiceError` (4xx — the file was
  rejected, retrying is pointless). Only the former retries.
- The async path is the resilient one: unreachable leaves the attachment
  `pending` and `extract_attachment` retries with exponential backoff (~12h by
  default) so receipts queued while the host is down are picked up when it
  returns.
- The synchronous "From receipt" preview cannot wait, so it returns **503**
  (not 400) when the host is off, letting the UI say "offline" instead of
  blaming the receipt.
- `GET /transactions/extraction/config` reports `{enabled, reachable}`, where
  `reachable` is a live `/health` probe cached for `PARSER_HEALTH_CACHE_SECONDS`.
  The UI disables and relabels extraction affordances instead of hiding them.

### Authentication Layers

1. **JWT token** validates user identity.
2. **Workspace membership** verifies access to the active workspace.
3. **Role permission** — `ADMIN_ROLES` (owner/admin) gate accounts, budgets, and
   currencies; `WRITE_ROLES` (owner/admin/member) gate day-to-day records.
4. **Resource ownership** — every query is workspace-scoped.

## Frontend Architecture

### Directory Structure

```
frontend/src/
├── api/client.ts           # Axios instance + typed API modules
├── components/
│   ├── layout/             # MainLayout, Sidebar (7 destinations), UserMenu
│   ├── common/             # Modal, Select, ConfirmDialog, formStyles, Pagination…
│   ├── accounts/           # Account/SetBalance/Transfer modals
│   ├── transactions/       # Items editor, attachments, extraction review
│   └── modals/transactions/# Transaction / Planned / NewFromReceipt modals
├── contexts/
│   ├── AuthContext.tsx         # Auth state + consent status
│   ├── WorkspaceContext.tsx    # Current workspace + role
│   ├── UserPreferencesContext.tsx
│   └── ThemeContext.tsx        # Light/dark
├── hooks/
│   ├── useDomain.ts            # useAccounts, useBudgets, useEnabledCurrencies,
│   │                          #   useMultiCurrency, useExtractionEnabled
│   └── usePermissions.ts       # canManageAccounts, canWrite, …
├── pages/                  # Dashboard, Accounts, Budgets, BudgetDetail,
│                           #   Transactions, Planned, Members, Settings
└── types/index.ts          # TypeScript interfaces
```

Periods are per-budget now, so there is no global "selected account" or "selected
period" context — the old `BudgetAccountContext` / `BudgetPeriodContext` were removed.
Period selection lives inside the Budget detail page.

### Data Fetching

TanStack Query manages server state; mutations invalidate the affected queries
(no optimistic writes, so computed balances stay honest).

```typescript
const { data } = useQuery({
  queryKey: ['transactions', page, filters],
  queryFn: () => transactionsApi.getAll(params),
})
```

## Database Architecture

### Core Tables

| Table | Purpose |
|-------|---------|
| `users_user` | User accounts |
| `workspaces_workspace` / `_workspacemember` | Workspaces + membership/roles |
| `currencies_currency` / `workspaces_workspacecurrency` | Global catalog + per-workspace enablement |
| `accounts_account` | Money-holding accounts |
| `budgeting_budget` / `_period` / `_categorybudget` | Budgets, derived periods, planned amounts |
| `categories_category` | Budget-scoped categories |
| `transactions_transaction` | Income / expense / adjustment records |
| `transaction_items` | Ordered receipt line items |
| `transaction_attachments` | Receipt file metadata + extraction state |
| `transfers_transfer` | Money moved between accounts |
| `planned_transactions_plannedtransaction` | Scheduled transactions |

### Workspace-Scoped Queries

All workspace-scoped models expose `for_workspace()`:

```python
Transaction.objects.for_workspace(workspace_id).filter(type='expense')
```

Each model declares a `WORKSPACE_FILTER` giving the ORM path to the workspace.

#### List Endpoints Security Behavior

List endpoints return empty arrays rather than 404 when a filter references a resource
in another workspace, so IDs in other workspaces are not leaked. This is intentional —
do not change to 404.

## Environment Configuration

### Backend

| Variable | Purpose |
|----------|---------|
| `POSTGRES_*` | Database connection |
| `REDIS_URL`, `CELERY_*` | Celery broker/result backend |
| `SECRET_KEY`, `JWT_SECRET_KEY` | Django + token signing |
| `USE_S3_STORAGE`, `S3_*` | Object storage for attachments |
| `PARSER_URL`, `PARSER_API_TOKEN` | Receipt parser (empty `PARSER_URL` disables extraction everywhere) |
| `PARSER_HEALTH_TIMEOUT_SECONDS`, `PARSER_HEALTH_CACHE_SECONDS` | Reachability probe timeout (3s) and cache TTL (30s) |
| `PARSER_EXTRACT_MAX_RETRIES`, `PARSER_EXTRACT_RETRY_BACKOFF`, `PARSER_EXTRACT_RETRY_BACKOFF_MAX` | Extraction retry window while the parser host is down (12 / 60s / 2h ≈ 12h) |
| `DEMO_MODE` | Disable registration when true |

### Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend API base URL |
| `VITE_DEMO_MODE` | Hide registration link when true |

## Deployment

`docker-compose.yml` runs: `denarly_db` (Postgres), `denarly_redis`, `denarly_storage`
(S3-compatible), `denarly_api`, `denarly_celery_worker`, `denarly_celery_beat`, and
`denarly_ui`.

The receipt parser is **not** in that stack — it deploys separately, next to the
self-hosted vision model, and the backend reaches it over a private mesh
(Tailscale) via `PARSER_URL`. See `services/receipt-parser/docker-compose.yml`
and that service's README § Deployment.

The parser is fully optional: with `PARSER_URL` unset, the backend reports
extraction as disabled and the UI hides every extraction affordance.
