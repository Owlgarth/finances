# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Monie** is a full-stack personal finance tracking application built with Django 6, Django Ninja, React 19, and PostgreSQL. It features multi-currency support, period-based budgeting, multi-account workspaces, and collaborative team features with role-based access control.

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
| `users` | Custom User model with email authentication (no username) |
| `workspaces` | Multi-tenant workspaces with role-based access |
| `budget_accounts` | Budget accounts within workspaces |
| `budget_periods` | Time-bound periods for budget tracking |
| `categories` | Transaction categories |
| `budgets` | Allocated amounts per category |
| `transactions` | Income/expense records |
| `planned_transactions` | Future scheduled transactions |
| `currency_exchanges` | Multi-currency exchange records |
| `period_balances` | Pre-calculated balances per period/currency |
| `reports` | Budget summaries and current balances |
| `core` | Main API endpoints, schemas |
| `common` | JWT auth utilities, test mixins |

### API Routing

All API routes are registered in `backend/config/urls.py`:
- Base URL: `/api/`
- Each Django app has its own `api.py` with a Router that's added to the main NinjaAPI instance
- Interactive docs: `/api/docs`

### Frontend Structure

- **`api/client.ts`**: Axios instance with offline support interceptors
- **`contexts/`**: Global state (Auth, Workspace, BudgetAccount, BudgetPeriod)
- **`hooks/usePermissions.ts`**: Role-based permission checks
- **`utils/syncQueue.ts`**: Offline request queue for localStorage

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

Protected endpoints use `auth=JWTAuth()` in Django Ninja. The token is stored in localStorage on the frontend.

## Testing Utilities

**`AuthMixin`**: Sets up authenticated user with workspace automatically
```python
from common.tests.mixins import AuthMixin

class MyTestCase(AuthMixin, TestCase):
    def test_something(self):
        # User and workspace auto-created
        response = self.client.get('/api/endpoint')
```

Tests use SQLite in-memory with `--reuse-db` for faster runs (configured in pyproject.toml).

## Import/Export

Several endpoints support bulk import/export via JSON (FormData multipart):
- Categories: `POST /api/categories/import`, `GET /api/categories/export/`
- Transactions: `POST /api/transactions/import`, `GET /api/transactions/export/`
- Planned Transactions: `POST /api/planned-transactions/import`, `GET /api/planned-transactions/export/`
- Currency Exchanges: `POST /api/currency-exchanges/import`, `GET /api/currency-exchanges/export/`

## Offline Support

Frontend queues mutations (POST/PUT/DELETE) when offline using `SyncQueueManager`. Requests are stored in localStorage and processed when connectivity returns. See `frontend/src/utils/syncQueue.ts`.

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

## Documentation

- [README.md](./README.md) - Project overview
- [docs/architecture.md](./docs/architecture.md) - System architecture
- [docs/permissions.md](./docs/permissions.md) - Role-based permissions matrix
- [backend/README.md](./backend/README.md) - API endpoints and setup
- [frontend/README.md](./frontend/README.md) - Components and structure
