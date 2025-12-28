# System Architecture

This document describes the high-level architecture, data hierarchy, and system components.

## System Overview

Full-stack web application with:
- **Frontend**: React SPA (Single Page Application)
- **Backend**: Django 6 + Django Ninja REST API
- **Database**: PostgreSQL 17
- **Authentication**: JWT (JSON Web Tokens)

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│    Frontend     │◄────►│    Backend      │◄────►│   PostgreSQL    │
│    (React)      │ HTTP │  (Django Ninja) │ SQL  │                 │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
     Port 5173               Port 8000              Port 5432
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

## Backend Architecture

### Directory Structure

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
5. Endpoint handler executes
   │
6. Response returned
```

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────►│   Backend   │────►│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                    │
      │  POST /backend/   │                    │
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
      │  GET /backend/... │                    │
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
│   ├── common/           # Shared (Loading, Error, Empty)
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
│   ├── useOnlineStatus.ts      # Online/offline detection
│   └── useOfflineSync.ts       # Sync queue processing
├── pages/                # Route page components
├── types/
│   └── index.ts          # TypeScript interfaces
└── utils/
    ├── syncQueue.ts           # Offline request queue
    ├── optimisticUpdates.ts   # Optimistic UI
    └── offlineDisplayCache.ts # Cached display data
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

## Offline Support Architecture

### Offline Detection

```typescript
// useOnlineStatus hook
const [isOnline, setIsOnline] = useState(navigator.onLine);

window.addEventListener('online', () => setIsOnline(true));
window.addEventListener('offline', () => setIsOnline(false));
```

### Request Queue

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Action   │────►│  Offline Check  │────►│   API Request   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │ offline              │ online
                               ▼                      │
                        ┌─────────────────┐           │
                        │   Sync Queue    │           │
                        │  (localStorage) │           │
                        └─────────────────┘           │
                               │ when online          │
                               ▼                      ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │  Process Queue  │────►│    Backend      │
                        └─────────────────┘     └─────────────────┘
```

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
| `SECRET_KEY` | Django secret key |
| `JWT_SECRET_KEY` | Token signing |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime (default: 60) |
| `DEMO_MODE` | Disable registration when true |

### Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend API base URL (default: `http://localhost:8000/backend`) |
| `VITE_DEMO_MODE` | Hide registration link when true |

## Deployment Architecture

### Docker Compose Setup

```yaml
services:
  monie_db:
    image: postgres:17-alpine
    ports: ["5432:5432"]

  monie_api:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [monie_db]

  monie_ui:
    build: ./frontend
    ports: ["3000:80"]
    depends_on: [monie_api]
```

### Production Considerations

1. **Reverse Proxy**: Nginx or similar for SSL termination
2. **Secret Management**: Environment variables or vault
3. **Database**: Managed PostgreSQL service
4. **Monitoring**: Logging and metrics collection
