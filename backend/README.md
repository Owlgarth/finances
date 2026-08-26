# Budget Tracker API (Django)

A Django-Ninja REST API for multi-tenant budget tracking with workspace-based access control.

## Project Structure

```
backend/
├── config/                 # Django project configuration (settings, urls, celery)
├── common/                 # Shared utilities (JWT auth, permissions, storage, mixins)
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
| `users` | Custom User model (email auth); GDPR export/import; legacy (pre-redesign) import |
| `workspaces` | Multi-tenant workspaces, role-based access (owner/admin/member/viewer), enabled currencies |
| `currencies` | Global ISO 4217 currency catalog; workspaces enable a subset |
| `accounts` | Money-holding accounts (cash/bank/other); balances computed from transactions ± transfers |
| `budgeting` | `Budget` (plan + cadence), derived `Period`, `CategoryBudget` (planned amount per period) |
| `categories` | Persistent, budget-scoped categories |
| `transactions` | Income/expense/adjustment records; `TransactionItem` (receipt lines); `TransactionAttachment` (+ receipt extraction) |
| `transfers` | Money moved between accounts, incl. cross-currency with implied rate |
| `planned_transactions` | Scheduled transactions with status tracking (pending/done/cancelled) |
| `reports` | Budget summary (planned vs actual) and current balances (per account + per currency) |

## Common Module (`common/`)

Shared utilities used across the project:

- **`auth.py`**: JWT authentication functions
  - `JWTAuth` - Django-Ninja security class for token validation
  - `create_access_token()` - Generates JWT with user_id, email, current_workspace_id
  - `decode_access_token()` - Validates and decodes JWT
  - `user_to_schema()` - Converts User model to API schema

- **`email.py`**: Email sending via Celery
  - `EmailService.send_email()` - Dispatches email to Celery task (with sync fallback)
  - `EmailService._send_sync()` - Synchronous email rendering and SMTP delivery

- **`tasks.py`**: Celery tasks
  - `send_email_task` - Async email sending with retry (3 retries, exponential backoff)

- **`services/base.py`**: Shared service helpers
  - `require_role(user, workspace_id, allowed_roles)` - Raises 403 if role not allowed
  - `get_or_create_period_balance(period_id, currency, user)` - Gets or creates balance record
  - `update_period_balance(period_id, currency, trans_type, amount, operation)` - Updates balance incrementally

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

Apps with Celery tasks: `planned_transactions` (see `tasks.py`). Services dispatch tasks via `task.delay()` directly - no wrapper methods. Tasks delegate DB operations to service classes (e.g., `TransactionService.create()`).

## JWT Authentication

### How It Works

1. **Login**: User sends email/password → server validates → returns JWT access token
2. **Token Payload**:
   ```json
   {
     "user_id": "123",
     "email": "user@example.com",
     "current_workspace_id": "456",
     "iat": 1234567890,
     "exp": 1234571490
   }
   ```
3. **Protected Endpoints**: Include `Authorization: Bearer <token>` header
4. **Validation**: `JWTAuth` class decodes token, fetches user, checks `is_active`

### Configuration (.env)

```bash
JWT_SECRET_KEY=your-jwt-secret-key-here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
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
period.

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

All endpoints (except auth endpoints) require `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user with workspace (disabled in DEMO_MODE) |
| POST | `/api/auth/login` | Login and receive JWT token |

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
| GET | `/api/users/me/export` | Export all personal data as JSON - v3.0 (rate limited) |
| POST | `/api/users/me/import` | Import data from a v3.0 export (same-system restore) |
| POST | `/api/users/import-legacy` | Import + convert a legacy (pre-redesign) export |

### Legal

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/legal/terms` | Get current Terms of Service |
| GET | `/api/legal/privacy` | Get current Privacy Policy |

### Workspaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces` | List user's workspaces |
| POST | `/api/workspaces` | Create new workspace |
| GET | `/api/workspaces/current` | Get current workspace |
| PUT | `/api/workspaces/current` | Update current workspace name |
| DELETE | `/api/workspaces/{id}` | Delete workspace (owner only) |
| POST | `/api/workspaces/{workspaceId}/switch` | Switch to another workspace |

### Currencies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/currencies` | List the global ISO 4217 catalog |
| GET | `/api/workspaces/enabled-currencies` | List currencies enabled in the current workspace |
| POST | `/api/workspaces/enabled-currencies` | Enable a catalog currency, or create a custom one (`custom: true`) (admin+) |
| DELETE | `/api/workspaces/enabled-currencies/{code}` | Disable a currency (admin+) |

### Workspace Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces/{workspaceId}/members` | List workspace members |
| POST | `/api/workspaces/{workspaceId}/members/add` | Add new member |
| PUT | `/api/workspaces/{workspaceId}/members/{userId}/role` | Update member role |
| DELETE | `/api/workspaces/{workspaceId}/members/{userId}` | Remove member |
| POST | `/api/workspaces/{workspaceId}/members/leave` | Leave workspace |
| PUT | `/api/workspaces/{workspaceId}/members/{userId}/reset-password` | Reset member password |

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
| GET/POST | `/api/budgets` | List (`include_inactive`) / create budget |
| GET/PUT/DELETE | `/api/budgets/{id}` | Get / update / delete budget |
| PATCH | `/api/budgets/{id}/archive` | Activate / deactivate budget |
| GET/POST | `/api/budgets/{id}/periods` | List / create period |
| GET | `/api/budgets/{id}/periods/current` | Current period (`date`) - materialized on demand |
| PUT/DELETE | `/api/budgets/{id}/periods/{pid}` | Update / delete period |
| GET/POST | `/api/budgets/{id}/categories` | List (`include_archived`) / create category |
| PUT/PATCH/DELETE | `/api/budgets/{id}/categories/{cid}` | Update / archive / delete category |
| GET | `/api/budgets/{id}/periods/{pid}/category-budgets` | List planned amounts |
| PUT | `/api/budgets/{id}/periods/{pid}/category-budgets` | Set a category's planned amount |
| DELETE | `/api/budgets/{id}/periods/{pid}/category-budgets/{cbid}` | Clear a planned amount |

### Transactions (write / member+)

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/transactions` | `date_from`, `date_to`, `account_id`, `category_id[]`, `budget_id`, `transaction_type[]`, `search`, `amount_gte`, `amount_lte`, `ordering`, `page`, `page_size` | List transactions (paginated) |
| GET | `/api/transactions/totals` | same filters + `group_by` | Totals grouped by `type`, `category`, or `type,category` |
| POST/PUT/DELETE | `/api/transactions[/{id}]` | - | Create / update / delete |
| POST | `/api/transactions/bulk-account` | - | Reassign many transactions to an account |
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
| GET | `/api/planned-transactions` | `status`, `account_id`, `start_date`, `end_date`, `ordering`, `page`, `page_size` | List (paginated) |
| GET | `/api/planned-transactions/totals` | `status`, `account_id`, `group_by` | Totals grouped by `currency` or `category` |
| POST/PUT/DELETE | `/api/planned-transactions[/{id}]` | - | Create / update / delete |
| POST | `/api/planned-transactions/{id}/execute` | `payment_date` | Execute (creates a transaction on the planned account) |

### Column Sorting (`ordering`)

Transaction and planned-transaction list endpoints accept an optional `ordering`
parameter, validated against a per-endpoint allowlist (regex); anything else returns
`422`. Prefix a field with `-` for descending (ascending is the default). A
deterministic id tiebreaker is always appended so pagination stays stable.

| Endpoint | Sortable fields | Default |
|----------|-----------------|---------|
| `GET /api/transactions` | `date`, `description`, `amount`, `type`, `category__name`, `account__name`, `account__currency__code` | `-date` |
| `GET /api/planned-transactions` | `name`, `amount`, `status`, `planned_date`, `category__name`, `account__name`, `account__currency__code` | `planned_date` |

### Reports

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/reports/budget-summary` | `budget_id`, `period_id` | Planned vs actual per category |
| GET | `/api/reports/current-balances` | `include_archived` | Balances per account + per-currency totals |

## Import/Export

### Full Data Export/Import (GDPR Portability)

`GET /api/users/me/export` produces a **v3.0** JSON export of all the user's
workspaces (accounts, budgets, periods, categories, category budgets, transactions
with line items + attachments, transfers, planned transactions).

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
pytest budget_accounts/tests/

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

Copy `.env.example` to `.env` and configure:

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

A Dockerfile is provided for containerized deployment. The image includes an entrypoint script that automatically runs database migrations and seeds legal documents before starting the server:

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
