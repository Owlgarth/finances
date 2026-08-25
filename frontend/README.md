# Frontend Application

React SPA for budget tracking with multi-workspace collaboration and role-based access control.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite 7 | Build tool |
| React Router 7 | Client routing |
| TanStack Query 5 | Server state |
| Axios | HTTP client |
| Tailwind CSS 3 | Styling (Architectural Ledger design system) |
| Lucide React | Icon library |
| React Hot Toast | Notifications |

## Project Structure

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts         # Axios instance + typed API modules
│   │   └── queryClient.ts    # App-wide QueryClient (own module - no import cycles)
│   ├── components/
│   │   ├── layout/           # MainLayout, Sidebar, UserMenu, WorkspaceSelector
│   │   ├── common/           # Modal, Select, ConfirmDialog, Pagination, formStyles…
│   │   ├── accounts/         # AccountFormModal, SetBalanceModal, TransferModal
│   │   ├── budgets/          # PeriodPicker (budget period listbox), PeriodCard (periods-page card)
│   │   ├── transactions/     # TransactionItemsEditor, TransactionAttachments, ExtractionReviewModal
│   │   ├── modals/budgets/   # PeriodFormModal (custom-period add/edit)
│   │   ├── modals/transactions/ # TransactionFormModal, PlannedFormModal
│   │   └── profile/          # Settings/profile sections
│   ├── contexts/
│   │   ├── AuthContext.tsx          # Authentication + consent state
│   │   ├── WorkspaceContext.tsx     # Current workspace and role
│   │   ├── UserPreferencesContext.tsx
│   │   └── ThemeContext.tsx         # Light/dark theme
│   ├── hooks/
│   │   ├── useDomain.ts             # useAccounts, useBudgets, useEnabledCurrencies, useMultiCurrency, useExtractionEnabled
│   │   ├── useAttachments.ts        # Attachment list/upload/delete + cached-blob view/download (per transaction)
│   │   ├── usePermissions.ts        # Role-based permission checks
│   │   ├── useListboxPanel.ts       # Shared Select/MultiSelect/PeriodPicker panel state + keyboard nav
│   │   ├── useWorkspaceSwitch.ts    # Shared workspace-switch handler (sidebar + bottom nav)
│   │   └── useMediaQuery.ts         # Responsive breakpoint detection
│   ├── pages/                # Route page components
│   ├── types/index.ts        # TypeScript interfaces
│   └── utils/                # format, errors, pageSize, params (list filters), transactionItems, attachments (view/download helpers)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Pages and Routes

Seven in-app destinations (sidebar) plus nested budget routes, auth/legal routes
and a 404 catch-all.

| Path | Component | Description |
|------|-----------|-------------|
| `/login`, `/register` | Login, Register | Auth; registration picks a currency + optional sample data |
| `/` | Dashboard | Account balances + recent activity |
| `/accounts` | AccountsPage | Accounts, set-balance, transfers |
| `/budgets` | BudgetsPage | Budget list; card icons open a budget's periods / add a custom period |
| `/budgets/:id` | BudgetDetailPage | Category plan-vs-actual with period switcher (`?period=` param deep-links a period; capped 7-row window + "View all periods" row); custom-cadence period management |
| `/budgets/:id/periods` | BudgetPeriodsPage | All periods of a budget as year-sectioned cards (newest first); cards deep-link to the detail page via `?period=`; add/edit/delete for custom periods (admin) |
| `/transactions` | Transactions | Transaction list, filters, receipt-first create |
| `/planned` | Planned | Planned transactions |
| `/members` | WorkspaceMembersPage | Member management |
| `/settings` | ProfilePage | Profile, preferences, data export/import |
| `*` | NotFoundPage | 404 catch-all for unknown paths |

## Components

**Layout** (`components/layout/`): `MainLayout` (responsive wrapper), `Sidebar`
(7 destinations + workspace selector + user menu), `UserMenu`, `WorkspaceSelector`.

**Common** (`components/common/`): `Modal`, `Select`/`MultiSelect` (custom dropdowns
sharing the `useListboxPanel` hook + `listboxParts.tsx` primitives), `ConfirmDialog`,
`Pagination`, `EmptyState`, `Switch`, `SegmentedControl`, `ListFilterFields` (the
shared Transactions/Planned filter panel), and `formStyles.ts` (the input/label/button
class constants - the redesign's form primitives). `DatePicker` (react-day-picker) and
`LegalDocPage` (shared shell for the Privacy/Terms pages) live at `components/`.

**Accounts** (`components/accounts/`): `AccountFormModal`, `SetBalanceModal` (records a
balance adjustment), `TransferModal` (last-used pair, cross-currency implied rate).

**Budgets** (`components/budgets/` + `components/modals/budgets/`): `PeriodPicker`
(the period listbox on Budget detail - desktop popover grouped by year with a
CURRENT chip and muted past periods, mobile bottom sheet; a sibling consumer of
the `useListboxPanel` machinery, not a Select fork; optional `limit` caps the list
to a window centered on the viewed period, and `onViewAll` appends a
"View all periods" row - sticky popover footer on desktop, last row in the mobile
sheet - that navigates to the periods page instead of selecting), `PeriodCard`
(one period as a card on the periods page; the whole card is a link to
`/budgets/:id?period=<id>`, with a CURRENT chip, muted past periods, and admin
edit/delete icons on custom periods), `PeriodFormModal` (add/edit a custom budget
period; the name is derived from the date range until edited).

**Transactions** (`components/transactions/` + `components/modals/transactions/`):
`TransactionFormModal` (with Items/Receipts tabs; receipt-first create auto-selects
the account matching the parsed currency - preferring the per-currency default),
`TransactionItemsEditor`, `TransactionAttachments` (upload + view/download,
extraction), `ExtractionReviewModal`, `PlannedFormModal`.

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

> There is no global account or period context. Accounts and budgets are read
> through the hooks in `hooks/useDomain.ts`; period selection is local state on the
> Budget detail page (periods are per-budget). The old `BudgetAccountContext` /
> `BudgetPeriodContext` were removed in the redesign. The selection is backed by
> a `?period=` URL param: deep links and reloads seed the chosen period,
> user-initiated selections are written back with `{ replace: true }` (selections
> stay out of history), and a garbage or foreign period id falls back to the
> default pick. The periods overview page (`/budgets/:id/periods`) holds no
> selection either - its cards deep-link into the detail page via the same
> `?period=` param.

### ThemeContext

Manages light/dark theme. Mounted at the top of the provider tree (inside `<BrowserRouter>`, wrapping `<AuthProvider>`) so all routes are themed.

```typescript
interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  setDark: (dark: boolean) => void;
}
```

The choice is persisted to `localStorage` under `owlgarth_theme` (`'light'` | `'dark'` | `null`). `null` (no stored value) means follow the OS `prefers-color-scheme`; once the user toggles, the stored choice wins and the OS listener becomes a no-op. An inline script in `index.html` sets the `.dark` class on `<html>` before React hydration to prevent a flash of the wrong theme.

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

## API Client

### Configuration

```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
});
```

### API Modules

| Module | Purpose |
|--------|---------|
| `authApi` | Login, register, current user, GDPR export/import + legacy import |
| `workspacesApi` | Workspace management |
| `workspaceMembersApi` | Member management |
| `currenciesApi` | Catalog + enabled currencies (enable/disable/custom) |
| `accountsApi` | Accounts, archive, computed balance |
| `budgetsApi` | Budgets + nested periods, categories, category-budgets |
| `transactionsApi` | Transactions (filters, totals, bulk-account), line items, attachments, extraction, receipt parse |
| `transfersApi` | Transfers between accounts |
| `plannedTransactionsApi` | Planned with execute, totals by `currency`/`category` |
| `reportsApi` | Budget summary (planned vs actual), current balances |

### Token Management

```typescript
// Set token after login
setAuthToken(access_token);

// Clear token on logout
clearAuthToken();

// Get saved token
const token = getAuthToken();
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

interface Account {
  id: number;
  workspace_id: number;
  name: string;
  type: 'cash' | 'bank' | 'other';
  currency_code: string;
  opening_balance: string;   // balance is computed, not stored
  is_archived: boolean;
  is_default_for_currency: boolean;  // one default per currency; drives receipt-currency auto-select
  display_order: number;
  created_at: string;
}

interface Budget {
  id: number;
  workspace_id: number;
  name: string;
  cadence: 'monthly' | 'weeks' | 'custom';
  cadence_weeks: number | null;
  cadence_anchor: string | null;
  is_active: boolean;
  // …description/color/icon/display_currency_code
}

interface Transaction {
  id: number;
  account_id: number;
  account_name: string;
  currency_code: string;     // == the account's currency
  date: string;
  description: string;
  category_id: number | null;
  amount: string;
  type: 'income' | 'expense' | 'adjustment';
  original_amount: string | null;         // "paid in another currency" facet
  original_currency_code: string | null;
}

interface Transfer {
  id: number;
  from_account_id: number; to_account_id: number;
  from_amount: string; to_amount: string;
  from_currency_code: string; to_currency_code: string;
  rate: string | null;       // implied rate for cross-currency
  date: string; description: string;
}
```

See `src/types/index.ts` for the full set (Period, Category, CategoryBudget,
PlannedTransaction, TransactionItem, TransactionAttachment, ExtractionResult, …).

## Running

### Development

```bash
cd frontend
npm install
npm run dev                    # Runs at http://localhost:5173 (or VITE_PORT)
npm run dev -- --port 3000    # Override port via CLI
```

Application runs at `http://localhost:{VITE_PORT}` (default: 5173)

### Build

```bash
npm run build
npm run preview  # Preview production build
```

### Docker

```bash
# The `ui` service is the nginx production build (VITE_* baked in at build time).
# For frontend work run the dev server on the host instead:
./dev.sh frontend   # Vite + hot reload on UI_PORT, VITE_* from .env
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:8000/api` |
| `VITE_DEMO_MODE` | Disable registration (optional) | `false` |
| `VITE_PORT` | Dev server port (optional) | `5173` (Vite default) |

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

The client lives in `src/api/queryClient.ts` (its own module, so `main.tsx` and the
contexts can both import it without a cycle). On workspace switch/create/delete the
whole cache is removed except a keep-set of user-scoped keys (`user-preferences`,
`2fa-status`, `extraction-config`) - mounted queries refetch immediately, so nothing
from the previous workspace survives the switch.

The domain list hooks in `hooks/useDomain.ts` set `refetchOnWindowFocus: 'always'`:
each browser tab keeps its own cache (a mutation in another tab can't invalidate this
one) and the app-wide 5-minute `staleTime` would otherwise mark a list fresh and skip
the default stale-only focus refetch - so these cheap list GETs converge whenever the
user looks at the tab again.

### Query Keys

```typescript
// Consistent query key patterns
['accounts', includeArchived]
['budgets', includeInactive]
['budget-summary', budgetId, periodId]
['transactions', page, filters]
['transaction-attachments', transactionId]
['attachment-blob', transactionId, attachmentId]  // immutable files: staleTime/gcTime Infinity; the cache owns the object URL
['current-balances', includeArchived]
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

### Design System

The app uses an **Architectural Ledger** design system with CSS custom properties in `src/index.css` mapped to Tailwind utility classes in `tailwind.config.js`.

Visual separation uses flat surfaces with borders (`border border-border`) - no gradients or box shadows.

### Tailwind Theme

- **Colors**: 16 CSS custom property tokens (brand, surfaces, borders, text, semantic/financial)
- **Font families**: Geist (`font-sans`) and JetBrains Mono (`font-mono`)
- **Border radius**: `rounded-sm` (4px) and `rounded-none` (0px)
- **Z-index**: Named scale from 100 (dropdowns) to 700 (tooltips)

### Color Tokens

| Use | Token | Tailwind Class |
|-----|-------|----------------|
| Brand / CTAs | `--color-primary` | `bg-primary`, `text-primary` |
| Page background | `--color-background` | `bg-background` |
| Cards, panels | `--color-surface` | `bg-surface` |
| Surface hover | `--color-surface-hover` | `bg-surface-hover` |
| Muted surface | `--color-surface-muted` | `bg-surface-muted` |
| Default borders | `--color-border` | `border-border` |
| Focus rings | `--color-border-focus` | `ring-border-focus` |
| Primary text | `--color-text` | `text-text` |
| Secondary text | `--color-text-muted` | `text-text-muted` |
| Success / income | `--color-positive` | `text-positive`, `bg-positive` |
| Error / expense | `--color-negative` | `text-negative`, `bg-negative` |
| Warnings | `--color-warning` | `text-warning`, `bg-warning` |

> **Dark mode:** a `.dark` block in `src/index.css` overrides all 16 tokens above - see [`design/dark-mode.md`](../design/dark-mode.md) §1. Because `--color-primary` inverts to a light value, a centralized `.dark .bg-primary.text-white { color: var(--color-background); }` rule keeps primary buttons legible.

### Icons

All icons use **Lucide React** exclusively:

```tsx
import { Plus, Pencil, Trash2, X, ChevronDown } from 'lucide-react'
<Plus size={14} />
```

### External Fonts

Geist (sans) and JetBrains Mono (monospace) loaded from Google Fonts. No icon fonts.
