---
name: frontend-react
description: Frontend (React/TypeScript/Vite) conventions for Denarly — design system tokens, modals, component patterns, TanStack Query widgets, API client, auth token storage/refresh, naming and import order. Use when writing or modifying any code in frontend/.
---

# Frontend Conventions (TypeScript/React)

## Design System Tokens

The frontend uses an "Architectural Ledger" design system via CSS custom properties. All colors reference `var(--color-*)` variables — never hardcoded hex values in component code.

- **Color tokens:** `primary`, `primary-hover`, `background`, `surface`, `surface-hover`, `surface-muted`, `border`, `border-focus`, `text`, `text-muted`, `positive`, `positive-bg`, `negative`, `negative-bg`, `warning`, `warning-bg`
- **Border radii:** `rounded-sm` (4px) — containers, buttons; `rounded-none` (0px) — inputs, table cells
- **Fonts:** `font-sans` — Geist (body/UI); `font-mono` — JetBrains Mono (code, numbers)
- **Icons:** `lucide-react` only. No Material Symbols or other icon fonts.
- **Focus ring:** `:focus-visible` uses `var(--color-border-focus)`. No shadow variables — avoid `box-shadow` utilities for elevation.

## Third-Party Component Theming

When theming a third-party component (e.g. `react-day-picker`) to match the design system, scope CSS overrides to a wrapper class on the variant's container only (e.g. `.rdp-inline`) so other usages keep their defaults. Never write global overrides. The container carries the scoping class in the component JSX.

Override the library's own CSS variables (e.g. `--rdp-*` in react-day-picker v9) to map onto the app's `var(--color-*)` tokens — the widget becomes dark-mode aware with zero `dark:` variants since the tokens invert under `.dark`. Never hardcode colors:

```css
/* Scoped to the inline calendar — the popup path keeps rdp defaults */
.rdp-inline {
  --rdp-accent-color: var(--color-primary);
  --rdp-accent-background-color: var(--color-surface-hover);
  --rdp-day_button-border-radius: 0.25rem; /* rounded-sm — matches app buttons */
}

/* Selected day: background as text color so it inverts correctly in both themes */
.rdp-inline .rdp-selected .rdp-day_button {
  background-color: var(--color-primary);
  color: var(--color-background);
}
```

For grid/table-based widgets (calendar grids, data tables), set `table-layout: fixed` + `width: 100%` on the grid so columns fill the container evenly.

## Responsive Breakpoints

Use `md` (768px) as the primary responsive breakpoint for layout changes — it covers tablets in portrait. Avoid `lg` (1024px) as the first breakpoint:

```tsx
// Good — tablet users (768px+) get the adapted layout
<div className="grid grid-cols-1 md:grid-cols-3">
```

## Modal Pattern

Fixed overlay, centered content, X close button:

```tsx
{isOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="fixed inset-0 bg-black/50" onClick={onClose} />
    <div className="relative z-10 w-full max-w-md rounded-sm bg-surface p-6">
      <button onClick={onClose} className="absolute right-4 top-4 text-text-muted hover:text-text">
        <X size={20} />
      </button>
      {/* Modal content */}
    </div>
  </div>
)}
```

When a component manages multiple modals, use separate boolean state for each. Modals can chain by closing one and opening another (`onEdit={() => { setShowDetail(false); setShowEdit(true) }}`).

## File Structure

- Components: `components/Category/CategoryRow.tsx`
- Pages: `pages/CategoryPage.tsx`
- Types: `types/index.ts`
- API: `api/client.ts`
- Contexts: `contexts/AuthContext.tsx`

## Component Pattern

- Remove unused props from component interfaces — dead props create misleading API surfaces.
- When a component handles a concern internally (e.g., resend verification via API call), don't also expose a callback prop for the same concern. One mechanism is enough.
- When a child component needs more than an ID from a list item, pass the full object through callback props instead of just the ID:

```tsx
// Bad — child must fetch data again
onExecute: (id: number) => void
// Good — child has all the data it needs
onExecute: (planned: PlannedTransaction) => void
```

Standard form component shape: props interface, `isLoading` state, `handleSubmit` with `try/catch` showing `toast.error(...)` and `finally { setIsLoading(false) }`.

## Variant Props on Shared Components

When a shared component needs a new render variant that must NOT change existing call sites, add an opt-in boolean prop (default `false`) with an early-return render branch. Prefer this over a sibling component when the variant reuses most of the component's wiring (refs, formatters, context lookups) and differs only in presentation:

```tsx
interface Props {
  value: string
  onChange: (value: string) => void
  inline?: boolean  // opt-in, default false — existing call sites unaffected
}

export default function DatePicker({ value, onChange, inline = false }: Props) {
  const { calendarStartDay } = useUserPreferences()  // shared wiring
  const [isOpen, setIsOpen] = useState(false)
  // ...other shared hooks/helpers...

  if (inline) {
    return <DayPicker mode="single" ... />  // always-visible variant
  }
  return <input value={value} ... />  // default popup variant
}
```

**Hooks ordering corollary:** All hooks (`useState`, `useRef`, `useEffect`) and helper closures must stay ABOVE the early return — React forbids conditional hook calls. Place the early return immediately after the last `useEffect`. Hooks that are no-ops in the inactive variant are fine — do not "clean up" by moving the early return above the hooks.

## Multi-Step UI Flows

Use a union-typed state machine with conditional rendering for multi-step flows (setup → verify → confirm):

```typescript
type SectionState = 'idle' | 'setup' | 'showing_codes' | 'disabling'
const [state, setState] = useState<SectionState>('idle')

if (state === 'showing_codes') return <RecoveryCodesDisplay ... />
if (state === 'setup' && setupData) return <SetupForm ... />

const mutation = useMutation({
  mutationFn: api.verifySetup,
  onSuccess: (data) => {
    setState('showing_codes')
    queryClient.invalidateQueries({ queryKey: ['status'] })
  },
})
```

## Auth Response Error Guard

Every auth function expecting an `access_token` must have an `else` branch showing an error toast when the token is missing — never silently do nothing on an unexpected response:

```typescript
if (response.access_token) {
  // ... existing success logic
} else {
  toast.error('Unexpected response from server. Please try again.')
  return
}
```

## Stateful Component Preservation with CSS `hidden`

When a component holds important transient state (e.g., recovery codes that cannot be re-displayed), use CSS `hidden` to keep it mounted when switching tabs — conditional rendering unmounts it and loses state:

```tsx
// Good — stays mounted, preserving internal state
<div className={activeTab === 'security' ? '' : 'hidden'}>
  <TwoFactorSection />
</div>
```

Only apply this where state loss is problematic — other tabs can continue using conditional rendering.

## Avoid Duplicate Toasts

Before adding error toasts in a catch block, check whether the called function already shows toasts (e.g., `AuthContext.login()` shows `toast.error()` and re-throws). If so, the catch only prevents unhandled rejection; an empty catch needs a comment for ESLint's `no-empty`:

```typescript
} catch {
  // Error already displayed by AuthContext
} finally {
  setIsSubmitting(false);
}
```

## Token Storage

Access and refresh tokens are stored separately in `localStorage` (`denarly_token`, `denarly_refresh_token`). Helpers in `api/client.ts`: `setRefreshToken`, `getRefreshToken`, `clearAuthToken` (clears both tokens and the Authorization header).

All auth flows receiving token pairs (`login`, `register`, `verify2FA`) must store both tokens:

```typescript
if (response.access_token) {
  setAuthToken(response.access_token);
  if (response.refresh_token) {
    setRefreshToken(response.refresh_token);
  }
}
```

The `if (response.refresh_token)` guard matches the optional `refresh_token` field on `Token`, for endpoints that only return access tokens.

## 401 Interceptor with Token Refresh

The Axios response interceptor in `api/client.ts` uses a queue-based pattern:

1. On 401, check for a refresh token. If none, clear tokens and redirect to `/login`.
2. If a refresh is in progress (`isRefreshing`), queue the failed request in `failedQueue` and replay after refresh succeeds.
3. On refresh success, store the new token pair, replay queued requests, retry the original.
4. On refresh failure, clear both tokens, reject queued requests, redirect to `/login`.
5. Auth routes (`/login`, `/register`) are excluded from redirect to avoid loops.

`authApi.refresh` sends `{ headers: { Authorization: '' } }` to avoid sending the expired access token on the refresh request itself.

## Token-Based Verification Pages

```tsx
type State = 'loading' | 'success' | 'error'

export default function VerifyPage() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get('token')
      if (!token) {
        setState('error')
        return
      }
      try {
        await authApi.verify(token)
        setState('success')
      } catch {
        setState('error')
      }
    }
    verify()
  }, [searchParams])
}
```

- Always handle the missing-token case (`if (!token)` → error state)
- Public verification pages go outside `ProtectedRoute`; authenticated pages inside it
- Success states offer a navigation link; error states offer retry/resend
- Use a named `async` function inside `useEffect` with `try/catch/await` — no `.then()` chains
- Never show the same success state in both `try` and `catch` — add a distinct error state with a recovery path

## Dashboard Widget Component Pattern

Period-scoped widgets follow this structure:

```tsx
interface Props {
  periodId: number | null
}

export default function MyWidget({ periodId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['my-data', periodId],
    queryFn: async () => {
      if (!periodId) return null
      return myApi.getData({ budget_period_id: periodId })
    },
    enabled: !!periodId,
  })

  if (!periodId) return null
  const items = data?.items ?? []

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <h3 className="text-sm font-medium text-text mb-3">Widget Title</h3>
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 bg-surface-muted rounded-sm animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">No data this period.</p>
      ) : (
        <div>{/* Render items */}</div>
      )}
      <Link to="/detail-page" className="inline-block mt-3 text-sm text-primary hover:text-primary-hover">
        View Details →
      </Link>
    </div>
  )
}
```

**Key conventions:** early-return `null` when `periodId` is null (no skeleton); `enabled: !!periodId` on `useQuery`; three rendering states (loading skeleton / empty message / data); always a `<Link>` to the detail page; skeletons use `bg-surface-muted rounded-sm animate-pulse`; container uses `border border-border rounded-sm bg-surface p-4`.

**Context-based variant:** A widget tightly coupled to the dashboard may call `useBudgetPeriod()` directly instead of taking a `periodId` prop — simpler parent JSX, less portable. Use sparingly.

## State Refresh After Mutations

After operations that change server-side state (email change, profile update), fetch the full updated object rather than patching local state partially:

```tsx
// Good: fetch full state from server
const updatedUser = await authApi.getCurrentUser()
updateUser(updatedUser)
```

## API Client Pattern

```typescript
export const categoriesApi = {
  getAll: (params?: { budget_period_id?: number }) => api.get('/categories', { params }),
  create: (data: { budget_period_id: number; name: string }) => api.post('/categories', data),
  update: (id: number, data: { budget_period_id: number; name: string }) => api.put(`/categories/${id}`, data),
  delete: (id: number) => api.delete(`/categories/${id}`),
}
```

**Export type aliases for repeated literal unions:** When a literal union (e.g., ordering options) is used in more than one place, export it as a `type` alias at the top of `client.ts` and import it at call sites — don't inline the same union in multiple files:

```typescript
// client.ts
export type TransactionOrdering =
  | '-date' | 'date' | '-description' | 'description'
  | '-amount' | 'amount' | '-type' | 'type'
  | '-category__name' | 'category__name' | '-currency__symbol' | 'currency__symbol';
```

## Contexts

```typescript
const { user, isAuthenticated } = useAuth()
const { workspace, workspaces, switchWorkspace, createWorkspace, deleteWorkspace } = useWorkspace()
const { selectedPeriod, selectedPeriodId } = useBudgetPeriod()
```

## Naming Conventions

- **Components**: PascalCase (`BudgetTable`, `TransactionList`)
- **Functions**: camelCase (`handleSubmit`, `fetchData`)
- **Constants**: camelCase for objects, UPPER_SNAKE for primitives
- **Types/Interfaces**: PascalCase (`User`, `Transaction`, `Props`)
- **Event handlers**: `handle` prefix (`handleSubmit`, `handleClick`)

## Imports Order

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
