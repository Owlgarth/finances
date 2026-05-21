# Application Workflow

This document describes the main workflows and user flows in the Denarly application.

## User Registration and Authentication

### Registration Flow

```
1. User visits registration page
2. User enters:
   - Email address
   - Password (min 8 characters)
   - Full name (optional)
   - Workspace name
3. System creates:
   - User account with hashed password
   - Workspace with user as owner
   - Default "General" budget account
   - workspace_members entry (owner role)
4. System returns JWT access token
5. User is redirected to dashboard
```

### Login Flow

```
1. User visits login page
2. User enters email and password
3. System validates credentials against bcrypt hash
4. System returns JWT access token (valid for 60 minutes)
5. Token stored in localStorage
6. User redirected to dashboard
```

### Protected Access Flow

```
1. Frontend adds Authorization header to all API requests
2. Backend validates JWT token on each request
3. If token invalid/expired → 401 response
4. Frontend interceptor catches 401 → clears token → redirects to login
```

## Budget Management Workflow

### Viewing Budget Overview (Dashboard)

```
1. User views Dashboard (/)
2. Dashboard displays multi-panel overview:
   - Period Header: period name, date range, elapsed-days progress bar
   - Balance Cards: closing balance per currency (compact bar)
   - Budget Health: per-currency on-track/over-budget counts + top overspent categories
   - Frequent Spending: top 5 most frequent transaction descriptions with totals
   - Upcoming Planned: pending planned transactions due within 7 days with countdown
   - Exchange Activity: currency exchange totals by pair for the period
3. Each widget links to its full detail page
```

### Managing Budgets (Budgets Page)

```
1. User navigates to Budgets page (/budgets)
2. System displays:
   - Balance section (opening/closing per currency)
   - Budget vs Actual table (per-category budget amounts, actual spending, remaining)
3. User can create, edit, or delete budget amounts (requires member role or above)
4. Budget summary data is shared with the Dashboard Budget Health widget
```

### Setting Up a Budget Period

```
1. User navigates to Budget Periods page
2. User creates new period:
   - Name (e.g., "January 2025")
   - Start date
   - End date
   - Budget account assignment
3. User creates categories for the period:
   - Food, Transport, Utilities, Entertainment, etc.
4. User sets budget amounts per category:
   - Category selection
   - Currency selection
   - Budget amount
5. Period is ready for tracking
```

### Copy Period Workflow

```
1. User has existing period with categories and budgets
2. User clicks "Copy" on the period
3. System creates new period with:
   - Copied categories
   - Copied budget amounts
   - New date range
4. User adjusts dates and amounts as needed
```

## Transaction Management

### Recording a Transaction

```
1. User navigates to Transactions page
2. User clicks "Add Transaction"
3. User enters:
   - Date
   - Description
   - Amount
   - Currency
   - Type (income/expense)
   - Category (for expenses only)
4. System auto-assigns period based on date
5. System updates period balance:
   - Income → increases total_income
   - Expense → increases total_expenses
6. Closing balance recalculated
```

### Transaction Validation

```
Income transactions:
- category_id must be null
- Amount must be positive

Expense transactions:
- category_id must belong to assigned period
- Amount must be positive
```

## Planned Transactions

### Creating a Planned Transaction

```
1. User navigates to Planned page
2. User clicks "Add Planned"
3. User enters:
   - Name/description
   - Amount and currency
   - Category
   - Planned date
4. If status is "pending":
   - Planned transaction saved, no side effects
5. If status is "done":
   - Planned transaction saved with status='done' and payment_date set
   - Celery task dispatched to create actual transaction async
   - Service returns the planned transaction (refreshed from DB)
```

### Executing a Planned Transaction

```
1. User views pending planned transaction
2. User clicks "Execute"
3. User confirms payment date
4. Service validates period exists for payment date
5. Service sets status='done', payment_date, saves
6. Service dispatches Celery task (execute_planned_transaction.delay)
7. [Async] Celery worker:
   - Re-fetches planned transaction with row lock (select_for_update)
   - Idempotency check: skips if transaction_id already set
   - Creates actual Transaction via TransactionService.create()
     - Amount, currency, category, description copied from planned
     - Date set to payment date
     - PeriodBalance updated (income/expense + closing balance)
   - Links planned.transaction_id to the new Transaction
8. Planned transaction status → "done"
```

## Currency Exchange Workflow

### Recording an Exchange

```
1. User navigates to Currency Exchanges page
2. User clicks "Add Exchange"
3. User enters:
   - Date
   - Source currency and amount
   - Target currency and amount
   - Exchange rate (auto-calculated)
4. System updates period balances:
   - exchanges_out increased for source currency
   - exchanges_in increased for target currency
```

## Balance Calculation

### Automatic Balance Updates

Balances are updated incrementally on:
- Transaction create/update/delete
- Currency exchange create/delete
- Planned transaction execution (via Celery task, which calls `TransactionService.create()`)

All closing balance calculations use `PeriodBalance.recalculate_closing_balance()`, a single method on the model that centralizes the formula: `opening + income - expenses + exchanges_in - exchanges_out`. This ensures consistency across all callers (transaction services, exchange services, period balance services, and the Celery task).

### Balance Recalculation

```
1. User clicks "Recalculate" on balance section
2. System recalculates from scratch:
   - Sums all income transactions
   - Sums all expense transactions
   - Sums all exchange inflows
   - Sums all exchange outflows
3. Closing balance = opening + income - expenses + exchanges_in - exchanges_out
```

### Opening Balance Carryover

```
1. Period A ends with closing balance of $1000
2. Period B is created after Period A
3. Period B's opening balance set to $1000
4. User can manually adjust opening balance if needed
```

## Workspace Management

### Creating a Workspace

```
1. User clicks workspace selector in sidebar
2. User clicks "Create workspace" option
3. User enters workspace name
4. System creates:
   - New workspace with user as owner
   - Default "General" budget account
   - Default currencies (USD, UAH, PLN, EUR)
5. System auto-switches user to new workspace
6. All data views refresh to empty workspace
```

### Switching Workspaces

```
1. User belongs to multiple workspaces
2. User clicks workspace selector in sidebar
3. User selects different workspace from dropdown
4. System updates current_workspace_id in token
5. All data views refresh to new workspace:
   - Budget accounts list updates
   - Selected account/period cleared
   - Transactions, categories, budgets reload
```

### Deleting a Workspace (Owner Only)

```
1. Owner clicks workspace selector → settings gear
2. WorkspaceSettingsPanel opens
3. Owner clicks "Delete workspace"
4. Confirmation dialog appears (requires multiple workspaces)
5. Owner confirms deletion
6. System:
   - Deletes all workspace data (cascade)
   - Removes all memberships
   - Auto-switches user to another workspace
7. All data views refresh
```

**Restrictions:**
- Only owner can delete
- Cannot delete if it's the only workspace
- Deletion is permanent (all budget data lost)

### Leaving a Workspace (Non-Owner)

```
1. Non-owner clicks workspace selector → settings gear
2. WorkspaceSettingsPanel opens (no delete option)
3. Non-owner cannot delete, only owner sees delete button
4. To leave, member uses Members page "Leave" action
5. System removes membership
6. If this was current workspace, auto-switches to another
```

### Adding Members

```
1. Owner/Admin navigates to Members page
2. Clicks "Add Member"
3. Enters:
   - Email address
   - Role (admin/member/viewer)
   - Full name (optional)
4. If user exists:
   - Added to workspace immediately
5. If user doesn't exist:
   - User created with temp password
   - Admin receives temp password to share
6. New member can access workspace
```

## Report Generation

### Budget Summary Report

```
1. User views Dashboard Budget Health widget (or Budgets page)
2. System fetches budget summary for current period
3. Displays per-category:
   - Budget amount
   - Actual spending
   - Remaining amount
   - Progress bar
```

### Current Balances

```
1. User views Balance section (Dashboard, Budgets page, or Balances page)
2. System fetches latest balance per currency
3. Response schema: { balances: { "PLN": "...", "USD": "..." } }
4. Displays closing balance per currency in a compact bar:
   - Mobile (<768px): list rows (currency left, closing balance right)
   - Desktop (≥768px): horizontal bordered cards with semantic accent
5. User clicks a balance row/card → detail modal opens showing:
   - Opening balance
   - Income / Expenses
   - Exchange In / Exchange Out
   - Closing balance (semantic color)
   - Note (if set)
   - "Last calculated" timestamp (when available)
6. From detail modal, user can:
   - Edit Opening Balance + Note → opens edit modal
   - Recalculate → triggers server-side recalculation
```

### Balances Page

```
1. User navigates to Balances page (/balances)
2. System displays balance cards for the selected period:
   - One card per currency
   - Each card shows: opening balance, income, expenses, exchanges in/out,
     closing balance, note (if set), and last calculated timestamp
3. Closing balances use semantic colors (positive/negative/muted)
4. User can edit a balance (requires member role or above):
   - Opens edit modal with opening balance field and note textarea
   - Both fields are optional — can update just the note without touching opening balance
5. User can recalculate individual balances (requires member role or above)
```

## Data Import/Export

### Exporting User Data

```
1. User navigates to Profile → Account tab
2. User clicks "Export Data"
3. System generates JSON file with all user data:
   - Profile, preferences, 2FA settings
   - All workspaces with budget accounts, periods,
     categories, transactions, budgets, planned transactions,
     currency exchanges, and period balances
4. JSON file downloads to browser
5. Export format version: 2.0
```

### Importing User Data

```
1. User navigates to Profile → Account tab
2. User clicks "Import Data"
3. User selects a previously exported JSON file
4. System validates export version:
   - v1.0: Normalized to v2.0 format automatically
     (renames double-underscore keys, synthesizes currencies,
      fills missing sections with defaults)
   - v2.0: Processed directly
   - Other versions: Rejected with error
5. System imports data:
   - Creates workspaces (renames if name conflict)
   - Creates budget accounts, periods, categories
   - Creates transactions, budgets, planned transactions
   - Creates currency exchanges and period balances
6. Import summary displayed with counts and any renamed/skipped items
```