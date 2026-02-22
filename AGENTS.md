# AGENTS.md

Coding guidelines and commands for agentic coding agents working on the Monie codebase.

## Project Overview

Monie is a personal finance tracking application built with Django 6, Django Ninja, React 19, and PostgreSQL. It features multi-currency support, period-based budgeting, and collaborative team features.

## Build/Lint/Test Commands

### Backend (Django)

```bash
cd backend

# Setup
uv venv && source .venv/bin/activate
uv sync
python manage.py migrate

# Development
python manage.py runserver

# Testing
pytest                                    # Run all tests
pytest -v                                 # Verbose output
pytest budget_accounts/tests/             # Run specific app tests
pytest budget_accounts/tests/test_api.py::TestClass::test_method  # Single test
pytest -k "test_create"                   # Run tests matching pattern
pytest --cov=. --cov-report=html          # With coverage

# Linting & Formatting
uv run ruff check .                       # Check linting issues
uv run ruff check --fix .                 # Auto-fix lint issues
uv run ruff format .                      # Format code
```

Always run `uv run ruff check` and `uv run ruff format` after making changes.

### Frontend (React + Vite)

```bash
cd frontend

# Setup
npm install

# Development
npm run dev                               # Runs at http://localhost:5173

# Build
npm run build                             # TypeScript check + Vite build

# Linting
npm run lint                              # ESLint check
```

Always run `npm run lint` after making changes.

## Data Hierarchy

All data operations follow this hierarchy:

```
Workspace → BudgetAccount → BudgetPeriod → [Category, Transaction, Budget, ...]
```

Every endpoint must verify resources belong to the user's workspace.

## Backend Code Style (Python)

### Imports

```python
# Standard library
from datetime import date
from decimal import Decimal
from typing import Optional

# Django/Django Ninja
from django.db import transaction
from django.http import HttpRequest
from ninja import Router
from ninja.errors import HttpError

# Local apps (alphabetically)
from common.auth import JWTAuth
from common.permissions import require_role
from core.schemas import DetailOut
```

### Naming Conventions

- **Files**: snake_case (`transactions/api.py`, `period_balances/models.py`)
- **Classes**: PascalCase (`TransactionOut`, `BudgetPeriod`)
- **Functions/Variables**: snake_case (`get_workspace_period`, `budget_period_id`)
- **Constants**: UPPER_SNAKE_CASE (`WRITE_ROLES`, `TOKEN_KEY`)
- **Schemas**: Suffix with purpose (`TransactionCreate`, `TransactionOut`, `TransactionImport`)

### Django Ninja Endpoints

```python
router = Router(tags=['Transactions'])

@router.get('', response=list[TransactionOut], auth=JWTAuth())
def list_transactions(request: HttpRequest, budget_period_id: Optional[int] = Query(None)):
    """Docstring describing the endpoint."""
    workspace = request.auth.current_workspace
    if not workspace:
        raise HttpError(404, 'No workspace selected')
    # ... implementation

@router.post('', response={201: TransactionOut, 400: dict}, auth=JWTAuth())
def create_transaction(request: HttpRequest, data: TransactionCreate):
    """Create endpoint requires write access."""
    require_role(request.auth, workspace.id, WRITE_ROLES)
    # ... implementation
```

### Pydantic Schemas

```python
from pydantic import BaseModel, ConfigDict, Field

class TransactionCreate(BaseModel):
    """Schema for creating a transaction."""
    date: date
    description: str = Field(..., max_length=500)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., pattern=r'^[A-Z]{3}$')

class TransactionOut(BaseModel):
    """Schema for transaction response."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    amount: Decimal
```

### Error Handling

- Use `HttpError(status, 'message')` for API errors
- Return `{404: {'detail': 'Not found'}}` for response tuples
- Use `transaction.atomic()` for database operations that update balances

### Testing

```python
from common.tests.mixins import AuthMixin, APIClientMixin
from django.test import TestCase

class TestTransactions(AuthMixin, APIClientMixin, TestCase):
    def test_create_transaction(self):
        data = self.post('/api/transactions', payload, **self.auth_headers())
        self.assertStatus(201)
```

## Frontend Code Style (TypeScript/React)

### File Structure

- Components: `components/Category/CategoryRow.tsx`
- Pages: `pages/CategoryPage.tsx`
- Types: `types/index.ts`
- API: `api/client.ts`
- Contexts: `contexts/AuthContext.tsx`

### Component Pattern

```tsx
interface Props {
  id: number
  name: string
  onSave?: (data: Category) => void
}

export default function CategoryForm({ id, name, onSave }: Props) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      // ...
    } catch (error) {
      toast.error('Failed to save')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* ... */}
    </form>
  )
}
```

### API Client Pattern

```typescript
export const categoriesApi = {
  getAll: (params?: { budget_period_id?: number }) => 
    api.get('/categories', { params }),
  create: (data: { budget_period_id: number; name: string }) => 
    api.post('/categories', data),
  update: (id: number, data: { budget_period_id: number; name: string }) => 
    api.put(`/categories/${id}`, data),
  delete: (id: number) => 
    api.delete(`/categories/${id}`),
}
```

### Naming Conventions

- **Components**: PascalCase (`BudgetTable`, `TransactionList`)
- **Functions**: camelCase (`handleSubmit`, `fetchData`)
- **Constants**: camelCase for objects, UPPER_SNAKE for primitives
- **Types/Interfaces**: PascalCase (`User`, `Transaction`, `Props`)
- **Event handlers**: `handle` prefix (`handleSubmit`, `handleClick`)

### Imports Order

```typescript
// React/React Router
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// External libraries
import toast from 'react-hot-toast'

// Internal - API
import { categoriesApi } from '../api/client'

// Internal - Types
import type { Category } from '../types'

// Internal - Contexts/Hooks
import { useAuth } from '../contexts/AuthContext'
```

## Security Model (Four Layers)

1. **Authentication**: `auth=JWTAuth()` on endpoints
2. **Workspace Membership**: Verify `request.auth.current_workspace`
3. **Role-Based Permissions**: `require_role(user, workspace_id, WRITE_ROLES)`
4. **Resource Ownership**: Filter queries by workspace ID

## Common Patterns

### Backend: Workspace-scoped Query

```python
queryset = Transaction.objects.filter(
    budget_period__budget_account__workspace_id=workspace.id
)
```

### Backend: Update Balance in Transaction

```python
with transaction.atomic():
    trans = Transaction.objects.create(...)
    update_period_balance(period_id, currency, trans_type, amount, 'add')
```

### Frontend: Use Context

```typescript
const { user, isAuthenticated } = useAuth()
const { currentPeriod } = useBudgetPeriod()
```
