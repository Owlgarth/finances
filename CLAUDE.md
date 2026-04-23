# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Denarly** is a full-stack personal finance tracking application built with Django 6, Django Ninja, React 19, and PostgreSQL. It features multi-currency support, period-based budgeting, multi-account workspaces, and collaborative team features with role-based access control.

## Development Commands

### Backend (Django)

```bash
cd backend

# Setup (first time)
uv venv && source .venv/bin/activate
uv sync
cp example.env .env  # Configure database and secrets
python manage.py migrate

# Development server
python manage.py runserver

# Testing
pytest                                      # Run all tests
pytest -v                                   # Verbose output
pytest budget_accounts/tests/               # Run specific app tests
pytest budget_accounts/tests/test_api.py   # Run single test file
pytest -k "test_create"                     # Run tests matching pattern
pytest --cov=. --cov-report=html            # Run with coverage report

# Linting & Formatting
uv run ruff check .             # Lint
uv run ruff format .            # Format
uv run ruff check --fix .       # Auto-fix lint issues
```

**Note**: The backend uses `uv` as the package manager. Always run commands via `uv run` or with the venv activated.

### Frontend (React + Vite)

```bash
cd frontend

# Setup (first time)
npm install

# Development server
npm run dev                     # Runs at http://localhost:5173

# Build
npm run build                   # TypeScript check + Vite build
npm run preview                 # Preview production build

# Linting
npm run lint                    # ESLint check
```

### Docker (Recommended)

```bash
docker-compose up -d            # Start all services
```

Access: Frontend at http://localhost:3000, Backend API at http://localhost:8000/api, API Docs at http://localhost:8000/api/docs

## Architecture

### Data Hierarchy (Critical for Understanding)

```
Workspace (top-level container)
├── WorkspaceMember (user access and roles)
└── BudgetAccount (e.g., Personal, Business)
    └── BudgetPeriod (e.g., January 2025)
        ├── Category (e.g., Food, Transport)
        │   └── Budget (amount per category)
        ├── Transaction (income/expense records)
        ├── PlannedTransaction (scheduled future)
        ├── CurrencyExchange (conversion records)
        └── PeriodBalance (calculated summary)
```

All data operations must respect this hierarchy. For example, when adding a transaction, you must have the `budget_period_id` from the selected period.

### Backend Django Apps

| App | Purpose |
|-----|---------|
| `users` | Custom User model, `UserPreferences`, `UserConsent`; profile, password, GDPR endpoints at `/api/users/` |
| `workspaces` | Multi-tenant workspaces with role-based access; Currency model (FK to Workspace) |
| `budget_accounts` | Budget accounts within workspaces |
| `budget_periods` | Time-bound periods for budget tracking |
| `categories` | Transaction categories |
| `budgets` | Allocated amounts per category |
| `transactions` | Income/expense records |
| `planned_transactions` | Future scheduled transactions |
| `currency_exchanges` | Multi-currency exchange records |
| `period_balances` | Pre-calculated balances per period/currency |
| `reports` | Budget summaries and current balances |
| `core` | Auth endpoints (register, login) at `/api/auth/`; legal document seeding |
| `common` | Shared utilities: `auth.py` (JWT), `permissions.py` (`require_role`), `querysets.py` (`WorkspaceScopedQuerySet`), `throttle.py` (rate limiting), `services/base.py`, test mixins/factories |

### API Routing

All API routes are registered in `backend/config/urls.py`:
- Base URL: `/api/`
- Each Django app has its own `api.py` with a Router that's added to the main NinjaAPI instance
- Interactive docs: `/api/docs`

### Frontend Structure

- **`api/client.ts`**: Axios instance with auth interceptors (401 → redirect to login)
- **`components/layout/`**: `MainLayout`, `Sidebar`, `UserMenu` — responsive sidebar navigation
- **`contexts/`**: Global state (Auth, Workspace, BudgetAccount, BudgetPeriod)
- **`hooks/usePermissions.ts`**: Role-based permission checks
- **`hooks/useMediaQuery.ts`**: Responsive breakpoint detection

## Security Model

The application uses a **four-layer security model** that must be enforced in all backend endpoints:

1. **Authentication**: JWT token validation (`JWTAuth` in `common/auth.py`)
2. **Workspace Membership**: Verify user belongs to workspace
3. **Role-Based Permissions**: Check user's role allows action
4. **Resource Ownership**: Validate resource belongs to workspace

**Roles (hierarchy)**: owner > admin > member > viewer

- **Owner/Admin**: Can manage budget accounts, members
- **Owner/Admin/Member**: Can create/edit/delete budget data
- **Viewer**: Read-only

When adding new endpoints, always check the user's role via `WorkspaceMember` queries. See `docs/permissions.md` for the complete permissions matrix.

## Authentication

JWT-based authentication with token payload containing:
```json
{
  "user_id": "123",
  "email": "user@example.com",
  "current_workspace_id": "456",
  "exp": 1234571490
}
```

Most endpoints use `auth=WorkspaceJWTAuth()` (validates token + requires active workspace). Use `auth=JWTAuth()` only for endpoints that don't need a workspace (e.g., listing workspaces, creating a workspace). The token is stored in localStorage on the frontend.

## Testing Utilities

**`AuthMixin`**: Sets up authenticated user with workspace automatically. Override `user_role` to test as different roles:
```python
from common.tests.mixins import AuthMixin, APIClientMixin

class MyTestCase(AuthMixin, APIClientMixin, TestCase):
    user_role = 'member'  # default: 'owner'; also: 'admin', 'viewer'

    def test_something(self):
        # self.user, self.workspace, self.auth_token available
        self.get('/api/endpoint', **self.auth_headers())
        self.assertStatus(200)
```

Tests use SQLite in-memory with `--reuse-db` for faster runs (configured in pyproject.toml).

## Import/Export

Several endpoints support bulk import/export via JSON (FormData multipart):
- Categories: `POST /api/categories/import`, `GET /api/categories/export/`
- Transactions: `POST /api/transactions/import`, `GET /api/transactions/export/`
- Planned Transactions: `POST /api/planned-transactions/import`, `GET /api/planned-transactions/export/`
- Currency Exchanges: `POST /api/currency-exchanges/import`, `GET /api/currency-exchanges/export/`

## Service Layer

Business logic lives in `<app>/services.py` files — endpoints in `<app>/api.py` are thin wrappers that parse the request and call the service.

- **`common/permissions.py`**: `require_role(user, workspace_id, allowed_roles)` — raises 403 if role not in list, returns the role string
- **`common/services/base.py`**: `get_or_create_period_balance`, `update_period_balance`, `resolve_currency`
- **`users/services.py`**: `UserService` — profile updates, preferences, consent management, account deletion, GDPR data export
- **`workspaces/services.py`**: `WorkspaceService`, `WorkspaceMemberService`, `CurrencyService`

Example structure:
```python
# transactions/services.py
@db_transaction.atomic
def create_transaction(user, workspace, data) -> Transaction: ...

# transactions/api.py
@router.post('', response={201: TransactionOut}, auth=JWTAuth())
def create_transaction_endpoint(request, data: TransactionCreate):
    return 201, services.create_transaction(request.auth, workspace, data)
```

## Environment Variables

**Backend** (backend/.env):
- `POSTGRES_*`: Database connection
- `SECRET_KEY`: Django secret
- `JWT_SECRET_KEY`: Token signing
- `DEMO_MODE`: Disable registration when true

**Frontend** (frontend/.env or defaults):
- `VITE_API_URL`: Backend API URL (default: http://localhost:8000/api)
- `VITE_DEMO_MODE`: Hide registration link when true

## Code Style

**Backend (Ruff)**:
- Line length: 120 characters
- Single quotes, space indentation
- Excludes migrations/ from linting

**Frontend (ESLint)**:
- TypeScript strict mode
- React hooks and refresh plugins
- See eslint.config.js for rules

## GDPR & Data Integrity Rules

> **When adding or removing a Django model**, always check `backend/users/services.py` →
> `UserService.delete_account()` and `UserService.export_all_data()`:
> - `delete_account`: ensure the new model's data is deleted (or cascades correctly) before
>   parent objects are removed. Pay attention to `on_delete=PROTECT` fields — they must be
>   deleted in the right order or they will block deletion.
> - `export_all_data`: include the new model's data in the JSON export so users receive a
>   complete copy of their personal data.

> **When adding new data fields, processing purposes, or third-party integrations**, update
> the legal pages to keep them accurate:
> - `backend/core/templates/legal/privacy-policy.md` — reflect any new data collected or how it is used
> - `backend/core/templates/legal/terms-of-service.md` — reflect any new features or usage rules
>
> These files use Django template syntax with variables from environment settings:
> - `{{ operator_name }}` — Company or individual name (LEGAL_OPERATOR_NAME)
> - `{{ contact_email }}` — Contact email (LEGAL_CONTACT_EMAIL)
> - `{{ jurisdiction }}` — Legal jurisdiction (LEGAL_JURISDICTION)
> - `{% if is_individual %}...{% endif %}` — Conditional for individuals vs companies
>
> After editing, bump the `version` in the YAML frontmatter to trigger re-consent prompts.
>
> **Deploying legal document updates**: The database is the runtime source of truth for legal
> documents. After bumping template versions, run:
> ```bash
> python manage.py seed_legal_documents          # Seeds from templates if version changed
> python manage.py seed_legal_documents --force  # Force update even if version matches
> ```
> Alternatively, use Django admin to create/edit `LegalDocument` records directly.

## Documentation

- [README.md](./README.md) - Project overview
- [docs/architecture.md](./docs/architecture.md) - System architecture
- [docs/permissions.md](./docs/permissions.md) - Role-based permissions matrix
- [docs/gdpr/README.md](./docs/gdpr/README.md) - GDPR compliance index
- [backend/README.md](./backend/README.md) - API endpoints and setup
- [frontend/README.md](./frontend/README.md) - Components and structure
