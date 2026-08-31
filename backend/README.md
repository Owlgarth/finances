# Budget Tracker API (Django)

A Django-Ninja REST API for multi-tenant budget tracking with workspace-based access control.

## Project Structure

```
backend/
├── config/                 # Django project configuration (settings, urls, celery)
├── common/                 # Shared utilities (JWT auth, permissions, storage, mixins)
├── core/                   # Auth + legal endpoints, shared schemas (see Apps Overview)
├── users/                  # Custom user model, GDPR export/import, legacy import
├── workspaces/             # Multi-tenant workspaces, members, enabled currencies
├── currencies/             # Global ISO 4217 catalog + per-workspace enablement
├── accounts/               # Money-holding accounts + computed balances
├── budgeting/              # Budget, Period, CategoryBudget
├── categories/             # Budget-scoped categories
├── transactions/           # Transactions, line items, attachments, extraction
├── transfers/              # Transfers between accounts
├── planned_transactions/   # Scheduled transactions
└── reports/                # Budget summaries and current balances
```

## Apps Overview

| App | Purpose |
|-----|---------|
| `core` | Auth endpoints (`/api/auth/*`: register, login, 2FA, refresh, email verification/change, password reset), legal document endpoints, shared Pydantic schemas (incl. pagination), legal seed templates + management commands (`seed_legal_documents`, `init_storage_buckets`) |
| `users` | Custom User model (email auth); GDPR export/import; legacy (pre-redesign) import |
| `workspaces` | Multi-tenant workspaces, role-based access (owner/admin/member/viewer), enabled currencies |
| `currencies` | Global ISO 4217 currency catalog; workspaces enable a subset |
| `accounts` | Money-holding accounts (cash/bank/other); balances computed from transactions ± transfers |
| `budgeting` | `Budget` (plan + cadence), `BudgetCurrency` (ordered per-budget currency set), derived `Period`, `CategoryBudget` (planned amount per period) |
| `categories` | Persistent, budget-scoped categories |
| `transactions` | Income/expense/adjustment records; `TransactionItem` (receipt lines); `TransactionAttachment` (+ receipt extraction) |
| `transfers` | Money moved between accounts, incl. cross-currency with implied rate |
| `planned_transactions` | Scheduled transactions with status tracking (pending/done/cancelled) |
| `reports` | Budget summary (planned vs actual) and current balances (per account + per currency) |

## Common Module (`common/`)

Shared utilities used across the project:

- **`auth.py`**: JWT authentication
  - `JWTAuth` - Django-Ninja security class; validates access tokens (rejecting `refresh`/`2fa_pending` types), fetches the user, checks `is_active`
  - `WorkspaceJWTAuth` - `JWTAuth` plus an active `current_workspace` and membership check (400/403 when missing); caches the member role on the request
  - `create_access_token(user)` - access JWT with `user_id`, `email`, `current_workspace_id`, `iat`, `exp`
  - `create_refresh_token(user)` / `consume_refresh_token(token)` - long-lived refresh token; consumption is one-time via a `jti` cache entry
  - `create_temp_token(user)` / `consume_temp_token(token)` - single-use 5-minute `2fa_pending` token issued by login when 2FA is enabled
  - `user_to_schema(user)` - Converts User model to API schema
- **`crypto.py`**: `encrypt_secret()` / `decrypt_secret()` - Fernet encryption for 2FA secrets (`TWO_FACTOR_ENCRYPTION_KEY`, with a legacy `SECRET_KEY`-derived fallback)
- **`email.py`**: Email sending via Celery
  - `EmailService.send_email()` - Dispatches email to Celery task (with sync fallback)
  - `EmailService._send_sync()` - Synchronous email rendering and SMTP delivery
- **`enums.py`**: `TotalsLabel` - shared labels for totals aggregation (the "Uncategorized" bucket)
- **`exceptions.py`**: `ServiceError` base class and subclasses (`NotFoundError`, `AuthenticationError`, `ValidationError`, `PermissionDeniedError`); a global handler in `config/urls.py` maps them to HTTP responses automatically
- **`idempotency.py`**: Stripe-style `Idempotency-Key` dedup for transaction and planned-transaction creates (24 h TTL, unique per key + user + workspace)
- **`json_encoder.py`**: `GDPREncoder` - JSON encoder handling `Decimal`/`datetime`/`date` for GDPR exports
- **`models.py`**: `WorkspaceScopedModel` - abstract base with a workspace FK, audit fields, and `for_workspace()` on the default manager
- **`permissions.py`**: `require_role(user, workspace_id, allowed_roles)` - raises 403 unless the user is a workspace member with an allowed role; returns the role
- **`querysets.py`**: `WorkspaceScopedQuerySet` - `.for_workspace(workspace_id)` filtering used by every workspace-scoped model
- **`services/base.py`**: `delete_workspace_financial_records(workspace_id)` - deletes a workspace's domain records in dependency order (used by workspace deletion, account deletion, and account reset)
- **`storage.py`**: `StorageService` - S3-compatible object storage operations; methods no-op when `USE_S3_STORAGE` is off
- **`tasks.py`**: Celery tasks
  - `send_email_task` - Async email sending with retry (3 retries, exponential backoff)
- **`throttle.py`**: `rate_limit`, `rate_limit_account`, `rate_limit_by_key` decorators - cache-backed 429 rate limiting (by IP, by account, or by arbitrary key)
- **`tokens.py`**: `TimestampSigner` token generation/verification for email verification and email change
- **`utils.py`**: `get_client_ip(request)` - client IP honoring `TRUSTED_PROXY_COUNT` (the right-most trusted `X-Forwarded-For` entry, never the spoofable first one)
- **`tests/mixins.py`**: Test utilities
  - `AuthMixin` - Provides authenticated test client with user/workspace setup
  - `APIClientMixin` - HTTP client helpers for API testing

## Service Layer Convention

Business logic is extracted from endpoints into `<app>/services.py` files:

```
transactions/
├── api.py        # Thin wrapper: parse request → call service → return response
├── services.py   # Business logic: create_transaction, update_transaction, delete_transaction
└── tasks.py      # Celery tasks (optional): async side effects dispatched by services
```

Endpoints should not contain database operations beyond workspace validation. All logic that involves multiple model writes, balance updates, or atomic operations lives in services.

Apps with service files: `accounts`, `budgeting`, `categories`, `transactions`, `transfers`, `planned_transactions`, `currencies`, `reports`, `workspaces`.

Apps with Celery tasks: `common` (`send_email_task`), `transactions` (`extract_attachment`), `planned_transactions` (`execute_planned_transaction`) - consistent with `docs/architecture.md`. Services dispatch tasks via `task.delay()` directly - no wrapper methods. Tasks delegate DB operations to service classes (e.g., `TransactionService.create()`).

## JWT Authentication

### How It Works

1. **Login**: User sends email/password → server validates → returns an access + refresh JWT pair; when 2FA is enabled, a short-lived single-use temp token (`2fa_pending`, 5 minutes) is returned instead and exchanged for the pair at `POST /api/auth/verify-2fa`
2. **Access token payload**:
   ```json
   {
     "user_id": "123",
     "email": "user@example.com",
     "current_workspace_id": "456",
     "iat": 1234567890,
     "exp": 1234571490
   }
   ```
3. **Refresh tokens**: type-`refresh` JWTs with a `jti` claim, valid for `JWT_REFRESH_TOKEN_EXPIRE_DAYS` (7 days by default). Each is consumed one-time at `POST /api/auth/refresh` (the `jti` is cached for the token's remaining lifetime), returning a rotated token pair. Refresh tokens issued before the user's last password change are rejected.
4. **Protected Endpoints**: Include `Authorization: Bearer <token>` header
5. **Validation**: `JWTAuth` decodes the token (rejecting `refresh` and `2fa_pending` types), fetches the user, checks `is_active`; `WorkspaceJWTAuth` additionally requires an active current workspace and membership (400/403 when missing) and caches the member role for `require_role`

### Configuration (.env)

```bash
JWT_SECRET_KEY=your-jwt-secret-key-here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
```

### Usage in Endpoints

```python
from ninja import NinjaAPI
from common.auth import JWTAuth

api = NinjaAPI()

@api.get('/protected', auth=JWTAuth())
def protected_endpoint(request):
    user = request.auth  # Authenticated User instance
    return {'email': user.email}
```

## Role-Based Access Control

The API uses role-based permissions for workspace operations:

| Role | Can Create | Can Update | Can Delete | Notes |
|------|-----------|-----------|-----------|-------|
| `owner` | Yes | Yes | Yes | Full access, can manage members |
| `admin` | Yes | Yes | Yes | Cannot manage other admins |
| `member` | Yes | Yes | Yes | Cannot manage members/settings |
| `viewer` | No | No | No | Read-only access |

## Starter & Demo Fixtures

Every new workspace gets a **usable-but-empty** starter setup via
`create_starter_fixtures()`: a "Main" account (flagged as the default for its
currency), a "General" budget with a few starter categories, and the current
period. Creation (`WorkspaceService.create_workspace` - registration, in-app
create, account reset) first enables the currency set: the primary plus silent
EUR/USD defaults, or exactly an explicit `currency_codes` list (first entry =
primary / Main-account currency); the "General" budget's currency set starts
as `[primary]`.

If the user opts in (the "Start with sample data" checkbox at registration),
`create_demo_fixtures()` additionally seeds a second (Savings) account, sample
transactions across two months (the previous month complete, the current
month up to today), a recurring savings transfer, upcoming planned
transactions, and a per-category budget estimate for every starter category
in both periods - so the dashboard, budget view, and reports have something
to show.

All starter categories are expense-type: sample income transactions are
uncategorized on purpose (income never gets estimates).

## DEMO Mode

Set `DEMO_MODE=true` in `.env` to disable new user registration.

**Use cases**: Public demos, showcases, production environments with controlled user access.

When enabled, `/api/auth/register` returns 403 Forbidden.

## API Endpoints

**Base URL**: `http://127.0.0.1:8000/api`

**Interactive Documentation**: Visit `/api/docs` for Swagger UI

All endpoints require the `Authorization: Bearer <token>` header, except the pre-login auth flows (register, login, verify-2fa, refresh, verify-email, resend-verification, forgot-password, reset-password); `request-email-change` and `confirm-email-change` are authenticated.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user with workspace (disabled in DEMO_MODE; rate limited per IP and per email - 429) |
| POST | `/api/auth/login` | Login: returns an access + refresh token pair, or a 2FA temp token when enabled (rate limited per IP and per email) |
| POST | `/api/auth/verify-2fa` | Exchange a 2FA temp token + single-use TOTP code for full tokens (rate limited per user) |
| POST | `/api/auth/refresh` | Exchange a one-time refresh token for a rotated pair (tokens issued before the last password change are rejected) |
| POST | `/api/auth/verify-email` | Verify the email address with the token from the verification email |
| POST | `/api/auth/resend-verification` | Resend the verification email (rate limited; the reply does not reveal whether the address exists) |
| POST | `/api/auth/forgot-password` | Request a password reset email (rate limited; the reply does not reveal whether the address exists) |
| POST | `/api/auth/reset-password` | Set a new password using the uidb64 + token from the reset email (rate limited) |
| POST | `/api/auth/request-email-change` | Send a confirmation email to the new address (authenticated; password required) |
| POST | `/api/auth/confirm-email-change` | Complete the email change with the token sent to the new address (authenticated) |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/me` | Get current user info |
| PATCH | `/api/users/me` | Update user profile |
| PUT | `/api/users/me/password` | Change password |
| GET | `/api/users/me/preferences` | Get user preferences |
| PATCH | `/api/users/me/preferences` | Update user preferences |
| GET | `/api/users/me/consents` | List active consents |
| POST | `/api/users/me/consents` | Record consent (terms/privacy) |
| GET | `/api/users/me/consent-status` | Check if re-consent is needed |
| DELETE | `/api/users/me/consents/{consent_type}` | Withdraw consent |
| GET | `/api/users/me/deletion-check` | Pre-check account deletion impact |
| DELETE | `/api/users/me` | Permanently delete account and all data |
| POST | `/api/users/me/reset` | Reset to a fresh post-registration state: deletes owned workspaces' data (irreversible, password required), keeps the user + credentials + preferences + other members, and rebuilds starter fixtures |
| GET | `/api/users/me/export` | Export all personal data as JSON - v3.0 (rate limited) |
| POST | `/api/users/me/import` | Import data from a v3.0 export (same-system restore) |
| POST | `/api/users/import-legacy` | Import + convert a legacy (pre-redesign) export |
| GET | `/api/users/me/2fa` | Current 2FA status |
| POST | `/api/users/me/2fa/setup` | Begin 2FA setup (returns the provisioning payload for an authenticator app) |
| POST | `/api/users/me/2fa/verify-setup` | Verify a TOTP code and enable 2FA |
| POST | `/api/users/me/2fa/disable` | Disable 2FA (password required) |
| POST | `/api/users/me/2fa/regenerate-codes` | Regenerate backup codes (password required) |

### Legal

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/legal/terms` | Get current Terms of Service |
| GET | `/api/legal/privacy` | Get current Privacy Policy |

Both endpoints live in the `core` app (`core/legal_api.py`); the database is the runtime source of truth (see Legal Documents under Setup).

### Workspaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces` | List user's workspaces |
| POST | `/api/workspaces` | Create new workspace (optional `currency_codes` list, max 20, first = primary - used verbatim; otherwise the primary `currency_code` plus silent EUR/USD defaults) |
| GET | `/api/workspaces/current` | Get current workspace |
| PUT | `/api/workspaces/current` | Update current workspace name |
| DELETE | `/api/workspaces/{id}` | Delete workspace (owner only) |
| POST | `/api/workspaces/{workspaceId}/switch` | Switch to another workspace |
| PUT | `/api/workspaces/{workspaceId}/default-budget` | Set or clear the workspace's default budget (admin+; takes an explicit workspace id so it works right after a legacy import) |

### Currencies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/currencies` | List the global ISO 4217 catalog |
| GET | `/api/workspaces/enabled-currencies` | List currencies enabled in the current workspace (stored position order - the primary first) |
| POST | `/api/workspaces/enabled-currencies` | Enable a catalog currency, or create a custom one (`custom: true`; custom currencies are always 2-decimal - no `decimals` param) (admin+) |
| PUT | `/api/workspaces/enabled-currencies` | Reorder the enabled set (`currency_codes` = the full enabled set in its new order, any permutation; 400 `currency_order_mismatch` otherwise; first = primary) (admin+) |
| DELETE | `/api/workspaces/enabled-currencies/{code}` | Disable a currency (admin+; blocked while referenced by accounts, planned amounts, budget currency sets, planned transactions, or transactions storing it as their own currency - the error enumerates the counts; the transaction original-amount facet never blocks) |

### Workspace Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces/{workspaceId}/members` | List workspace members |
| POST | `/api/workspaces/{workspaceId}/members/add` | Add new member |
| PUT | `/api/workspaces/{workspaceId}/members/{userId}/role` | Update member role |
| DELETE | `/api/workspaces/{workspaceId}/members/{userId}` | Remove member |
| POST | `/api/workspaces/{workspaceId}/members/leave` | Leave workspace |
| PUT | `/api/workspaces/{workspaceId}/members/{userId}/reset-password` | Reset member password |
| POST | `/api/workspaces/{workspaceId}/members/{userId}/reset-2fa` | Reset member 2FA (same hierarchy as reset-password; `400` when the member has no 2FA enabled) |

### Accounts (admin+ to mutate)

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/accounts` | `include_archived` | List accounts |
| GET | `/api/accounts/{id}` | - | Get account |
| POST | `/api/accounts` | - | Create account |
| PUT | `/api/accounts/{id}` | - | Update account (currency immutable) |
| PATCH | `/api/accounts/{id}/archive` | - | Archive / unarchive |
| DELETE | `/api/accounts/{id}` | - | Delete a record-free account |
| GET | `/api/accounts/{id}/balance` | - | Computed balance |

### Budgets, Periods, Categories, Category Budgets

Budget + period CRUD is admin+; categories and category-budget amounts are write (member+).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/budgets` | List (`include_inactive`) / create budget (payload carries an ordered `currency_codes` set, max 10, first = default view) |
| GET/PUT/DELETE | `/api/budgets/{id}` | Get / update (incl. `currency_codes`) / delete budget |
| PATCH | `/api/budgets/{id}/archive` | Activate / deactivate budget |
| GET/POST | `/api/budgets/{id}/periods` | List / create period |
| GET | `/api/budgets/{id}/periods/current` | Current period (`date`) - materialized on demand |
| PUT/DELETE | `/api/budgets/{id}/periods/{pid}` | Update / delete period |
| GET/POST | `/api/budgets/{id}/categories` | List (`include_archived`) / create category |
| PUT/PATCH/DELETE | `/api/budgets/{id}/categories/{cid}` | Update / archive / delete category |
| POST | `/api/budgets/{id}/categories/{cid}/merge` | Merge another category into this one (`source_category_id`): its history moves here and the source is deleted |
| GET | `/api/budgets/categories` | List categories across all of the workspace's budgets (filter pickers; `include_archived`) |
| GET | `/api/budgets/{id}/periods/{pid}/category-budgets` | List planned amounts |
| PUT | `/api/budgets/{id}/periods/{pid}/category-budgets` | Set a category's planned amount |
| DELETE | `/api/budgets/{id}/periods/{pid}/category-budgets/{cbid}` | Clear a planned amount |

### Transactions (write / member+)

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/transactions` | `date_from`, `date_to`, `account_id`, `category_id[]`, `budget_id`, `transaction_type[]`, `currency_code[]`, `search`, `amount_gte`, `amount_lte`, `ordering`, `page`, `page_size` | List transactions (paginated; `currency_code` filters by the transaction's stored own currency - account-less rows match their own - never the original-amount facet) |
| GET | `/api/transactions/totals` | same filters + `group_by` | Totals grouped by `type`, `category`, or `type,category` |
| GET | `/api/transactions/export/` | `date_from`, `date_to`, `transaction_type` | JSON file export (honors only these filters - a single type at most) |
| GET/POST/PUT/DELETE | `/api/transactions[/{id}]` | - | Get / create / update / delete (optional account; own `currency_code`, derived from the account when omitted with an account set, required when account-less; adjustments always require an account; optional `note` - free text, full-replace: an absent or null note clears) |
| POST | `/api/transactions/bulk-account` | - | Reassign many transactions to an account |
| POST | `/api/transactions/import` | - | Import transactions from a JSON file into an account (multipart upload, 5 MB max) |
| GET | `/api/transactions/frequent-descriptions` | `transaction_type[]`, `limit` | Frequent description suggestions |
| GET/PUT | `/api/transactions/{id}/items` | - | List / replace-all line items |
| GET/POST/DELETE | `/api/transactions/{id}/attachments[/{aid}]` | - | List (metadata only) / upload / delete receipt attachments |
| GET | `/api/transactions/{id}/attachments/{aid}/download` | - | Download an attachment's stored file (any member role - bytes streamed via the API; 404 `file_missing` if the stored object is gone, 503 if storage is off) |
| GET | `/api/transactions/extraction/config` | - | Whether receipt extraction is configured |
| POST | `/api/transactions/extraction/parse` | - | Parse a receipt without persisting (receipt-first create) |
| POST | `/api/transactions/{id}/attachments/{aid}/extract` | - | Queue extraction for an attachment |
| GET | `/api/transactions/{id}/attachments/{aid}/extraction` | - | Poll extraction state / result |

### Transfers (write / member+)

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/transfers` | `date_from`, `date_to`, `account_id`, `page`, `page_size` | List transfers (paginated) |
| GET/POST/PUT/DELETE | `/api/transfers[/{id}]` | - | Get / create / update / delete transfer |

### Planned Transactions (write / member+)

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/planned-transactions` | `status`, `account_id`, `currency_code[]`, `start_date`, `end_date`, `ordering`, `page`, `page_size` | List (paginated; `currency_code` filters by the planned transaction's own stored currency) |
| GET | `/api/planned-transactions/totals` | `status`, `account_id`, `group_by` | Totals grouped by `currency` or `category` |
| GET | `/api/planned-transactions/export/` | `status`, `start_date`, `end_date` | JSON file export (honors only these filters) |
| GET/POST/PUT/DELETE | `/api/planned-transactions[/{id}]` | - | Get / create / update / delete (optional account; own `currency_code`, derived from the account when omitted with an account set, required when account-less) |
| POST | `/api/planned-transactions/import` | - | Import planned transactions from a JSON file into an account (multipart upload, 5 MB max) |
| POST | `/api/planned-transactions/{id}/execute` | `payment_date` | Execute (creates a transaction carrying the plan's account and own currency) |

### Column Sorting (`ordering`)

Transaction and planned-transaction list endpoints accept an optional `ordering`
parameter, validated against a per-endpoint allowlist (regex); anything else returns
`422`. Prefix a field with `-` for descending (ascending is the default). A
deterministic id tiebreaker is always appended so pagination stays stable.

| Endpoint | Sortable fields | Default |
|----------|-----------------|---------|
| `GET /api/transactions` | `date`, `description`, `amount`, `type`, `category__name`, `account__name`, `currency__code` | `-date` |
| `GET /api/planned-transactions` | `name`, `amount`, `status`, `planned_date`, `category__name`, `account__name`, `currency__code` | `planned_date` |

### Reports

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/reports/budget-summary` | `budget_id`, `period_id` | Planned vs actual per category |
| GET | `/api/reports/budget-history` | `budget_id`, `limit` | Planned vs actual totals per currency for the budget's most recent periods (oldest first; `limit` 1-24, default 6) |
| GET | `/api/reports/current-balances` | `include_archived` | Balances per account + per-currency totals |

## Import/Export

### Full Data Export/Import (GDPR Portability)

`GET /api/users/me/export` produces a **v3.0** JSON export of all the user's
workspaces (accounts, budgets with their ordered currency sets, periods,
categories, category budgets, transactions with line items + attachments,
transfers, planned transactions).

`POST /api/users/me/import` restores a v3.0 export (same-system restore). Receipt
attachments travel as base64 and are recreated when object storage is configured.
- **Conflict strategy**: `rename` (default) renames duplicate workspaces; `skip` skips them.
- **Response**: counts of imported records plus any renamed workspaces.

### Legacy Import (pre-redesign data)

`POST /api/users/import-legacy` accepts a JSON export from an older
(period/exchange-based) version and converts it to the account-based model -
symbol→ISO currencies, one `Main <CODE>` account per currency (opening balance
solved so computed balances match), exchanges→transfers with linked-transaction
dedup, and a per-workspace **verification report** (computed vs expected balances,
deduped transactions, warnings).

## Testing

### Running Tests

```bash
# Run all tests
pytest

# Run specific app tests
pytest transactions/tests.py

# Run with coverage
pytest --cov=. --cov-report=html

# Run verbose output
pytest -v
```

### Test Utilities

**APIClientMixin** - Provides HTTP client helpers:
```python
class MyTestCase(APIClientMixin, TestCase):
    def test_something(self):
        self.get('/api/endpoint', **self.auth_headers())
        self.assertStatus(200)
```

**AuthMixin** - Sets up authenticated user with workspace:
```python
class MyTestCase(AuthMixin, TestCase):
    def test_something(self):
        # User and workspace auto-created
        response = self.client.get('/api/endpoint')
```

## Setup

### Prerequisites

- Python 3.13+
- PostgreSQL 14+
- [uv](https://github.com/astral-sh/uv) for fast Python package management

### Installation

```bash
# Create virtual environment with uv
uv venv

# Activate virtual environment
source .venv/bin/activate  # On macOS/Linux
# or
.venv\Scripts\activate     # On Windows

# uv sync with pyproject.toml
uv sync
```

### Environment Variables

Copy `example.env` to `.env` and configure:

```bash
cp example.env .env
```

Required variables:
```bash
POSTGRES_DB=finances_db
POSTGRES_USER=finances_user
POSTGRES_PASSWORD=finances_pass
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
DEMO_MODE=false
```

Legal document operator settings (optional, customize for your deployment):
```bash
LEGAL_OPERATOR_NAME=Your Company Name    # Company or individual name
LEGAL_OPERATOR_TYPE=company              # 'company' or 'individual'
LEGAL_CONTACT_EMAIL=legal@example.com    # Contact email
LEGAL_CONTACT_ADDRESS=                   # Physical address (optional)
LEGAL_JURISDICTION=Your Jurisdiction     # Legal jurisdiction
```

These settings customize the operator information in the Privacy Policy and Terms of Service pages. Supports both companies and individuals as data controllers (GDPR compliant).

### Legal Documents

The database is the runtime source of truth for legal documents. Templates serve as a one-time seed.

```bash
# Seed legal documents from templates (idempotent)
python manage.py seed_legal_documents

# Force update even if version matches
python manage.py seed_legal_documents --force
```

For self-hosted deployments, you can also edit legal documents directly via Django Admin at `/admin/core/legaldocument/`. Old versions are preserved for GDPR audit trail.

### Database Setup

```bash
# Run migrations
python manage.py migrate

# Seed the global ISO 4217 currency catalog (idempotent)
python manage.py seed_currencies

# Create superuser (optional, for admin access)
python manage.py createsuperuser
```

### Running the Server

```bash
python manage.py runserver
```

API will be available at `http://127.0.0.1:8000/api`

Interactive docs at `http://127.0.0.1:8000/api/docs`

## Docker Support

A Dockerfile is provided for containerized deployment. The image includes an entrypoint script that automatically runs database migrations, seeds the currency catalog and legal documents, and (when `USE_S3_STORAGE=true`) initializes storage buckets and collects static files before starting the server:

```bash
# Build image
docker build -t finances-backend .

# Run the server (migrations and seeding happen automatically)
docker run -p 8000:8000 --env-file .env finances-backend
```

The entrypoint uses `exec "$@"` to hand off PID 1 to uvicorn, ensuring proper signal handling for graceful shutdowns.

To run one-off commands without the entrypoint (e.g., a Django management command):

```bash
docker run --rm --entrypoint "" --env-file .env finances-backend python manage.py shell
```

## Admin Access

Access Django Admin at `http://127.0.0.1:8000/admin`

Login with superuser credentials created via `createsuperuser`.

All models are registered with admin interfaces for easy data management.
