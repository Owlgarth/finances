# Application Workflow

This document describes the main workflows and user flows in the Monie application.

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
4. Status set to "pending"
```

### Executing a Planned Transaction

```
1. User views pending planned transaction
2. User clicks "Execute"
3. User confirms payment date
4. System creates actual transaction:
   - Amount, currency, category copied
   - Date set to payment date
   - Linked to planned transaction
5. Planned transaction status → "done"
6. Balance automatically updated
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

### Switching Workspaces

```
1. User belongs to multiple workspaces
2. User clicks workspace switcher
3. User selects different workspace
4. System updates current_workspace_id
5. All data views refresh to new workspace
6. Budget accounts show for new workspace
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

## Offline Support Workflow

### Going Offline

```
1. Network connection lost
2. User continues working
3. Mutations (create/update/delete) queued locally
4. Optimistic updates applied to UI
5. Offline indicator shown
```

### Coming Back Online

```
1. Network connection restored
2. Sync process starts automatically
3. Queued requests sent sequentially
4. On success: optimistic items removed
5. On failure: retry with backoff
6. UI updated with server state
```

## Report Generation

### Budget Summary Report

```
1. User views Dashboard
2. System fetches budget summary for current period
3. Displays per-category:
   - Budget amount
   - Actual spending
   - Remaining amount
   - Progress bar
```

### Current Balances

```
1. User views Balance section
2. System fetches latest balance per currency
3. Displays:
   - Opening balance
   - Income/Expenses
   - Exchange flows
   - Closing balance
```
