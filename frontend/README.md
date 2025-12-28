# Frontend Application

React SPA for budget tracking with offline support, multi-workspace collaboration, and role-based access control.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite 7 | Build tool |
| React Router 7 | Client routing |
| TanStack Query 5 | Server state |
| Axios | HTTP client |
| Tailwind CSS 3 | Styling |
| React Icons | Icon library |
| React Hot Toast | Notifications |

## Project Structure

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts         # Axios instance, API functions, offline interceptors
│   ├── components/
│   │   ├── common/           # Shared components (Loading, Error, etc.)
│   │   ├── balance/          # Balance display components
│   │   ├── budget/           # Budget table components
│   │   ├── transactions/     # Transaction list components
│   │   └── modals/           # Form modals organized by feature
│   │       ├── balance/
│   │       ├── budget/
│   │       ├── categories/
│   │       ├── currency/
│   │       ├── periods/
│   │       └── transactions/
│   ├── contexts/
│   │   ├── AuthContext.tsx          # Authentication state
│   │   ├── WorkspaceContext.tsx     # Current workspace and role
│   │   ├── BudgetAccountContext.tsx # Selected budget account
│   │   ├── BudgetPeriodContext.tsx  # Selected period
│   │   └── LayoutContext.tsx        # Layout mode toggle
│   ├── hooks/
│   │   ├── usePermissions.ts        # Role-based permission checks
│   │   ├── useOnlineStatus.ts       # Online/offline detection
│   │   └── useOfflineSync.ts        # Sync queue processing
│   ├── pages/                # Route page components
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   └── utils/
│       ├── syncQueue.ts             # Offline request queue
│       ├── optimisticUpdates.ts     # Optimistic UI updates
│       └── offlineDisplayCache.ts   # Cached display data
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Pages and Routes

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

| Component | Description |
|-----------|-------------|
| `Loading` | Loading spinner |
| `ErrorMessage` | Error display with retry |
| `EmptyState` | Empty state with action button |
| `ConfirmDialog` | Delete/action confirmation |
| `OfflineIndicator` | Sync status indicator |
| `PeriodSelector` | Period dropdown |
| `BudgetAccountSelector` | Account dropdown |
| `ProtectedRoute` | Auth route wrapper |

### Feature Components

| Component | Description |
|-----------|-------------|
| `BalanceCard` | Single currency balance |
| `BalanceSection` | All currency balances |
| `BudgetTable` | Budget vs actual table |
| `BudgetCategoryRow` | Category budget row |
| `BudgetSummarySection` | Budget overview |
| `TransactionList` | Transaction table |
| `PlannedTransactionList` | Planned transactions table |

### Modal Components

| Category | Modals |
|----------|--------|
| Balance | `EditPeriodBalanceModal` |
| Budget | `CreateBudgetModal`, `EditBudgetModal` |
| Categories | `CreateCategoryModal`, `EditCategoryModal` |
| Currency | `CurrencyExchangeFormModal` |
| Periods | `CreatePeriodModal`, `EditBudgetPeriodModal`, `CopyBudgetPeriodModal` |
| Transactions | `TransactionFormModal`, `PlannedTransactionFormModal`, `ExecutePlannedModal` |

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

## Hooks

### usePermissions

Role-based permission checks for UI visibility.

```typescript
const {
  isOwner,
  isAdmin,
  isMember,
  isViewer,
  canManageBudgetAccounts,  // owner, admin
  canManageBudgetData,      // owner, admin, member
  canManageMembers,         // owner, admin
  canEditMember,            // checks role hierarchy
  canResetPasswordFor,      // checks role hierarchy
} = usePermissions();
```

### useOnlineStatus

Detects network connectivity.

```typescript
const isOnline = useOnlineStatus();
```

### useOfflineSync

Processes offline sync queue.

```typescript
const {
  isSyncing,
  syncProgress,
  syncQueue,
  hasPendingChanges,
  pendingCount,
} = useOfflineSync();
```

## API Client

### Configuration

```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/backend',
});
```

### API Modules

| Module | Purpose |
|--------|---------|
| `authApi` | Login, register, current user |
| `workspacesApi` | Workspace management |
| `workspaceMembersApi` | Member management |
| `budgetAccountsApi` | Budget accounts |
| `budgetPeriodsApi` | Periods with copy |
| `categoriesApi` | Categories with import |
| `budgetsApi` | Budget amounts |
| `transactionsApi` | Transactions with filters |
| `plannedTransactionsApi` | Planned with execute |
| `currencyExchangesApi` | Exchange records |
| `periodBalancesApi` | Balances with recalculate |
| `reportsApi` | Budget summary, balances |

### Token Management

```typescript
// Set token after login
setAuthToken(access_token);

// Clear token on logout
clearAuthToken();

// Get saved token
const token = getAuthToken();
```

## Offline Support

### How It Works

1. **Detection**: `useOnlineStatus` monitors `navigator.onLine`
2. **Queueing**: Mutations (POST/PUT/DELETE) queued when offline
3. **Optimistic Updates**: UI updated immediately
4. **Sync**: Queue processed when back online
5. **Indicator**: `OfflineIndicator` shows sync status

### Sync Queue

```typescript
// Queue structure
interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  data?: any;
  timestamp: number;
  retryCount: number;
  workspaceId?: number;
  accountId?: number;
}

// Usage
SyncQueueManager.add(request);
SyncQueueManager.remove(id);
SyncQueueManager.getAll();
```

## Data Types

### Core Types

```typescript
interface User {
  id: number;
  email: string;
  full_name?: string;
  current_workspace_id?: number;
  is_active: boolean;
  created_at: string;
}

interface Workspace {
  id: number;
  name: string;
  owner_id?: number;
  created_at: string;
}

interface BudgetAccount {
  id: number;
  workspace_id: number;
  name: string;
  description?: string;
  default_currency: string;
  color?: string;
  icon?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

interface BudgetPeriod {
  id: number;
  budget_account_id: number;
  name: string;
  start_date: string;
  end_date: string;
  weeks?: number;
  created_at: string;
}

interface Transaction {
  id: number;
  budget_period_id: number;
  date: string;
  description: string;
  category_id?: number;
  category?: string;
  amount: number;
  currency: string;
  type: 'income' | 'expense';
  created_at: string;
}

interface PlannedTransaction {
  id: number;
  budget_period_id: number;
  name: string;
  amount: number;
  currency: string;
  category_id?: number;
  category?: string;
  planned_date: string;
  payment_date?: string;
  status: 'pending' | 'done' | 'cancelled';
  transaction_id?: number;
  created_at: string;
}

interface PeriodBalance {
  id: number;
  budget_period_id: number;
  currency: string;
  opening_balance: number;
  total_income: number;
  total_expenses: number;
  exchanges_in: number;
  exchanges_out: number;
  closing_balance: number;
  last_calculated_at?: string;
}
```

## Running

### Development

```bash
cd frontend
npm install
npm run dev
```

Application runs at http://localhost:5173

### Build

```bash
npm run build
npm run preview  # Preview production build
```

### Docker

```bash
docker-compose up monie_ui
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:8000/backend` |
| `VITE_DEMO_MODE` | Disable registration (optional) | `false` |

## Development Notes

### React Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 minutes
      retry: 1,
    },
  },
});
```

### Query Keys

```typescript
// Consistent query key patterns
['budget-accounts']
['budget-periods', accountId]
['transactions', periodId]
['workspace-members', workspaceId]
```

### Mutations

```typescript
const mutation = useMutation({
  mutationFn: api.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['resource'] });
    toast.success('Created successfully');
  },
  onError: (error) => {
    toast.error(error.response?.data?.detail || 'Failed');
  },
});
```

## Styling

### Tailwind Configuration

- Primary colors: Gray palette
- Spacing: 4px base unit
- Responsive breakpoints: sm (640px), md (768px), lg (1024px)

### Color Scheme

| Use | Color |
|-----|-------|
| Primary | Gray-900 |
| Background | Gray-50 |
| Borders | Gray-200 |
| Success | Green-600 |
| Error | Red-600 |
| Warning | Yellow-600 |
