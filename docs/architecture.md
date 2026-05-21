# System Architecture

This document describes the high-level architecture, data hierarchy, and system components.

## System Overview

Full-stack web application with:
- **Frontend**: React SPA (Single Page Application)
- **Backend**: Django 6 + Django Ninja REST API
- **Database**: PostgreSQL 17
- **Authentication**: JWT (JSON Web Tokens)
- **Task Queue**: Celery with Redis broker

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│    Frontend     │◄────►│    Backend      │◄────►│   PostgreSQL    │
│    (React)      │ HTTP │  (Django Ninja) │ SQL  │                 │
│                 │      │                 │      │                 │
└─────────────────┘      └────────┬────────┘      └─────────────────┘
     Port 5173               │ 8000              Port 5432
                              │
                     ┌────────▼────────┐      ┌─────────────────┐
                     │   Celery Worker │◄────►│     Redis       │
                     │  (async tasks)  │       │  (broker/cache) │
                     └─────────────────┘      └─────────────────┘
```

## Data Hierarchy

The application uses a hierarchical data model:

```
Workspace (top-level container)
│
├── WorkspaceMember (user access and roles)
│
└── BudgetAccount (e.g., Personal, Business)
    │
    └── BudgetPeriod (e.g., January 2025)
        │
        ├── Category (e.g., Food, Transport)
        │   └── Budget (amount per category)
        │
        ├── Transaction (income/expense records)
        │
        ├── PlannedTransaction (scheduled future)
        │
        ├── CurrencyExchange (conversion records)
        │
        └── PeriodBalance (calculated summary)
```

### Hierarchy Explanation

| Level | Entity | Purpose |
|-------|--------|---------|
| 1 | Workspace | Top-level isolation for users/teams |
| 2 | Budget Account | Separate budgets (Personal, Business, Savings) |
| 3 | Budget Period | Time-bounded tracking (monthly, quarterly) |
| 4 | Categories, Transactions, etc. | Actual budget data |

### Multi-Workspace Support

Users can create and switch between multiple workspaces:

- **Workspace Creation**: `POST /api/workspaces/` creates a new workspace with default currencies and a "General" budget account
- **Workspace Switching**: `POST /api/workspaces/{id}/switch` changes the user's active workspace
- **Workspace Deletion**: `DELETE /api/workspaces/{id}` removes a workspace and all its data (owner only)
- **Auto-switch**: Creating a workspace automatically switches the user to it

All workspace-scoped endpoints use `WorkspaceJWTAuth` which validates the user has an active workspace.

## Backend Architecture

### Directory Structure

```
backend/
├── config/                 # Django project configuration (settings, urls, wsgi)
├── common/                 # Shared utilities (JWT auth, test mixins, services)
│   ├── tasks.py            # Celery tasks (send_email_task)
│   ├── email.py            # EmailService (dispatches to Celery, sync fallback)
│   └── services/
│       └── base.py         # get_workspace_period, require_role, update_period_balance
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

Each app with business logic has a `services.py` (e.g., `transactions/services.py`, `budget_periods/services.py`). The `api.py` files are thin wrappers that parse requests and delegate to services.

### Request Flow

```
1. HTTP Request arrives
   │
2. CORS middleware validates origin
   │
3. Django Ninja router matches endpoint
   │
4. Authentication/authorization checks:
   ├── JWTAuth validates token
   ├── Workspace membership verification
   ├── Role permission check
   └── Resource ownership validation
   │
5. Endpoint handler delegates to service (services.py)
   │
6. Service executes business logic (atomic DB operations)
   │
7. Side effects dispatched to Celery (email sending, etc.)
   │
8. Response returned (before async tasks complete)
```

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────►│   Backend   │────►│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                    │
      │  POST /api/       │                    │
      │  auth/login       │                    │
      │  {email, pass}    │                    │
      │──────────────────►│                    │
      │                   │  SELECT user       │
      │                   │───────────────────►│
      │                   │                    │
      │                   │  Verify bcrypt     │
      │                   │◄───────────────────│
      │                   │                    │
      │  JWT Token        │                    │
      │◄──────────────────│                    │
      │                   │                    │
      │  GET /api/...     │                    │
      │  Authorization:   │                    │
      │  Bearer <token>   │                    │
      │──────────────────►│                    │
      │                   │                    │
      │                   │  Validate JWT      │
      │                   │  Extract user_id   │
      │                   │                    │
      │  Response         │                    │
      │◄──────────────────│                    │
```

## Frontend Architecture

### Directory Structure

```
frontend/src/
├── api/
│   └── client.ts         # Axios instance, API functions
├── components/
│   ├── layout/           # MainLayout, Sidebar, UserMenu
│   ├── common/           # Shared (Loading, Error, Empty)
│   ├── dashboard/        # Dashboard overview widgets
│   ├── balance/          # Balance display
│   ├── budget/           # Budget table
│   ├── transactions/     # Transaction lists
│   └── modals/           # Form modals by feature
├── contexts/
│   ├── AuthContext.tsx         # Authentication state
│   ├── WorkspaceContext.tsx    # Current workspace and role
│   ├── BudgetAccountContext.tsx# Selected budget account
│   └── BudgetPeriodContext.tsx # Selected period
├── hooks/
│   ├── usePermissions.ts       # Permission checks
│   └── useMediaQuery.ts        # Responsive breakpoint detection
├── pages/                # Route page components
└── types/
    └── index.ts          # TypeScript interfaces
```

### State Management

```
┌─────────────────────────────────────────────────────────────┐
│                        App                                   │
├─────────────────────────────────────────────────────────────┤
│  AuthProvider (user, token, login/logout)                   │
│    └── WorkspaceProvider (workspace, role)                  │
│          └── BudgetAccountProvider (selected account)       │
│                └── BudgetPeriodProvider (selected period)   │
│                      └── Pages and Components               │
└─────────────────────────────────────────────────────────────┘
```

### Data Fetching

- **TanStack Query** for server state management
- Automatic caching and invalidation
- Query keys include workspace/account/period IDs

```typescript
// Example query
const { data, isLoading } = useQuery({
  queryKey: ['transactions', periodId],
  queryFn: () => transactionsApi.list(periodId),
});
```

## Database Architecture

### Core Tables

| Table | Purpose |
|-------|---------|
| `users_user` | User accounts |
| `workspaces_workspace` | Top-level containers |
| `workspaces_workspacemember` | User-workspace relationships |
| `budget_accounts_budgetaccount` | Budget accounts per workspace |
| `budget_periods_budgetperiod` | Time-bounded periods |
| `categories_category` | Expense categories |
| `budgets_budget` | Budget amounts per category |
| `transactions_transaction` | Income/expense records |
| `planned_transactions_plannedtransaction` | Scheduled transactions |
| `currency_exchanges_currencyexchange` | Conversion records |
| `period_balances_periodbalance` | Calculated summaries |

### Foreign Key Relationships

```
workspaces ──┬── users (via workspace_members)
             └── budget_accounts ── budget_periods ──┬── categories
                                                     ├── budgets
                                                     ├── transactions
                                                     ├── planned_transactions
                                                     ├── currency_exchanges
                                                     └── period_balances
```

### Workspace-Scoped Queries

All workspace-scoped models support the `for_workspace()` queryset method:

```python
# Get all transactions for a workspace
transactions = Transaction.objects.for_workspace(workspace_id)

# Chain with other filters
transactions = Transaction.objects.for_workspace(workspace_id).filter(type='expense')
```

Each model defines a `WORKSPACE_FILTER` class attribute specifying the ORM lookup path to the workspace.

#### List Endpoints Security Behavior

List endpoints return empty arrays (`[]`) rather than 404 when a filter references a resource in another workspace. This prevents leaking whether resource IDs exist in other workspaces.

Examples:
- `TransactionService.list()` returns `[]` when `current_date` matches no period
- `CategoryService.list()` returns `[]` when `budget_period_id` doesn't belong to the workspace

This is intentional security behavior — do not change to return 404.

## Security Architecture

### Authentication Layers

1. **JWT Token**: Validates user identity
2. **Workspace Membership**: Verifies workspace access
3. **Role Permission**: Checks role allows action
4. **Resource Ownership**: Ensures resource belongs to workspace

### Token Structure

```json
{
  "user_id": 123,
  "email": "user@example.com",
  "current_workspace_id": 456,
  "exp": 1703001600
}
```

### CORS Configuration

Django CORS settings allow frontend origins:

```python
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
CORS_ALLOW_CREDENTIALS = True
```

## Environment Configuration

### Backend

| Variable | Purpose |
|----------|---------|
| `POSTGRES_*` | Database connection |
| `REDIS_URL` | Celery broker and cache backend |
| `SECRET_KEY` | Django secret key |
| `JWT_SECRET_KEY` | Token signing |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime (default: 60) |
| `DEMO_MODE` | Disable registration when true |

### Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend API base URL (default: `http://localhost:8000/api`) |
| `VITE_DEMO_MODE` | Hide registration link when true |

## Deployment Architecture

### Docker Compose Setup

```yaml
services:
  denarly_db:
    image: postgres:17-alpine
    ports: ["5432:5432"]

  denarly_redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  denarly_api:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [denarly_db, denarly_redis]

  denarly_celery_worker:
    build: ./backend
    command: celery -A config worker -l info
    depends_on: [denarly_redis, denarly_db]

  denarly_celery_beat:
    build: ./backend
    command: celery -A config beat -l info
    depends_on: [denarly_redis]

  denarly_ui:
    build: ./frontend
    ports: ["3000:80"]
    depends_on: [denarly_api]
```

### Celery Task Infrastructure

Email sending and other async operations are handled by Celery workers:

- **Broker**: Redis (`REDIS_URL`) — queues tasks for workers
- **Workers**: Process tasks asynchronously (e.g., `send_email_task`)
- **Beat**: Scheduled task runner (periodic tasks)
- **Eager mode**: Tests use `CELERY_TASK_ALWAYS_EAGER=True` to execute tasks synchronously

`EmailService.send_email()` dispatches to `send_email_task.delay()` by default. If the Celery broker is unavailable, it falls back to synchronous sending.

### Production Considerations

1. **Reverse Proxy**: Nginx or similar for SSL termination
2. **Secret Management**: Environment variables or vault
3. **Database**: Managed PostgreSQL service
4. **Monitoring**: Logging and metrics collection
