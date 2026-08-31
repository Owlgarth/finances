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
│   │   ├── layout/           # MainLayout, Sidebar, BottomNav (mobile), UserMenu, WorkspaceSelector, ThemeToggleRow, WorkspaceSettingsPanel, CreateWorkspaceForm
│   │   ├── common/           # Modal, Select, ConfirmDialog, Pagination, formStyles…
│   │   ├── accounts/         # AccountFormModal, SetBalanceModal, TransferModal
│   │   ├── currencies/       # CurrencySetField (ordered set picker), CurrenciesSettingsSection
│   │   ├── budgets/          # PeriodPicker (budget period listbox), PeriodCard (periods-page card)
│   │   ├── dashboard/        # BudgetInsights (planned-vs-actual widget on the Dashboard)
│   │   ├── transactions/     # TransactionItemsEditor, TransactionAttachments, ExtractionReviewModal
│   │   ├── modals/budgets/   # PeriodFormModal (custom-period add/edit), ManageCategoriesModal
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
│   │   ├── useMediaQuery.ts         # Responsive breakpoint detection
│   │   ├── useBreakpoint.ts         # Device-tier truth (isMobile/isTablet/isDesktop, Tailwind-snapped) + useIsTouch (pointer: coarse)
│   │   ├── useDebouncedField.ts     # Draft state for inputs whose committed value lives in URL params (search, amount filters)
│   │   └── useOverlay.ts            # Blocking-overlay behavior for Modal/BottomSheet: stack-aware Escape, refcounted scroll lock, focus restore
│   ├── pages/                # Route page components
│   ├── types/index.ts        # TypeScript interfaces
│   └── utils/                # format, errors, pageSize, params (list filters), transactionItems, attachments (view/download helpers), currencies (budget-view active-code derivation + `PRE_AUTH_CURRENCIES`, the curated pre-auth list behind the register/reset pickers), tappable (button semantics for plain-div rows that open an ActionSheet on touch), zoomLock (the More sheet's device-local "disable zoom" preference)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Pages and Routes

Six in-app destinations (sidebar) plus the Settings page (user menu on desktop,
More sheet on mobile), a Transfers page with no nav slot of its own (reached
from Accounts and the command palette), nested budget routes, auth/legal routes
and a 404 catch-all.

| Path | Component | Description |
|------|-----------|-------------|
| `/login`, `/register` | Login, Register | Auth; registration picks a currency set (`CurrencySetField` on the pre-auth curated list; first = workspace primary) + optional sample data |
| `/verify-email` | VerifyEmailPage | Public; consumes the email-verification `?token=` link (verifying/success/error states, plus a resend form); refreshes the logged-in user only when a session already exists |
| `/confirm-email-change` | ConfirmEmailChangePage | Consumes the email-change `?token=` link; requires auth - the token is validated against the logged-in user's ID, so a fresh session lands on login and must re-click the link |
| `/reconsent` | ReConsentPage | Requires auth; consent gate shown when terms/privacy were updated - states which document is outdated and requires accepting both before proceeding |
| `/privacy` | PrivacyPolicyPage | Public; Privacy Policy rendered through the shared `LegalDocPage` shell (`legalApi.getPrivacy`) |
| `/terms` | TermsPage | Public; Terms of Service through the same `LegalDocPage` shell (`legalApi.getTerms`) |
| `/` | Dashboard | Account balances + recent activity; balance rows link to the account's filtered transactions |
| `/accounts` | AccountsPage | Accounts, set-balance, transfers; per-account "View transactions" drill-down and a "View all transfers" link to `/transfers` |
| `/budgets` | BudgetsPage | Budget list with create/edit modals (name + ordered currency set); cards list their currency codes; card icons open a budget's periods / add a custom period; "Show archived budgets" toggle with per-card unarchive (archived cards stay navigable, presentation muted) |
| `/budgets/:id` | BudgetDetailPage | Category plan-vs-actual with period switcher (`?period=` param deep-links a period; capped 7-row window + "View all periods" row; opens on the current period, nearest-today fallback); multi-currency budgets select the viewed currency through a per-currency totals strip (keyboard-cyclable tablist; last view remembered per budget in localStorage); custom-cadence period management; "Manage categories" (write roles) opens an archive-first manager (delete offered only on already-archived rows, merge moves a category's history to a target) |
| `/budgets/:id/periods` | BudgetPeriodsPage | All periods of a budget as year-sectioned cards (newest first); cards deep-link to the detail page via `?period=`; add/edit/delete for custom periods (admin) |
| `/transactions` | Transactions | Transaction list, filters, receipt-first create; sort select, date-preset chips, totals strip, remembered search, "Export view" JSON download |
| `/planned` | Planned | Planned transactions; list features mirror Transactions (sort select, date presets, totals strip, remembered search, "Export view") |
| `/transfers` | TransfersPage | Transfer history with account (either side) + date filters in the URL; edit (opens against fetched server truth), repeat (prefills a new transfer), delete; no sidebar slot - entry via the Accounts "View all transfers" link or the command palette |
| `/members` | WorkspaceMembersPage | Member management |
| `/settings` | ProfilePage | Profile, preferences, data export/import |
| `*` | NotFoundPage | 404 catch-all for unknown paths |

## Components

**Layout** (`components/layout/`): `MainLayout` (responsive wrapper - renders the
desktop `Sidebar` and the mobile `BottomNav`), `Sidebar` (6 destinations +
workspace selector + user menu; its gear opens `WorkspaceSettingsPanel`),
`BottomNav` (mobile shell: bottom bar with Home/Txns/Budgets/More tabs around a
center quick-add FAB - the FAB hides for viewers/workspace-less users but the
slot stays so tabs don't shift; the FAB's ActionSheet offers new transaction,
transfer, from-receipt (parse then seed the form) and planned; the More sheet
carries the overflow destinations (Accounts, Planned, Members, Settings), search,
logout, workspace switcher + create/settings, the theme row and the zoom toggle),
`UserMenu`, `WorkspaceSelector`, `ThemeToggleRow` (dark-mode toggle row shared by
the desktop UserMenu dropdown and the mobile More sheet), `WorkspaceSettingsPanel`
(workspace rename/delete modal hosting the admin-gated
`CurrenciesSettingsSection`; opened from the sidebar gear and the More sheet),
and `CreateWorkspaceForm` (mount-per-use create-workspace
modal - name + ordered currency multi-select via `CurrencySetField` in compact
mode - opened as a modal from all three call sites: the sidebar button, the
workspace selector dropdown, and the mobile More sheet; also exports
`CreateWorkspaceButton`).

**Common** (`components/common/`): `Modal`, `Select`/`MultiSelect` (custom dropdowns
sharing the `useListboxPanel` hook + `listboxParts.tsx` primitives), `ConfirmDialog`,
`Pagination`, `EmptyState`, `Switch`, `SegmentedControl`, `BottomSheet` (the
universal mobile container - slide-up panel with scrim dismiss, body scroll lock
and safe-area padding; modals, selects, action menus and pickers render inside
it on mobile), `ActionSheet` (titled list of 44px tap actions in a bottom sheet -
the touch replacement for hover-revealed row actions; closes the sheet before
running the action so it can safely open a modal), `CommandPalette`
(Ctrl/Cmd+K page search, summoned via the exported `openPageSearch()` from the
sidebar and the More sheet: static destinations plus server-backed
Budgets/Accounts/Transactions/Planned results once the query reaches 2 chars;
desktop popover, mobile bottom sheet), `FilterBar` (list-page filter scaffolding -
`FiltersToggle` with an active-filter count badge, the `FilterPanel` region with
Clear filters, `FilterField`; the pages own the actual filter state in URL search
params), `SearchInput` (search box with leading icon, debounced commit and clear
X - the remembered search on the list pages), `AmountInput` (debounced numeric
input for the min/max amount filters), `Skeleton` (wireframe loading bars -
`Skeleton` single bar + `SkeletonRows` stack), `RoleBadge` (inline workspace-role
chip next to workspace rows in the selector dropdown and the mobile More sheet),
`ListFilterFields` (the
shared Transactions/Planned filter panel, with date-preset chips: This month /
Last month / Last 30 days / This year), `ListTotalsStrip` (presentational totals
strip for the list pages - the owning page runs the query and passes the results),
and `formStyles.ts` (the input/label/button
class constants - the redesign's form primitives). `DatePicker` (react-day-picker) and
`LegalDocPage` (shared shell for the Privacy/Terms pages) live at `components/`,
alongside `ProtectedRoute` (the auth gate: loading splash while auth resolves,
redirect to `/login` when unauthenticated; wraps the workspace/preferences
providers around all in-app routes, and `/reconsent` and `/confirm-email-change`
individually).

**Accounts** (`components/accounts/`): `AccountFormModal`, `SetBalanceModal` (records a
balance adjustment), `TransferModal` (last-used pair, cross-currency implied rate;
doubles as the edit modal - `editFrom` prefills every field and saves via update).

**Currencies** (`components/currencies/`): `CurrencySetField` (ordered currency-set
picker on top of `MultiSelect` - a visible ordered list with up/down arrows and a
primary marker for index 0; a compact mode folds the list into helper copy for
constrained call sites, and an optional "Manage currencies..." bridge jumps to the
workspace-settings currencies section; used by the budget create/edit modals in
full mode with ambient `useEnabledCurrencies()` options, and by the
create-workspace form, register page, and account-reset section with explicit
catalog options - the prop-fed mode also disables the ambient query, which those
pre-workspace/pre-auth call sites have nothing to answer),
`CurrenciesSettingsSection` (workspace-settings section, admin-gated: enabled
list with per-row reorder arrows (first = primary) and disable, catalog enable
picker, and an inline custom-currency form - custom currencies are always
2-decimal).

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
period; the name is derived from the date range until edited), `ManageCategoriesModal`
(archive/merge/delete manager for a budget's categories - archive-first: delete is
offered only on already-archived rows and states the live transaction count, merge
picks the target that keeps the history; mount-per-use, lists archived-inclusive).

**Dashboard** (`components/dashboard/`): `BudgetInsights` (planned-vs-actual
widget: horizontal paired bars per category (top 6 + Other) or grouped columns
per period, a table/chart view toggle, per-currency Select and hover tooltips;
chart tokens - series-1 = planned, series-2 = actual, text never wears series
color).

**Transactions** (`components/transactions/` + `components/modals/transactions/`):
`TransactionFormModal` (with Items/Receipts tabs; optional account - "No account"
is first-class, adjustments excepted - plus an own-currency select that locks to
the account's when one is set; receipt-first create seeds the own currency from
the parsed code when it is enabled and auto-selects the matching account -
preferring the per-currency default; description autocomplete over frequent
descriptions of the picked type, applied only on explicit Enter/click; an
optional free-text note behind an "Add note" disclosure that opens pre-expanded
when the edited transaction carries one), `TransactionItemsEditor` (loads a saved transaction's items and persists edits
through the list), `TransactionItemsList` (the editable rows grid both the
editor and the create modal render - name/quantity/unit price/line total with
add/remove/reorder, stable per-row identity, touch-aware),
`TransactionAttachments` (upload + view/download, extraction),
`ExtractionReviewModal`, `PlannedFormModal` (same optional-account +
own-currency pairing; account-less plans default to the workspace primary).

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
  createWorkspace: (name: string, currencyCodes?: string[]) => Promise<Workspace>;
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

The choice is persisted to `localStorage` under `owlgarth_theme` (`'light'` | `'dark'` | `null`). `null` (no stored value) means the light theme - the OS `prefers-color-scheme` is ignored; once the user toggles, the stored choice wins. An inline script in `index.html` sets the `.dark` class on `<html>` before React hydration to prevent a flash of the wrong theme.

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
  canManageAccounts,        // owner, admin (alias of canManageBudgetAccounts)
  canManageCurrencies,      // owner, admin (same check; gates the currencies settings section)
  canWrite,                 // owner, admin, member (alias of canManageBudgetData)
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
| `currenciesApi` | Catalog + enabled currencies (enable/disable/custom/reorder) |
| `accountsApi` | Accounts, archive, computed balance |
| `budgetsApi` | Budgets + nested periods, categories, category-budgets |
| `transactionsApi` | Transactions (filters, totals, bulk-account, filtered JSON export, frequent descriptions), line items, attachments, extraction, receipt parse |
| `transfersApi` | Transfers between accounts |
| `plannedTransactionsApi` | Planned with execute, totals by `currency`/`category`, filtered JSON export |
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
  currency_codes: string[];  // ordered set; first = default view
  // …description/color/icon/display_order
}

interface Transaction {
  id: number;
  account_id: number | null;  // null on account-less rows
  account_name: string | null;
  currency_code: string;     // the stored own currency (== the account's when set)
  date: string;
  description: string;
  note: string | null;      // free-text remarks, informational like description; never read by aggregates
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
