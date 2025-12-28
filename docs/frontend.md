# Frontend Application

React SPA for budget tracking with offline support.

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Routing**: React Router DOM 7
- **State**: TanStack React Query 5
- **HTTP**: Axios
- **Styling**: Tailwind CSS 3
- **Build**: Vite 7
- **Icons**: React Icons

## Directory Structure

```
frontend/src/
├── api/
│   └── client.ts         # Axios instance, API functions, offline interceptors
├── components/
│   ├── common/           # Shared components (Loading, ErrorMessage, etc.)
│   ├── balance/          # Balance display components
│   ├── budget/           # Budget table components
│   ├── transactions/     # Transaction list components
│   └── modals/           # All modal forms organized by feature
├── contexts/
│   ├── AuthContext.tsx          # Authentication state
│   ├── WorkspaceContext.tsx     # Current workspace and role
│   ├── BudgetAccountContext.tsx # Selected budget account
│   ├── BudgetPeriodContext.tsx  # Selected period
│   └── LayoutContext.tsx        # Layout mode (auto/cards)
├── hooks/
│   ├── usePermissions.ts        # Role-based permission checks
│   ├── useOnlineStatus.ts       # Online/offline detection
│   └── useOfflineSync.ts        # Sync queue processing
├── pages/                # Route page components
├── types/
│   └── index.ts          # TypeScript interfaces
└── utils/
    ├── syncQueue.ts             # Offline request queue
    ├── optimisticUpdates.ts     # Optimistic UI updates
    └── offlineDisplayCache.ts   # Cached display data
```

## Pages

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | Login | User authentication |
| `/register` | Register | New user registration |
| `/` | Dashboard | Period balances and budget summary |
| `/transactions` | Transactions | Transaction list with filters |
| `/exchanges` | CurrencyExchangesPage | Currency exchange records |
| `/planned` | Planned | Planned transactions management |
| `/categories` | CategoryPage | Category CRUD |
| `/budget-periods` | BudgetPeriodsPage | Period management |
| `/budget-accounts` | BudgetAccountsPage | Budget account management |
| `/members` | WorkspaceMembersPage | Workspace member management |
| `/period/:id` | BudgetPeriod | Single period detail view |

## Components

### Common Components
- `Loading` - Spinner
- `ErrorMessage` - Error display
- `EmptyState` - Empty state with action
- `ConfirmDialog` - Delete confirmation
- `OfflineIndicator` - Sync status
- `PeriodSelector` - Period dropdown
- `BudgetAccountSelector` - Account dropdown
- `ProtectedRoute` - Auth route wrapper

### Feature Components
- `BalanceCard`, `BalanceSection` - Balance display
- `BudgetTable`, `BudgetCategoryRow`, `BudgetSummarySection` - Budget vs actual
- `TransactionList`, `PlannedTransactionList` - Transaction tables

### Modals (by feature)
- Balance: `EditPeriodBalanceModal`
- Budget: `CreateBudgetModal`, `EditBudgetModal`
- Categories: `CreateCategoryModal`, `EditCategoryModal`
- Currency: `CurrencyExchangeFormModal`
- Periods: `CreatePeriodModal`, `EditBudgetPeriodModal`, `CopyBudgetPeriodModal`
- Transactions: `TransactionFormModal`, `PlannedTransactionFormModal`, `ExecutePlannedModal`

## Contexts

### AuthContext
Handles authentication state and operations.

```typescript
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
}
```

### WorkspaceContext
Provides current workspace and user role.

```typescript
interface WorkspaceContextType {
  workspace: Workspace | null;
  currentMembership: WorkspaceMember | null;
  userRole: 'owner' | 'admin' | 'member' | 'viewer' | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

### BudgetAccountContext
Manages selected budget account.

```typescript
interface BudgetAccountContextType {
  selectedAccount: BudgetAccount | null;
  selectedAccountId: number | null;
  setSelectedAccountId: (id: number | null) => void;
  accounts: BudgetAccount[];
  isLoading: boolean;
}
```

### BudgetPeriodContext
Manages selected budget period.

```typescript
interface BudgetPeriodContextType {
  selectedPeriod: BudgetPeriod | null;
  selectedPeriodId: number | null;
  setSelectedPeriodId: (id: number | null) => void;
  periods: BudgetPeriod[];
  isLoading: boolean;
}
```

Auto-selects latest period on load.

### LayoutContext
Layout mode toggle (auto/cards view).

```typescript
interface LayoutContextType {
  layoutMode: 'auto' | 'cards';
  setLayoutMode: (mode: LayoutMode) => void;
  isCardsView: boolean;
}
```

Persisted to localStorage.

## API Client

### Configuration
```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/backend',
});
```

### API Modules
- `authApi` - Login, register, current user
- `workspacesApi` - Workspace management
- `workspaceMembersApi` - Member management
- `budgetAccountsApi` - Budget accounts
- `budgetPeriodsApi` - Periods with copy
- `categoriesApi` - Categories with import
- `budgetsApi` - Budget amounts
- `transactionsApi` - Transactions with filters
- `plannedTransactionsApi` - Planned with execute
- `currencyExchangesApi` - Exchange records
- `periodBalancesApi` - Balances with recalculate
- `reportsApi` - Budget summary, balances

## Offline Support

### Request Interceptor
Mutations (POST/PUT/DELETE) when offline:
1. Add to sync queue
2. Perform optimistic update
3. Show toast notification
4. Throw `OfflineError` to prevent request

### Sync Queue
- Stored in localStorage via `SyncQueueManager`
- Processed sequentially when back online
- Removes optimistic items on sync completion

### useOfflineSync Hook
```typescript
const { isSyncing, syncProgress, syncQueue, hasPendingChanges, pendingCount } = useOfflineSync();
```

## Types

```typescript
interface User { id, email, full_name?, current_workspace_id?, is_active, created_at }
interface Workspace { id, name, owner_id?, created_at }
interface WorkspaceMember { id, workspace_id, user_id, role, created_at }
interface BudgetAccount { id, workspace_id, name, description?, default_currency, is_active, display_order, created_at }
interface BudgetPeriod { id, budget_account_id, name, start_date, end_date, weeks?, created_at }
interface Category { id, budget_period_id, name, created_at }
interface Budget { id, budget_period_id, category, currency, amount, created_at }
interface Transaction { id, budget_period_id, date, description, category, amount, currency, type, created_at }
interface PlannedTransaction { id, budget_period_id, name, amount, currency, category, planned_date, payment_date, status, transaction_id, created_at }
interface CurrencyExchange { id, budget_period_id, date, description, from_currency, from_amount, to_currency, to_amount, exchange_rate, created_at }
interface PeriodBalance { id, budget_period_id, currency, opening_balance, total_income, total_expenses, exchanges_in, exchanges_out, closing_balance, last_calculated_at }
```

## Data Flow

1. **Period Selection**: `BudgetPeriodContext` provides selected period to all components
2. **Data Fetching**: React Query with `queryKey` including `periodId`
3. **Mutations**: Create/update/delete via React Query mutations
4. **Cache Invalidation**: Automatic on mutation success
5. **Offline**: Queue mutations, apply optimistic updates, sync when online

## Running

```bash
# Development
npm run dev       # Port 5173

# Build
npm run build

# Docker
docker-compose up monie_ui   # Port 3000
```
