# Monie Development Roadmap

## Context

Monie is a full-stack personal finance app (Django 6 + Django Ninja, React 19, PostgreSQL). It's a working pet project being prepared for open-source. The codebase has solid foundations -- good test coverage on backend, strict TypeScript, clean component structure -- but has security gaps, no CI/CD, business logic mixed into endpoints, a broken offline mode, and top-bar navigation that should become a sidebar.

This roadmap contains GitHub issues organized into milestones, ordered by priority and dependency.

---

## Phase 1: Security & CI/CD Foundation

**Milestone: `v0.2 - Security & CI/CD`**
Do first. Security issues are critical, and CI/CD must exist before large refactors.

---

### ~~Issue 1: Fix hardcoded security settings~~ ✅ Done

**Labels:** `security`, `critical`

**Problem:**
- `config/settings.py:24` -- `DEBUG = True` hardcoded
- `config/settings.py:13` -- `SECRET_KEY` has insecure default string
- `config/settings.py:26` -- `ALLOWED_HOSTS = ['*']`
- `config/settings.py:16` -- `JWT_SECRET_KEY` silently falls back to `SECRET_KEY`
- No HTTPS enforcement, no secure cookie settings

**Implementation:**

1. In `backend/config/settings.py`:
```python
# Replace line 13
SECRET_KEY = os.environ['SECRET_KEY']  # No default -- crash if missing

# Replace line 16
JWT_SECRET_KEY = os.environ['JWT_SECRET_KEY']  # Separate required key

# Replace line 24
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

# Replace line 26
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',') if os.getenv('ALLOWED_HOSTS') else []

# Replace lines 34-37 (CORS)
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS.copy()
```

2. Add production security block at the bottom of settings.py:
```python
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
```

3. Update `example.env`:
```env
SECRET_KEY=change-me-to-random-64-char-string
JWT_SECRET_KEY=change-me-to-different-random-64-char-string
DEBUG=true
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

4. Update `docker-compose.yml` environment section to pass these vars.

**Tests:** Run existing test suite (tests use their own settings). Add a test that verifies `SECRET_KEY` raises if env var missing.

---

### ~~Issue 2: Add missing role checks to budgets, categories, budget_periods, period_balances~~ ✅ Done

**Labels:** `security`, `critical`

**Problem:** These 4 endpoint files only verify workspace access but never check user role. A viewer can create/update/delete data.

**Implementation:**

1. Define the `require_role` helper in each file (or import from `common/` if already extracted). It already exists in `transactions/api.py`, `planned_transactions/api.py`, etc. as a reference.

2. Add to `budgets/api.py` -- insert before the create logic:
```python
from workspaces.models import WorkspaceMember

def require_role(user, workspace_id: int, allowed_roles: list[str]) -> None:
    try:
        member = WorkspaceMember.objects.get(workspace_id=workspace_id, user=user)
        role = member.role
    except WorkspaceMember.DoesNotExist:
        role = 'viewer'
    if role not in allowed_roles:
        raise HttpError(403, f'Insufficient permissions. Required: {", ".join(allowed_roles)}. Your role: {role}')
```

3. Add `require_role(user, workspace.id, ['owner', 'admin', 'member'])` at the top of:
   - `create_budget()` in `budgets/api.py:74`
   - `update_budget()` in `budgets/api.py:105`
   - `delete_budget()` in `budgets/api.py:127`
   - All write endpoints in `categories/api.py`
   - All write endpoints in `budget_periods/api.py`
   - All write endpoints in `period_balances/api.py`

4. Do the same for each of the 4 files.

5. Add tests in each app's test file:
```python
def test_viewer_cannot_create_budget(self):
    # Create a viewer member
    WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
    response = self.post('/backend/budgets', data={...})
    self.assertStatus(response, 403)
```

**Files to modify:**
- `backend/budgets/api.py`
- `backend/categories/api.py`
- `backend/budget_periods/api.py`
- `backend/period_balances/api.py`
- Each app's test file

---

### Issue 3: Add rate limiting to login and file imports

**Labels:** `security`, `high`

**Implementation:**

1. Add dependency: `uv add django-ratelimit`

2. Add settings in `config/settings.py`:
```python
# File upload limits
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # 5MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024   # 5MB
```

3. For Django Ninja rate limiting, use a custom decorator or middleware. Django Ninja doesn't natively support `django-ratelimit`, so use a simple approach -- a throttling decorator:

```python
# common/throttle.py
from functools import wraps
from django.core.cache import cache
from ninja.errors import HttpError

def rate_limit(key_prefix: str, limit: int = 10, period: int = 60):
    """Simple rate limiter using Django cache."""
    def decorator(func):
        @wraps(func)
        def wrapper(request, *args, **kwargs):
            ip = request.META.get('REMOTE_ADDR', 'unknown')
            cache_key = f'ratelimit:{key_prefix}:{ip}'
            count = cache.get(cache_key, 0)
            if count >= limit:
                raise HttpError(429, 'Too many requests. Please try again later.')
            cache.set(cache_key, count + 1, period)
            return func(request, *args, **kwargs)
        return wrapper
    return decorator
```

4. Apply to login endpoint in `core/api.py`:
```python
@router.post('/login', response={200: AuthOut, 401: DetailOut})
@rate_limit('login', limit=10, period=60)
def login(request, data: LoginIn):
    ...
```

5. Add file size validation in import endpoints before JSON parsing:
```python
if file.size > 5 * 1024 * 1024:
    raise HttpError(400, 'File too large. Maximum 5MB.')
```

Add this check to import endpoints in: `transactions/api.py`, `categories/api.py`, `planned_transactions/api.py`, `currency_exchanges/api.py`.

---

### ~~Issue 4: Set up GitHub Actions CI~~ - Done

**Labels:** `infra`, `high`

**Implementation:**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run pytest -v
    env:
      SECRET_KEY: test-secret-key-for-ci
      JWT_SECRET_KEY: test-jwt-key-for-ci
      DEBUG: 'true'

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

Add CI badge to `README.md`.

**Note:** Backend tests use SQLite in-memory (configured in pytest settings), so no PostgreSQL service needed in CI.

---

### ~~Issue 5: Add pre-commit hooks and CONTRIBUTING.md~~ - Done

**Labels:** `dx`, `medium`

**Implementation:**

1. Create `.pre-commit-config.yaml` at project root:
```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.14.10
    hooks:
      - id: ruff
        args: [--fix]
        files: ^backend/
      - id: ruff-format
        files: ^backend/
```

2. Create `CONTRIBUTING.md` at project root with sections:
   - Development setup (backend with uv, frontend with npm, Docker)
   - Code style (link to ruff config in pyproject.toml, eslint config)
   - Running tests (`pytest` for backend, eventual `vitest` for frontend)
   - PR process (reference `.github/pull_request_template.md`)
   - Issue reporting guidelines

---

### Issue 6: Pin dependency version ranges

**Labels:** `infra`, `medium`

**Implementation:**

Update `backend/pyproject.toml` dependencies:
```toml
dependencies = [
    "django>=6.0,<7.0",
    "django-cors-headers>=4.9.0,<5.0",
    "django-ninja>=1.5.1,<2.0",
    "email-validator>=2.0,<3.0",
    "pyjwt>=2.10.1,<3.0",
    "psycopg2-binary>=2.9.10,<3.0",
    "python-dotenv>=1.2.1,<2.0",
    "python-dateutil>=2.9.0,<3.0",
    "uvicorn>=0.40.0,<1.0",
]
```

Run `uv lock` after updating to regenerate the lockfile.

---

## Phase 2: Remove Offline Mode

**Milestone: `v0.3 - Remove Offline Mode`**
Do before service layer and sidebar. Removes substantial dead code.

---

### ~~Issue 7: Remove offline sync infrastructure~~ ✅ Done

**Labels:** `frontend`, `breaking`

**Implementation:**

**Step 1 -- Delete files entirely:**
- `src/utils/syncQueue.ts`
- `src/utils/optimisticUpdates.ts`
- `src/utils/offlineDisplayCache.ts`
- `src/hooks/useOfflineSync.ts`
- `src/hooks/useOnlineStatus.ts`
- `src/components/common/OfflineIndicator.tsx`

**Step 2 -- Simplify `src/api/client.ts`:**

Remove:
- `OfflineError` class
- `getOfflineContext()` function
- `queryClientRef` variable
- `initializeOfflineInterceptors()` function
- The request interceptor that queues offline mutations (lines ~90-127)
- The response interceptor branch that catches network errors for offline (lines ~144-176)

Keep:
- Base axios instance creation
- Token management functions (`setAuthToken`, `getAuthToken`, `clearAuthToken`)
- All API module functions (`authApi`, `transactionsApi`, etc.)
- The 401 response interceptor (redirect to login on expired token)

Simplified interceptor:
```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthToken()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

**Step 3 -- Simplify `src/main.tsx`:**

Remove:
- `initializeOfflineInterceptors` import and call
- `PersistQueryClientProvider` and `idb-keyval` dependency (unless keeping for perf caching)
- Offline-optimized QueryClient config (`gcTime: 24 * 60 * 60 * 1000`)

Replace with standard setup:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
```

**Step 4 -- Clean up `src/App.tsx`:**
- Remove `OfflineIndicator` import and `<OfflineIndicator />` from JSX

**Step 5 -- Search and clean all components:**

Search for these patterns across all `.tsx` files and remove:
- `isOfflineItem` imports and checks (used in `TransactionList.tsx` and others for offline item styling)
- `_offline` and `_tempId` field references
- Any `useOfflineSync` or `useOnlineStatus` imports

**Step 6 -- Remove unused packages:**
```bash
cd frontend
npm uninstall idb-keyval @tanstack/react-query-persist-client
```

**Verification:** `npm run build` should succeed with no TypeScript errors. All pages should load and function. Mutations (create/edit/delete) should work normally.

---

### ~~Issue 8: Clean up offline localStorage keys~~ ✅ Done

**Labels:** `frontend`, `low`

**Implementation:**

Add cleanup in `src/main.tsx` or `src/App.tsx` (run once on mount):
```typescript
// One-time cleanup of legacy offline storage
localStorage.removeItem('offline_sync_queue')
localStorage.removeItem('offline_display_cache')
```

Can be removed after a few releases.

---

## Phase 3: Backend Service Layer

**Milestone: `v0.4 - Service Layer`**
Can run in parallel with Phase 4 (sidebar).

---

### ~~Issue 9: Extract shared helpers to `common/services/`~~ ✅ Done

**Labels:** `backend`, `refactor`

**Problem:** `get_workspace_period()` copy-pasted across 8 files. ~~`require_role()` in 5 files.~~ *(Partially done — `require_role` centralized to `common/permissions.py` and `Role` enum added to `workspaces/models.py` in Issue 2.)* `get_or_create_period_balance()` in 4 files.

**Implementation:**

1. Create directory structure:
```
backend/common/services/
├── __init__.py
└── base.py
```

2. In `common/services/base.py`:
```python
from ninja.errors import HttpError
from budget_periods.models import BudgetPeriod
from period_balances.models import PeriodBalance
from workspaces.models import WorkspaceMember


def get_workspace_period(period_id: int, workspace_id: int) -> BudgetPeriod | None:
    """Get a period and verify it belongs to the workspace."""
    return (
        BudgetPeriod.objects.select_related('budget_account')
        .filter(id=period_id, budget_account__workspace_id=workspace_id)
        .first()
    )


def require_role(user, workspace_id: int, allowed_roles: list[str]) -> None:
    """Raise 403 if user's role is not in allowed_roles."""
    try:
        member = WorkspaceMember.objects.get(workspace_id=workspace_id, user=user)
        role = member.role
    except WorkspaceMember.DoesNotExist:
        role = 'viewer'
    if role not in allowed_roles:
        raise HttpError(403, f'Insufficient permissions. Required: {", ".join(allowed_roles)}. Your role: {role}')


def get_or_create_period_balance(period_id: int, currency: str, user=None) -> PeriodBalance:
    """Get or create a period balance for a given currency."""
    balance, created = PeriodBalance.objects.get_or_create(
        budget_period_id=period_id,
        currency=currency,
        defaults={
            'opening_balance': 0,
            'total_income': 0,
            'total_expenses': 0,
            'exchanges_in': 0,
            'exchanges_out': 0,
            'closing_balance': 0,
            'created_by': user,
            'updated_by': user,
        },
    )
    return balance
```

3. Update each api.py file to import from `common.services.base` instead of defining locally. Example for `budgets/api.py`:
```python
# Remove local get_workspace_period, require_role definitions
from common.services.base import get_workspace_period, require_role
```

4. Do this for all 8+ api.py files that have local copies.

**Verification:** Run `pytest -v` -- all existing tests must pass unchanged.

---

### ~~Issue 10: Extract transaction service~~ ✅ Done

**Labels:** `backend`, `refactor`
**Depends on:** Issue 9

**Implementation:**

1. Create `backend/transactions/services.py`:

```python
from decimal import Decimal
from django.db import transaction as db_transaction
from ninja.errors import HttpError

from common.services.base import get_workspace_period, get_or_create_period_balance, require_role
from transactions.models import Transaction
from period_balances.models import PeriodBalance


def update_period_balance(period_id: int, currency: str, trans_type: str, amount: Decimal, operation: str) -> None:
    """Update period balance when a transaction is created/deleted.
    operation: 'add' or 'subtract'
    """
    balance = get_or_create_period_balance(period_id, currency)
    if operation == 'add':
        if trans_type == 'income':
            balance.total_income += amount
        else:
            balance.total_expenses += amount
    elif operation == 'subtract':
        if trans_type == 'income':
            balance.total_income -= amount
        else:
            balance.total_expenses -= amount
    balance.closing_balance = (
        balance.opening_balance + balance.total_income - balance.total_expenses
        + balance.exchanges_in - balance.exchanges_out
    )
    balance.save()


@db_transaction.atomic
def create_transaction(user, workspace, data) -> Transaction:
    """Create a transaction and update period balance."""
    require_role(user, workspace.id, ['owner', 'admin', 'member'])
    period = get_workspace_period(data.budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    txn = Transaction.objects.create(
        budget_period=period,
        category_id=data.category_id,
        name=data.name,
        amount=data.amount,
        currency=data.currency,
        type=data.type,
        date=data.date,
        created_by=user,
        updated_by=user,
    )
    update_period_balance(period.id, txn.currency, txn.type, txn.amount, 'add')
    return txn

# Similar for update_transaction, delete_transaction, import_transactions, export_transactions
```

2. Slim down `transactions/api.py` endpoints to be thin wrappers:
```python
@router.post('', response={201: TransactionOut}, auth=JWTAuth())
def create_transaction_endpoint(request, data: TransactionCreate):
    user = request.auth
    workspace = user.current_workspace
    if not workspace:
        raise HttpError(404, 'No workspace selected')
    txn = services.create_transaction(user, workspace, data)
    return 201, txn
```

3. Move `update_period_balance` to `common/services/base.py` since it's also used by currency exchanges.

**Verification:** Run `pytest transactions/` -- all existing integration tests must pass.

---

### ~~Issue 11: Extract budget period service (copy logic)~~

**Labels:** `backend`, `refactor`
**Depends on:** Issue 9

**Implementation:**

Create `backend/budget_periods/services.py`. The main extraction target is the `copy_period` endpoint (currently `budget_periods/api.py` lines 170-269) which contains:

1. Source period validation and workspace check
2. New period creation with date range
3. Period balance initialization for all currencies
4. Category copying with old-to-new ID mapping
5. Budget copying using category mapping
6. Planned transaction copying with date adjustment

```python
# budget_periods/services.py
from django.db import transaction as db_transaction
from common.services.base import get_workspace_period, require_role, get_or_create_period_balance

@db_transaction.atomic
def copy_period(user, workspace, source_period_id: int, data) -> BudgetPeriod:
    """Copy a period with all its categories, budgets, and planned transactions."""
    require_role(user, workspace.id, ['owner', 'admin', 'member'])
    source = get_workspace_period(source_period_id, workspace.id)
    if not source:
        raise HttpError(404, 'Source period not found')

    # Create new period
    new_period = BudgetPeriod.objects.create(...)

    # Init balances, copy categories with mapping, copy budgets, copy planned txns
    # (move the existing logic from api.py lines 170-269)

    return new_period
```

---

### ~~Issue 12: Extract remaining services~~

**Labels:** `backend`, `refactor`
**Depends on:** Issue 9

**Implementation:**

Create service files for each remaining app following the same pattern:

**`currency_exchanges/services.py`:**
- `create_exchange()` -- creates exchange record and updates period balance (exchanges_in/exchanges_out)
- `delete_exchange()` -- reverses balance updates
- Uses `update_exchange_balance()` from `common/services/base.py`

**`planned_transactions/services.py`:**
- `execute_planned()` -- the orchestration logic that creates a real Transaction from a PlannedTransaction, updates PeriodBalance, and marks planned as done. Currently in `planned_transactions/api.py` lines 402-461.
- `create_planned()`, `update_planned()`, `delete_planned()`

**`budgets/services.py`:**
- `create_budget()` -- validates category belongs to period
- `update_budget()`, `delete_budget()`

**`categories/services.py`:**
- `import_categories()` -- JSON file parsing and bulk creation
- `export_categories()` -- queryset to JSON response

**`period_balances/services.py`:**
- `recalculate_period_balance()` -- the full recalculation logic (currently ~60 lines in `period_balances/api.py`)

**`reports/services.py`:**
- `get_budget_summary()` -- aggregation query
- `get_current_balances()` -- balance lookup across currencies

Each api.py becomes a thin wrapper: parse request -> call service -> return response.

---

### Issue 13: Make currencies configurable

**Labels:** `backend`, `enhancement`

**Problem:** `['PLN', 'USD', 'EUR', 'UAH']` hardcoded in 3 files.

**Implementation (Option B -- per-workspace currencies):**

1. Add field to Workspace model in `workspaces/models.py`:
```python
from django.contrib.postgres.fields import ArrayField

class Workspace(models.Model):
    # ... existing fields ...
    currencies = ArrayField(
        models.CharField(max_length=3),
        default=list,  # empty by default, populated on creation
        blank=True,
    )
```

2. Generate migration: `python manage.py makemigrations workspaces`

3. Add data migration to populate existing workspaces with `['PLN', 'USD', 'EUR', 'UAH']`.

4. Add helper in `common/services/base.py`:
```python
def get_workspace_currencies(workspace) -> list[str]:
    return workspace.currencies or ['USD', 'EUR']  # sensible default
```

5. Replace hardcoded lists in:
   - `budget_periods/api.py` lines 108, 196
   - `period_balances/api.py` line 204
   - `reports/api.py` line 141

6. Add API endpoint or include currencies in workspace serializer so frontend can display/configure them.

---

## Phase 4: Sidebar Navigation

**Milestone: `v0.5 - Sidebar Navigation`**
Can run in parallel with Phase 3.

---

### Issue 14: Create sidebar layout component

**Labels:** `frontend`, `ui`

**Problem:** Current nav is a top bar in `App.tsx` (lines 153-273) with: `navItems` array, `NavGridButton`, `PagesPanel`, inline user menu, inline layout toggle.

**Implementation:**

1. Create `src/components/layout/Sidebar.tsx`:
```tsx
interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation()
  const { user } = useAuth()

  const navItems = [
    { path: '/', label: 'Dashboard', icon: HiHome },
    { path: '/transactions', label: 'Transactions', icon: HiCurrencyDollar },
    { path: '/planned', label: 'Planned', icon: HiCalendar },
    { path: '/exchanges', label: 'Exchanges', icon: HiSwitchHorizontal },
    { path: '/categories', label: 'Categories', icon: HiTag },
    { path: '/budget-periods', label: 'Periods', icon: HiClock },
    { path: '/budget-accounts', label: 'Accounts', icon: HiBriefcase },
    { path: '/members', label: 'Members', icon: HiUserGroup },
  ]

  return (
    <aside className={`flex flex-col h-screen bg-white border-r border-gray-200 transition-all
      ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        <h1 className={collapsed ? 'text-center text-lg font-bold' : 'text-xl font-bold'}>
          {collapsed ? 'M' : 'Monie'}
        </h1>
      </div>

      {/* Account & Period selectors */}
      {!collapsed && (
        <div className="p-3 space-y-2 border-b border-gray-200">
          <BudgetAccountSelector />
          <NavigationPeriodSelector />
        </div>
      )}

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto p-2">
        {navItems.map(item => (
          <NavLink key={item.path} to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
              ${isActive ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`
            }>
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User menu at bottom */}
      <div className="p-3 border-t border-gray-200">
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  )
}
```

2. Create `src/components/layout/MainLayout.tsx`:
```tsx
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('monie-sidebar-collapsed') === 'true'
  )

  const toggleCollapse = () => {
    setCollapsed(prev => {
      localStorage.setItem('monie-sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  )
}
```

3. Update `App.tsx` to use `MainLayout` around the route outlet instead of the current top bar nav.

**Files to create:**
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/MainLayout.tsx`

**Files to modify:**
- `src/App.tsx` -- replace top bar with `<MainLayout>` wrapper

---

### Issue 15: Responsive sidebar with mobile drawer

**Labels:** `frontend`, `ui`
**Depends on:** Issue 14

**Implementation:**

1. Add mobile state to `MainLayout.tsx`:
```tsx
const [mobileOpen, setMobileOpen] = useState(false)

// Detect screen size
const isMobile = useMediaQuery('(max-width: 767px)')
const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
```

2. Create a `useMediaQuery` hook (or use a simple implementation):
```tsx
// src/hooks/useMediaQuery.ts
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}
```

3. Mobile behavior:
   - Sidebar hidden by default
   - Hamburger button in a slim top bar (or floating)
   - Sidebar slides in as overlay with backdrop
   - Closes on navigation (listen to `location` changes)
   - Close on Escape key

4. Tablet behavior:
   - Collapsed sidebar by default (icons only, ~64px)
   - Expand on hover or toggle button

5. Desktop (>=1024px):
   - Persistent sidebar, user-controlled collapse

---

### Issue 16: Clean up old top-bar navigation code

**Labels:** `frontend`, `cleanup`
**Depends on:** Issue 14

**Implementation:**

Remove from `App.tsx`:
- `NavGridButton` component (inline in App.tsx)
- `PagesPanel` component (inline in App.tsx)
- `navItems` array (moved to Sidebar)
- `NavigationPeriodSelector` (moved to Sidebar)
- `LayoutToggle` (moved to Sidebar or removed)
- `UserMenu` inline JSX (moved to Sidebar as separate component)
- `MENU_OPEN_STORAGE_KEY` constant
- `pagesMenuOpen` state
- The entire `<nav>` element

Move `UserMenu` to its own file if not already: `src/components/layout/UserMenu.tsx`.

Remove unused icon imports: `HiViewGrid`, `HiViewList`, `HiArrowsExpand`, etc.

---

## Phase 5: Testing & Reliability

**Milestone: `v0.6 - Test Coverage`**

---

### Issue 17: Add Pydantic validators to input schemas

**Labels:** `backend`, `validation`

**Implementation:**

Audit and add validators to schemas. Examples:

```python
# budget_periods/schemas.py
from pydantic import field_validator

class BudgetPeriodCreate(Schema):
    name: str
    start_date: date
    end_date: date
    budget_account_id: int

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()

    @field_validator('end_date')
    @classmethod
    def end_after_start(cls, v, info):
        if 'start_date' in info.data and v <= info.data['start_date']:
            raise ValueError('End date must be after start date')
        return v
```

```python
# currency_exchanges/schemas.py
class CurrencyExchangeCreate(Schema):
    from_currency: str
    to_currency: str

    @field_validator('to_currency')
    @classmethod
    def currencies_differ(cls, v, info):
        if 'from_currency' in info.data and v == info.data['from_currency']:
            raise ValueError('From and to currencies must be different')
        return v
```

Add validators to all create/update schemas across all apps.

---

### Issue 18: Set up frontend testing with Vitest

**Labels:** `frontend`, `testing`

**Implementation:**

1. Install dependencies:
```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

2. Add to `vite.config.ts`:
```typescript
/// <reference types="vitest" />
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

3. Create `src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

4. Add script to `package.json`:
```json
"test": "vitest",
"test:ci": "vitest run"
```

5. Write initial tests:
   - `src/api/__tests__/client.test.ts` -- token management (setAuthToken, getAuthToken, clearAuthToken)
   - `src/contexts/__tests__/AuthContext.test.tsx` -- login/logout flows
   - `src/components/transactions/__tests__/TransactionList.test.tsx` -- rendering, sort toggle

6. Add `npm run test:ci` to GitHub Actions CI workflow.

---

### Issue 19: Add React Error Boundary

**Labels:** `frontend`, `reliability`

**Implementation:**

Create `src/components/common/ErrorBoundary.tsx`:
```tsx
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-4">An unexpected error occurred.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-800"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
```

Wrap in `App.tsx` around the router or in `main.tsx` around `<App />`.

---

### Issue 20: Add backend service layer unit tests

**Labels:** `backend`, `testing`
**Depends on:** Phase 3

**Implementation:**

Create test files alongside services:

```python
# transactions/tests/test_services.py
from django.test import TestCase
from common.tests.mixins import AuthMixin
from transactions.services import create_transaction, update_period_balance

class TestCreateTransaction(AuthMixin, TestCase):
    def test_creates_transaction_and_updates_balance(self):
        # Setup period, category
        txn = create_transaction(self.user, self.workspace, data)
        self.assertEqual(txn.amount, Decimal('100.00'))
        # Verify balance was updated
        balance = PeriodBalance.objects.get(budget_period=self.period, currency='USD')
        self.assertEqual(balance.total_expenses, Decimal('100.00'))

    def test_viewer_cannot_create(self):
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        with self.assertRaises(HttpError):
            create_transaction(self.user, self.workspace, data)

    def test_balance_reversal_on_update(self):
        # Create, then update amount -- old balance subtracted, new added
        ...
```

Focus areas:
- Balance calculation correctness (create, update, delete)
- Period copy logic edge cases
- Exchange balance updates (exchanges_in/exchanges_out)
- Permission enforcement at service level

---

## Phase 6: Open Source Polish

**Milestone: `v0.7 - Open Source Readiness`**

---

### Issue 21: Add SECURITY.md and CODE_OF_CONDUCT.md

**Labels:** `docs`

**Implementation:**

Create `SECURITY.md`:
```markdown
# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Email [your-email] with details
3. Include steps to reproduce if possible

We will respond within 48 hours and provide a fix timeline.

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | Yes       |
```

Create `CODE_OF_CONDUCT.md` -- adopt Contributor Covenant v2.1.

---

### Issue 22: Add CHANGELOG.md

**Labels:** `docs`

**Implementation:**

Create `CHANGELOG.md` following Keep a Changelog format:
```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.0] - 2025-xx-xx
### Added
- Initial release with multi-workspace budget tracking
- JWT authentication with role-based access control
- Multi-currency support
- Transaction, category, budget management
- Import/export functionality
- Docker deployment
```

Update with each milestone completion.

---

### Issue 23: Production Docker configuration

**Labels:** `infra`

**Implementation:**

1. Add health checks to `docker-compose.yml`:
```yaml
services:
  monie_db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  monie_api:
    depends_on:
      monie_db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/backend/docs"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
```

2. Create `docker-compose.prod.yml` with overrides:
   - No source volume mounts
   - Proper environment variable handling (from `.env.production`)
   - Resource limits
   - Gunicorn instead of uvicorn dev server

---

### Issue 24: Update docs post-refactor

**Labels:** `docs`
**Depends on:** Phases 2-4

**Implementation:**

Update these files to reflect the new architecture:
- `README.md` -- remove offline mode references, update architecture overview
- `CLAUDE.md` -- document service layer pattern, update file structure, remove offline section
- `docs/architecture.md` -- add service layer diagram, update data flow
- `docs/workflow.md` -- remove offline workflow section
- `docs/frontend.md` -- document sidebar, remove offline components
- `backend/README.md` -- document service layer convention
- `frontend/README.md` -- update component structure (layout/)

---

## Dependency Graph

```
Phase 1 (Security & CI/CD) -- do first, no deps
    |
    +-- Phase 2 (Remove Offline) -- CI catches regressions
    |       |
    |       +-- Phase 3 (Service Layer) -- less code to refactor
    |       |
    |       +-- Phase 4 (Sidebar) -- offline indicator gone
    |               |
    +---------------+
    |
    Phase 5 (Testing) -- needs services to exist
    |
    Phase 6 (Docs) -- after everything settles
```

Phases 3 and 4 can run in parallel (backend vs frontend, no cross-deps).

---

## Deliberately Excluded

- **Refresh tokens / token rotation** -- current 1h JWT works fine
- **Full accessibility audit** -- separate effort, not part of this roadmap
- **API versioning** -- no external consumers yet
- **Frontend state management overhaul** -- current context + React Query is solid
- **Database FK indexes** -- Django auto-creates these on ForeignKey fields
