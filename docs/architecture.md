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
│     │     ├── TransactionItem        (ordered receipt line items - informational)
│     │     └── TransactionAttachment  (receipt image/PDF in private storage)
│     ├── Transfer           (money moved between two accounts; replaces exchanges)
│     └── PlannedTransaction (scheduled future transaction on an account)
│
└── Budget                   (a plan with a cadence)
      ├── Category           (persistent, budget-scoped)
      └── Period             (derived from cadence, or an explicit custom range)
            └── CategoryBudget (planned amount per category, per period)
```

### Key principles

| Concept | Rule |
|---------|------|
| **Account balance** | Computed: `opening_balance + Σ(transactions) ± Σ(transfers)`. Never stored. |
| **Currency** | A global ISO 4217 catalog; each workspace enables a subset. A transaction's currency *is* its account's currency. |
| **Default account** | An account may be flagged the default for its currency - at most one per `(workspace, currency)`, enforced by a partial-unique constraint (`one_default_account_per_currency`). It drives account auto-selection when a parsed receipt's currency is known. |
| **Periods** | Derived from a budget's cadence (monthly / every-N-weeks) and materialized on demand - not a table of pre-created rows. Custom-cadence budgets skip derivation: their periods are explicit, non-overlapping, user-defined ranges (admin-managed). |
| **Transfers** | Replace the old currency-exchange records. Cross-currency transfers carry both amounts + an implied rate. |
| **Original-amount facet** | A transaction may record what was actually paid in another currency (converted card payments); informational, excluded from aggregates. |
| **Adjustments** | A transaction type that reconciles a balance to a target ("Set balance"); excluded from income/expense totals. |
| **Attachments** | Receipt bytes live in a private S3 bucket; rows hold metadata; access is via short-lived signed URLs only. |

### Multi-Workspace Support

- **Creation**: `POST /api/workspaces/` creates a workspace, enables the chosen
  currency, and seeds a "Main" account (flagged as the default for its currency)
  + a "General" budget. Registration can optionally add sample data.
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
│   ├── services/base.py    # delete_workspace_financial_records (dependency-ordered)
│   └── idempotency.py      # Idempotency-Key create dedup (transactions + planned)
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

**Planned transaction execution** - the service sets `status='done'` + `payment_date`,
then dispatches `execute_planned_transaction.delay(id)`. The worker re-fetches with
`select_for_update()`, guards idempotency via `transaction_id`, and creates the
`Transaction` on the planned account.

**Receipt extraction** - `POST .../attachments/{id}/extract` marks the attachment
`pending` and dispatches `extract_attachment.delay(id)`. The worker reads the stored
file, calls the parser's `/parse`, and records `done` + the contract result or a
retryable `failed` + error. It never raises, so manual work is never blocked. The UI
polls `GET .../extraction`.

### Authentication Layers

1. **JWT token** validates user identity.
2. **Workspace membership** verifies access to the active workspace.
3. **Role permission** - `ADMIN_ROLES` (owner/admin) gate accounts, budgets, and
   currencies; `WRITE_ROLES` (owner/admin/member) gate day-to-day records.
4. **Resource ownership** - every query is workspace-scoped.

On top of these layers, the public auth endpoints (register, login, verify-2fa) are
rate-limited and return `429` when exceeded - per IP **and** per account (login email,
registration email, 2FA user), so rotating source IPs cannot reset the counters. The
client IP is taken from `X-Forwarded-For` only when `TRUSTED_PROXY_COUNT` names the
exact number of trusted proxies in front of the API (default `0` → `REMOTE_ADDR`,
which clients cannot spoof). Changing a password stamps `password_changed_at` and
invalidates every refresh token issued before the change. 2FA secrets are
Fernet-encrypted with a dedicated `TWO_FACTOR_ENCRYPTION_KEY` (empty → legacy
`SECRET_KEY`-derived key), and TOTP codes are single-use (timestep replay guard).

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
│   ├── modals/budgets/     # PeriodFormModal (custom-period add/edit)
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
period" context - the old `BudgetAccountContext` / `BudgetPeriodContext` were removed.
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
| `budgeting_budget` / `_period` / `_categorybudget` | Budgets, periods (cadence-derived or custom), planned amounts |
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
in another workspace, so IDs in other workspaces are not leaked. This is intentional -
do not change to 404.

## Environment Configuration

### Backend

| Variable | Purpose |
|----------|---------|
| `POSTGRES_*` | Database connection |
| `REDIS_URL`, `CELERY_*` | Celery broker/result backend |
| `SECRET_KEY`, `JWT_SECRET_KEY` | Django + token signing |
| `TWO_FACTOR_ENCRYPTION_KEY` | 2FA secret encryption (Fernet; empty = derive from `SECRET_KEY`) |
| `TRUSTED_PROXY_COUNT` | Trusted reverse proxies for client-IP parsing (0 = ignore `X-Forwarded-For`) |
| `RATE_LIMIT_*` | Rate-limit thresholds/windows (per-IP and per-account) |
| `USE_S3_STORAGE`, `S3_*` | Object storage for attachments |
| `PARSER_URL`, `PARSER_API_TOKEN` | Receipt parser (empty `PARSER_URL` disables extraction everywhere) |
| `DEMO_MODE` | Disable registration when true |

### Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend API base URL |
| `VITE_DEMO_MODE` | Hide registration link when true |

## Deployment

`docker-compose.yml` runs: `db` (Postgres), `redis`, `storage` (S3-compatible),
`api`, `ui`, `worker`, `beat`, plus `parser` (optional, `--profile parser`) and
`node` (dev toolchain, `--profile tools`). Every value - credentials, service
hostnames, published ports - comes from `.env` (see `example.env`).

For local development `./dev.sh up` runs only the backing services and
`./dev.sh backend` / `./dev.sh frontend` run the app - in their containers by
default, or on the host with `DEV_TARGET=host`. `./dev.sh up --full` runs the
whole stack in Docker, which is also how it deploys.

The receipt parser is fully optional: with `PARSER_URL` unset, the backend reports
extraction as disabled and the UI hides every extraction affordance.
