# Frontend Application

React SPA for budget tracking.

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Routing**: React Router DOM 7
- **State**: TanStack React Query 5
- **HTTP**: Axios
- **Styling**: Tailwind CSS 3 (Architectural Ledger design system)
- **Build**: Vite 7
- **Icons**: Lucide React

## Directory Structure

```
frontend/src/
├── api/
│   └── client.ts         # Axios instance, API functions
├── components/
│   ├── layout/           # MainLayout, Sidebar, UserMenu
│   ├── common/           # Shared components (Loading, ErrorMessage, etc.)
│   ├── balance/          # Balance display components
│   ├── budget/           # Budget table components
│   ├── transactions/     # Transaction list components
│   └── modals/           # All modal forms organized by feature
├── contexts/
│   ├── AuthContext.tsx          # Authentication state
│   ├── WorkspaceContext.tsx     # Current workspace and role
│   ├── BudgetAccountContext.tsx # Selected budget account
│   └── BudgetPeriodContext.tsx  # Selected period
├── hooks/
│   ├── usePermissions.ts        # Role-based permission checks
│   └── useMediaQuery.ts         # Responsive breakpoint detection
├── pages/                # Route page components
└── types/
    └── index.ts          # TypeScript interfaces
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

### Layout Components
- `MainLayout` - Responsive wrapper: mobile drawer, tablet auto-collapsed, desktop persistent sidebar
- `Sidebar` - Navigation links, account/period selectors, user menu; supports collapsed/expanded
- `UserMenu` - User profile and logout at sidebar bottom
- `WorkspaceSelector` - Dropdown to switch/create workspaces, with settings gear to open settings panel
- `WorkspaceSettingsPanel` - Modal for workspace name editing (owner/admin) and deletion (owner only, requires multiple workspaces)

### Common Components
- `Loading` - Spinner
- `ErrorMessage` - Error display
- `EmptyState` - Empty state with action
- `ConfirmDialog` - Delete confirmation
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
Provides current workspace, user role, and workspace management operations.

```typescript
interface WorkspaceContextType {
  workspace: Workspace | null;
  workspaces: Workspace[];
  currentMembership: WorkspaceMember | null;
  userRole: 'owner' | 'admin' | 'member' | 'viewer' | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  switchWorkspace: (id: number) => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
  deleteWorkspace: (id: number) => Promise<void>;
  updateWorkspace: (data: { name: string }) => Promise<Workspace>;
}
```

**Operations:**
- `switchWorkspace(id)` - Switch to a different workspace (auto-switches to first available on deletion)
- `createWorkspace(name)` - Create a new workspace (auto-switches to it)
- `deleteWorkspace(id)` - Delete workspace (owner only, must have multiple workspaces)
- `updateWorkspace(data)` - Update workspace name (owner/admin only)

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

## Design System

The frontend uses an **Architectural Ledger** design system with CSS custom properties defined in `index.css` and mapped to Tailwind utility classes in `tailwind.config.js`.

### Color Tokens

All colors are CSS custom properties (`--color-*`) mapped to Tailwind classes:

| Token | CSS Variable | Tailwind Class | Purpose |
|-------|-------------|----------------|---------|
| `primary` | `--color-primary` | `bg-primary`, `text-primary` | Brand / CTAs |
| `primary-hover` | `--color-primary-hover` | `bg-primary-hover` | CTA hover state |
| `background` | `--color-background` | `bg-background` | Page background |
| `surface` | `--color-surface` | `bg-surface` | Cards, panels, modals |
| `surface-hover` | `--color-surface-hover` | `bg-surface-hover` | Interactive surface hover |
| `surface-muted` | `--color-surface-muted` | `bg-surface-muted` | Subtle / disabled surfaces |
| `border` | `--color-border` | `border-border` | Default borders |
| `border-focus` | `--color-border-focus` | `ring-border-focus` | Focus rings, outlines |
| `text` | `--color-text` | `text-text` | Primary text |
| `text-muted` | `--color-text-muted` | `text-text-muted` | Secondary / placeholder text |
| `positive` | `--color-positive` | `text-positive`, `bg-positive` | Income / success |
| `negative` | `--color-negative` | `text-negative`, `bg-negative` | Expense / error |
| `warning` | `--color-warning` | `text-warning`, `bg-warning` | Warnings |

Visual separation uses borders (`border border-border`) instead of box shadows. Surfaces are flat — no gradients.

### Typography

| Font Family | Tailwind | Use |
|-------------|----------|-----|
| Geist | `font-sans` | Body text, headings (default) |
| JetBrains Mono | `font-mono` | Numeric values, labels, code |

### Border Radius

Only two radius values: `rounded-sm` (4px) for elements and `rounded-none` (0px) for flush edges.

### Z-Index Scale

Named z-index tokens prevent stacking conflicts:

| Token | Value | Use |
|-------|-------|-----|
| `z-dropdown` | 100 | Dropdowns |
| `z-sticky` | 200 | Sticky headers |
| `z-sidebar` | 300 | Sidebar |
| `z-bottom-nav` | 300 | Mobile bottom nav |
| `z-topbar` | 400 | Top bars |
| `z-modal-backdrop` | 500 | Modal overlay |
| `z-modal` | 510 | Modal content |
| `z-toast` | 600 | Toast notifications |
| `z-tooltip` | 700 | Tooltips |

### Icons

All icons use [Lucide React](https://lucide.dev/) exclusively. Usage pattern:

```tsx
import { Plus, Pencil, Trash2 } from 'lucide-react'
<Plus size={14} />
```

### External Fonts

Loaded from Google Fonts: **Geist** (weights 300–700) and **JetBrains Mono** (weights 400–700). No Material Symbols or other icon fonts.

## Running

```bash
# Development
npm run dev       # Port 5173

# Build
npm run build

# Docker
docker-compose up denarly_ui   # Port 3000
```