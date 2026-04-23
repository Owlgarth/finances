# Budget Tracker API (Django)

A Django-Ninja REST API for multi-tenant budget tracking with workspace-based access control.

## Project Structure

```
backend/
├── config/                 # Django project configuration (settings, urls, wsgi)
├── common/                 # Shared utilities (JWT auth, test mixins)
├── core/                   # Main API endpoints, schemas, demo data
├── users/                  # Custom user model (email-based auth)
├── workspaces/             # Multi-tenant workspace management
├── budget_accounts/        # Budget accounts within workspaces
├── budget_periods/         # Time-based budget periods
├── categories/             # Transaction categories
├── budgets/                # Budget allocations per category
├── transactions/           # Income/expense transactions
├── planned_transactions/   # Future planned transactions
├── currency_exchanges/     # Multi-currency exchange tracking
├── period_balances/        # Calculated balances per period
└── reports/                # Budget summaries and current balances
```

## Apps Overview

| App | Purpose |
|-----|---------|
| `users` | Custom User model with email authentication (no username) |
| `workspaces` | Multi-tenant workspaces with role-based access (owner/admin/member/viewer) |
| `budget_accounts` | Organizes budgets within workspaces (e.g., "Personal", "Business") |
| `budget_periods` | Time-bound periods for budget tracking (e.g., "October 2025") |
| `categories` | Transaction categories within periods (e.g., "Food", "Transport") |
| `budgets` | Allocated amounts per category and currency |
| `transactions` | Income and expense records |
| `planned_transactions` | Future transactions with status tracking (pending/done/cancelled) |
| `currency_exchanges` | Multi-currency exchange records |
| `period_balances` | Pre-calculated balances per period and currency |
| `reports` | Budget summaries and current balances by currency |

## Common Module (`common/`)

Shared utilities used across the project:

- **`auth.py`**: JWT authentication functions
  - `JWTAuth` - Django-Ninja security class for token validation
  - `create_access_token()` - Generates JWT with user_id, email, current_workspace_id
  - `decode_access_token()` - Validates and decodes JWT
  - `user_to_schema()` - Converts User model to API schema

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
└── services.py   # Business logic: create_transaction, update_transaction, delete_transaction
```

Endpoints should not contain database operations beyond workspace validation. All logic that involves multiple model writes, balance updates, or atomic operations lives in services.

Apps with service files: `transactions`, `budget_periods`, `categories`, `budgets`, `currency_exchanges`, `planned_transactions`, `period_balances`, `reports`, `workspaces`.

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

## Demo Fixtures

When a new user registers, `create_demo_fixtures()` automatically creates:
- Budget period for the previous month
- 7 sample categories (Food, Transport, Entertainment, etc.)
- Budget allocations for each category
- 14 sample transactions (income and expenses)
- 3 planned transactions
- 2 currency exchanges
- Period balances in PLN, EUR, USD

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
| GET | `/api/users/me/export` | Export all personal data as JSON (rate limited) |

### Legal

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/legal/terms` | Get current Terms of Service |
| GET | `/api/legal/privacy` | Get current Privacy Policy |

### Workspaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces` | List user's workspaces |
| POST | `/api/workspaces/` | Create new workspace |
| GET | `/api/workspaces/current` | Get current workspace |
| PUT | `/api/workspaces/current` | Update current workspace name |
| DELETE | `/api/workspaces/{id}` | Delete workspace (owner only) |
| POST | `/api/workspaces/{workspaceId}/switch` | Switch to another workspace |

### Workspace Currencies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces/currencies` | List currencies for current workspace |
| POST | `/api/workspaces/currencies` | Create a new currency (admin+) |
| DELETE | `/api/workspaces/currencies/{id}` | Delete a currency (admin+) |

### Workspace Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces/{workspaceId}/members` | List workspace members |
| POST | `/api/workspaces/{workspaceId}/members/add` | Add new member |
| PUT | `/api/workspaces/{workspaceId}/members/{userId}/role` | Update member role |
| DELETE | `/api/workspaces/{workspaceId}/members/{userId}` | Remove member |
| POST | `/api/workspaces/{workspaceId}/members/leave` | Leave workspace |
| PUT | `/api/workspaces/{workspaceId}/members/{userId}/reset-password` | Reset member password |

### Budget Accounts

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/budget-accounts` | `include_inactive` | List budget accounts |
| GET | `/api/budget-accounts/{id}` | - | Get specific account |
| POST | `/api/budget-accounts` | - | Create new account |
| PUT | `/api/budget-accounts/{id}` | - | Update account |
| DELETE | `/api/budget-accounts/{id}` | - | Delete account |
| PATCH | `/api/budget-accounts/{id}/archive` | - | Toggle archive status |

### Budget Periods

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/budget-periods` | `budget_account_id` | List all budget periods |
| GET | `/api/budget-periods/{id}` | - | Get specific period |
| GET | `/api/budget-periods/current` | `current_date` | Get current period |
| POST | `/api/budget-periods` | - | Create new period |
| PUT | `/api/budget-periods/{id}` | - | Update period |
| DELETE | `/api/budget-periods/{id}` | - | Delete period |
| POST | `/api/budget-periods/{id}/copy` | - | Copy period with budgets/categories |

### Categories

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/categories` | `budget_period_id`, `current_date` | List categories |
| GET | `/api/categories/{id}` | - | Get specific category |
| POST | `/api/categories` | - | Create category |
| PUT | `/api/categories/{id}` | - | Update category |
| DELETE | `/api/categories/{id}` | - | Delete category |
| POST | `/api/categories/import` | - | Import categories (FormData) |
| GET | `/api/categories/export/` | `budget_period_id` | Export categories to JSON |

### Budgets

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/budgets` | `budget_period_id` | List budgets |
| POST | `/api/budgets` | - | Create budget |
| PUT | `/api/budgets/{id}` | - | Update budget |
| DELETE | `/api/budgets/{id}` | - | Delete budget |

### Transactions

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/transactions` | `budget_period_id`, `current_date`, `search`, `start_date`, `end_date`, `type[]`, `category_id[]`, `amount_gte`, `amount_lte` | List transactions |
| POST | `/api/transactions` | - | Create transaction |
| PUT | `/api/transactions/{id}` | - | Update transaction |
| DELETE | `/api/transactions/{id}` | - | Delete transaction |
| POST | `/api/transactions/import` | - | Import transactions (FormData) |
| GET | `/api/transactions/export/` | `budget_period_id`, `type` | Export transactions to JSON |

### Planned Transactions

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/planned-transactions` | `status`, `budget_period_id` | List planned transactions |
| POST | `/api/planned-transactions` | - | Create planned transaction |
| PUT | `/api/planned-transactions/{id}` | - | Update planned transaction |
| DELETE | `/api/planned-transactions/{id}` | - | Delete planned transaction |
| POST | `/api/planned-transactions/{id}/execute` | `payment_date` | Execute planned transaction |
| POST | `/api/planned-transactions/import` | - | Import planned transactions (FormData) |
| GET | `/api/planned-transactions/export/` | `budget_period_id`, `status` | Export planned transactions to JSON |

### Period Balances

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/period-balances` | `budget_period_id` | List period balances |
| PUT | `/api/period-balances/{id}` | - | Update period balance |
| POST | `/api/period-balances/recalculate` | - | Recalculate period balances |

### Currency Exchanges

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/currency-exchanges` | `budget_period_id` | List currency exchanges |
| POST | `/api/currency-exchanges` | - | Create currency exchange |
| PUT | `/api/currency-exchanges/{id}` | - | Update currency exchange |
| DELETE | `/api/currency-exchanges/{id}` | - | Delete currency exchange |
| POST | `/api/currency-exchanges/import` | - | Import currency exchanges (FormData) |
| GET | `/api/currency-exchanges/export/` | `budget_period_id` | Export currency exchanges to JSON |

### Reports

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/api/reports/budget-summary` | `budget_period_id` | Get budget vs actual summary |
| GET | `/api/reports/current-balances` | - | Get current balances across currencies |

## Import/Export

Several endpoints support bulk import/export via JSON files using FormData (multipart/form-data):

| Feature | Import Endpoint | Export Endpoint |
|---------|-----------------|-----------------|
| Categories | `POST /api/categories/import` | `GET /api/categories/export/?budget_period_id={id}` |
| Transactions | `POST /api/transactions/import` | `GET /api/transactions/export/?budget_period_id={id}` |
| Planned Transactions | `POST /api/planned-transactions/import` | `GET /api/planned-transactions/export/?budget_period_id={id}` |
| Currency Exchanges | `POST /api/currency-exchanges/import` | `GET /api/currency-exchanges/export/?budget_period_id={id}` |

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
POSTGRES_DB=denarly_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
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

A Dockerfile is provided for containerized deployment. The container automatically runs migrations and seeds legal documents on startup:

```bash
# Build image
docker build -t denarly-backend .

# Run container
docker run -p 8000:8000 --env-file .env denarly-backend
```

The entrypoint script (`docker-entrypoint.sh`) executes:
1. `python manage.py migrate` — Run database migrations
2. `python manage.py seed_legal_documents` — Seed legal documents from templates
3. `uvicorn config.asgi:application` — Start the server

## Admin Access

Access Django Admin at `http://127.0.0.1:8000/admin`

Login with superuser credentials created via `createsuperuser`.

All models are registered with admin interfaces for easy data management.
