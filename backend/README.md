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
  - `can_reset_password()` - Role-based password reset rules

- **`tests/mixins.py`**: Test utilities
  - `AuthMixin` - Provides authenticated test client with user/workspace setup
  - `APIClientMixin` - HTTP client helpers for API testing

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

When enabled, `/backend/auth/register` returns 403 Forbidden.

## API Endpoints

**Base URL**: `http://127.0.0.1:8000/backend`

**Interactive Documentation**: Visit `/backend/docs` for Swagger UI

All endpoints (except auth endpoints) require `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/backend/auth/register` | Register new user with workspace (disabled in DEMO_MODE) |
| POST | `/backend/auth/login` | Login and receive JWT token |
| GET | `/backend/auth/me` | Get current user info |
| PATCH | `/backend/auth/me` | Update user profile |
| PUT | `/backend/auth/me/password` | Change password |

### Workspaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/backend/workspaces` | List user's workspaces |
| GET | `/backend/workspaces/current` | Get current workspace |
| PUT | `/backend/workspaces/current` | Update current workspace |
| POST | `/backend/workspaces/{workspaceId}/switch` | Switch to another workspace |

### Workspace Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/backend/workspaces/{workspaceId}/members` | List workspace members |
| POST | `/backend/workspaces/{workspaceId}/members/add` | Add new member |
| PUT | `/backend/workspaces/{workspaceId}/members/{userId}/role` | Update member role |
| DELETE | `/backend/workspaces/{workspaceId}/members/{userId}` | Remove member |
| POST | `/backend/workspaces/{workspaceId}/members/leave` | Leave workspace |
| PUT | `/backend/workspaces/{workspaceId}/members/{userId}/reset-password` | Reset member password |

### Budget Accounts

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/backend/budget-accounts` | `include_inactive` | List budget accounts |
| GET | `/backend/budget-accounts/{id}` | - | Get specific account |
| POST | `/backend/budget-accounts` | - | Create new account |
| PUT | `/backend/budget-accounts/{id}` | - | Update account |
| DELETE | `/backend/budget-accounts/{id}` | - | Delete account |
| PATCH | `/backend/budget-accounts/{id}/archive` | - | Toggle archive status |

### Budget Periods

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/backend/budget-periods` | `budget_account_id` | List all budget periods |
| GET | `/backend/budget-periods/{id}` | - | Get specific period |
| GET | `/backend/budget-periods/current` | `current_date` | Get current period |
| POST | `/backend/budget-periods` | - | Create new period |
| PUT | `/backend/budget-periods/{id}` | - | Update period |
| DELETE | `/backend/budget-periods/{id}` | - | Delete period |
| POST | `/backend/budget-periods/{id}/copy` | - | Copy period with budgets/categories |

### Categories

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/backend/categories` | `budget_period_id`, `current_date` | List categories |
| GET | `/backend/categories/{id}` | - | Get specific category |
| POST | `/backend/categories` | - | Create category |
| PUT | `/backend/categories/{id}` | - | Update category |
| DELETE | `/backend/categories/{id}` | - | Delete category |
| POST | `/backend/categories/import` | - | Import categories (FormData) |
| GET | `/backend/categories/export/` | `budget_period_id` | Export categories to JSON |

### Budgets

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/backend/budgets` | `budget_period_id` | List budgets |
| POST | `/backend/budgets` | - | Create budget |
| PUT | `/backend/budgets/{id}` | - | Update budget |
| DELETE | `/backend/budgets/{id}` | - | Delete budget |

### Transactions

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/backend/transactions` | `budget_period_id`, `current_date`, `search`, `start_date`, `end_date`, `type[]`, `category_id[]`, `amount_gte`, `amount_lte` | List transactions |
| POST | `/backend/transactions` | - | Create transaction |
| PUT | `/backend/transactions/{id}` | - | Update transaction |
| DELETE | `/backend/transactions/{id}` | - | Delete transaction |
| POST | `/backend/transactions/import` | - | Import transactions (FormData) |
| GET | `/backend/transactions/export/` | `budget_period_id`, `type` | Export transactions to JSON |

### Planned Transactions

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/backend/planned-transactions` | `status`, `budget_period_id` | List planned transactions |
| POST | `/backend/planned-transactions` | - | Create planned transaction |
| PUT | `/backend/planned-transactions/{id}` | - | Update planned transaction |
| DELETE | `/backend/planned-transactions/{id}` | - | Delete planned transaction |
| POST | `/backend/planned-transactions/{id}/execute` | `payment_date` | Execute planned transaction |
| POST | `/backend/planned-transactions/import` | - | Import planned transactions (FormData) |
| GET | `/backend/planned-transactions/export/` | `budget_period_id`, `status` | Export planned transactions to JSON |

### Period Balances

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/backend/period-balances` | `budget_period_id` | List period balances |
| PUT | `/backend/period-balances/{id}` | - | Update period balance |
| POST | `/backend/period-balances/recalculate` | - | Recalculate period balances |

### Currency Exchanges

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/backend/currency-exchanges` | `budget_period_id` | List currency exchanges |
| POST | `/backend/currency-exchanges` | - | Create currency exchange |
| PUT | `/backend/currency-exchanges/{id}` | - | Update currency exchange |
| DELETE | `/backend/currency-exchanges/{id}` | - | Delete currency exchange |
| POST | `/backend/currency-exchanges/import` | - | Import currency exchanges (FormData) |
| GET | `/backend/currency-exchanges/export/` | `budget_period_id` | Export currency exchanges to JSON |

### Reports

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/backend/reports/budget-summary` | `budget_period_id` | Get budget vs actual summary |
| GET | `/backend/reports/current-balances` | - | Get current balances across currencies |

## Import/Export

Several endpoints support bulk import/export via JSON files using FormData (multipart/form-data):

| Feature | Import Endpoint | Export Endpoint |
|---------|----------------|-----------------|
| Categories | `POST /backend/categories/import` | `GET /backend/categories/export/?budget_period_id={id}` |
| Transactions | `POST /backend/transactions/import` | `GET /backend/transactions/export/?budget_period_id={id}` |
| Planned Transactions | `POST /backend/planned-transactions/import` | `GET /backend/planned-transactions/export/?budget_period_id={id}` |
| Currency Exchanges | `POST /backend/currency-exchanges/import` | `GET /backend/currency-exchanges/export/?budget_period_id={id}` |

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
        self.get('/backend/endpoint', **self.auth_headers())
        self.assertStatus(200)
```

**AuthMixin** - Sets up authenticated user with workspace:
```python
class MyTestCase(AuthMixin, TestCase):
    def test_something(self):
        # User and workspace auto-created
        response = self.client.get('/backend/endpoint')
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
POSTGRES_DB=budget_tracker
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
DEMO_MODE=false
```

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

API will be available at `http://127.0.0.1:8000/backend`

Interactive docs at `http://127.0.0.1:8000/backend/docs`

## Docker Support

A Dockerfile is provided for containerized deployment:

```bash
# Build image
docker build -t budget-tracker-backend .

# Run container
docker run -p 8000:8000 --env-file .env budget-tracker-backend
```

## Admin Access

Access Django Admin at `http://127.0.0.1:8000/admin`

Login with superuser credentials created via `createsuperuser`.

All models are registered with admin interfaces for easy data management.
