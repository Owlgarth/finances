---
name: frontend-react
description: Frontend conventions for Owlgarth Finances (React 19, TypeScript, Vite, Tailwind 4, TanStack Query, i18next) - core rules plus a routing table into reference files for styling, responsive layout, modals, gestures, components, state and effects, forms, URL state, API and data, auth, UI text, and lint gates. Use when writing or modifying any code in frontend/.
---

# Frontend Conventions (TypeScript/React)

This file holds the rules every frontend task needs. The detailed patterns live in `references/` next to this file (`.agents/skills/frontend-react/references/`): read the ones matching your change BEFORE writing code. Design facts (tokens, component specs, responsive tiers, dark mode) are owned by `design/`; this skill states how code consumes them.

## Read Before You Edit

| Your change touches | Read |
|---|---|
| classNames, `src/index.css`, tokens, z-index tiers, fonts, dark mode, third-party widget styling | `references/styling.md` |
| breakpoints, phone vs desktop surfaces, master-detail routes, filter rows, tables in narrow containers, CSS-`hidden` state preservation | `references/responsive-layout.md` |
| `Modal`, `BottomSheet`, popovers, Escape handling, focus return | `references/modals-and-overlays.md` |
| drag and swipe handlers, delete-with-Undo, scroll restoration | `references/gestures-undo-scroll.md` |
| building or changing a component: buttons, rows, editors, disclosures, sticky rows, ARIA and live regions | `references/components.md` |
| extracting a shared component or hook, variant props, domain hooks modules | `references/shared-components.md` |
| `useState`/`useEffect`, seeding or resetting state, contexts | `references/state-and-effects.md` |
| form hooks, host-controlled fields, localStorage drafts, multi-step submits | `references/forms.md` |
| URL search params, cross-route query carries, stored page defaults | `references/url-state.md` |
| `api/client.ts`, queries and invalidation, widgets, downloads, error toasts, money math, runtime config | `references/data-and-api.md` |
| login, token storage, 401 refresh, return navigation, verification pages | `references/auth.md` |
| any user-visible string, plurals, registry-driven labels | `references/i18n-text.md` (toolchain scripts: `i18n-tooling` skill) |
| grep/lint done criteria, lint counts that disagree with a spec, diff-level byte gates | `references/gates-and-lint.md` |
| verifying behavior in a live browser | `frontend-live-stack-probing` skill |

Rules cited elsewhere as "§Section Name" keep their original headings inside these files - grep `references/` for the heading.

## Core Rules

### Styling
- Colors come only from design tokens (`bg-surface`, `text-text-muted`, `border-border`, ...), never hex values in component code. The token list and meanings live in `design/tokens.md`.
- Icons: `lucide-react` only.
- Changing a border color keeps the bare `border` width utility (`border border-primary`): preflight resets border width to 0, so a color utility alone renders no border.
- Overlays and persistent chrome use the semantic z-scale registered in `src/index.css` (`z-dropdown` < `z-sticky` < `z-popover` < `z-sidebar`/`z-bottom-nav` < `z-topbar` < `z-modal-backdrop` < `z-modal` < `z-toast` < `z-tooltip`), never raw `z-10`/`z-50`.
- Tailwind 4 compiles unknown or v3-spelled class names to NOTHING, with no diagnostic: build, lint and tsc cannot catch it. Prove a new or renamed utility by grepping the compiled sheet in `dist/assets/*.css` (mechanics in `references/styling.md`).
- Interactive controls reuse the shared classes in `common/formStyles.ts`. The touch-target floor is the full `${controlHeightClass}` constant, never a hand-written `pointer-coarse:min-h-[44px]` half.
- A shared base class carries no width utility; every call site passes exactly one width class. Two width utilities on one element are resolved by compiled-sheet order, not by className order.
- Hide with the `hidden` CLASS, never the HTML `hidden` attribute (v4 lets the attribute beat display utilities).
- Prove cascade and sizing claims against the compiled CSS or a live computed-style probe, never against the className string.

### Responsive
- Tiers: mobile <640px, tablet 640-1023px, desktop >=1024px (`design/responsive.md`). In JS use `useBreakpoint()`, never ad-hoc `useMediaQuery` calls; input-device behavior (hover reveals, hit areas) keys on `useIsTouch()`, not width.
- An adaptive component branches inside itself and keeps one exported API. Layout-scale chrome is CSS-gated on one stable tree: a JS width branch unmounts everything below it at each crossing and silently destroys unsaved state.
- Never gate an action behind hover on touch.

### Components
- Every overlay uses `common/Modal.tsx` (centered panel on desktop, `BottomSheet` on mobile) with its `title` prop; never hand-roll fixed-overlay markup.
- Every non-submit `<button>` carries `type="button"`.
- Presentation defaults (placeholders, aria-labels) live inside the component; call sites pass data and handlers only. Remove unused props.
- Copy at two consumers, extract at the third.

### State
- `react-hooks/set-state-in-effect` is a build error. Reset or seed state in the event handler that caused the change, or with a render-adjust (a prev-value latch checked during render); never `useEffect` + `setState`. Patterns and exemplars: `references/state-and-effects.md`.
- Effects never write the URL. Event handlers and mutation callbacks do, through functional `setSearchParams(..., { replace: true })`.
- A resource's queries, mutations and cache-key builders live in a domain hooks module, not in components.

### Data
- All HTTP goes through `api/client.ts`. Write payloads declare a dedicated `XInput` interface, never `Partial<Entity>`.
- Workspace-scoped query keys do not encode the workspace id. On a workspace change `WorkspaceContext` removes every query except its `userScopedQueryKeys` keep-set, so a new USER-scoped query key must be added to that set.
- Backend Decimals cross the wire as strings. Anything persisted, sent back, or deciding a categorical claim (over/not over budget) uses the exact helpers in `utils/format.ts`; floats are for display and validation only.
- Backend error messages arrive already translated; display them as-is. Before toasting in a `catch`, check whether the callee already toasted.

### UI Text
- Every user-visible string, including `aria-label`, `placeholder`, `title` and `alt`, goes through `t()` from the owning namespace. A new string is a key in the `en`, `uk` and `pl` catalogs under `src/i18n/locales/`; `npm run i18n:check` enforces parity, and `i18next/no-literal-string` stays at zero warnings.
- Plurals use i18next `count`. Month and date names come from the date-fns locale, never from catalogs.

### Verification
- Run `npm run lint` and `npm run build`; add `npm run i18n:check` when catalogs change. There is no frontend test suite.

## File Structure

Components live in lowercase-plural feature directories (`components/accounts/`,
`components/transactions/`, `components/modals/transactions/`, `components/common/`,
`components/dashboard/`, `components/layout/`, `components/profile/`; a few cross-cutting
components like `DatePicker.tsx` sit at `components/` top level) - never a PascalCase
feature directory like `components/Budget/`:

- Components: `components/accounts/AccountFormModal.tsx`
- Pages: `pages/BudgetDetailPage.tsx`
- Types: `types/index.ts`
- API: `api/client.ts`
- Contexts: `contexts/AuthContext.tsx`

A module that renders JSX is `.tsx` - TypeScript rejects JSX syntax in `.ts` regardless of the tsconfig `jsx` option (exemplar: `hooks/useDeferredDelete.tsx`, whose toast message is JSX).
## Naming Conventions

- **Components**: PascalCase (`TransactionsTable`, `SplitView`)
- **Functions**: camelCase (`handleSubmit`, `fetchData`)
- **Constants**: camelCase for objects and module-scope DERIVED values, UPPER_SNAKE for authored literal sentinels - `savedToken`/`savedLanguage` (client.ts) and `appVersion` (ProfilePage) are camelCase derivations even though primitive, while `TOKEN_KEY`/`NO_ACCOUNT` are UPPER_SNAKE: the UPPER name is the grep target for an authored literal, and a derived value has no literal to find.
- **Types/Interfaces**: PascalCase (`User`, `Transaction`, `Props`)
- **Event handlers**: `handle` prefix (`handleSubmit`, `handleClick`)
- **Comments**: plain-language rationale only - never planning artifacts ("(R1)", "patterns.md SS3", task ids, "(plan decision N)", "(SKILL §section)"). Review-round and spec references are meaningless outside the session that wrote them, and the citation forms rot mechanically: "(plan decision N)" points into `.plans/`, which is pruned post-merge, and "(SKILL §...)" section numbering reshapes on every skill promotion - both targets disappear while the code stays. A comment must state the WHY so a reader with no access to the plan can act on it. The check applies to handed-down spec snippets too: a pinned snippet whose docblock carries planning artifacts (goal/requirement/phase ids, ruling attributions) is reworded to plain-language rationale at landing time - the substantive statement stays, the designator dies.
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

**Shared backend registries import cross-tree** as the last import group, trailing the internal imports: `import fontsRegistry from '../../../backend/common/fonts.json'`. Derive the path depth from real sibling imports at the same directory depth (`src/x/` needs three `../`, `src/a/b/` needs four), never from first principles - a wrong depth silently resolves to a nonexistent `frontend/backend/...` path and fails the build. Any new cross-tree import must pair with its Dockerfile COPY line in the same plan, or Docker image builds TS2307 while host lint/build stay green (see the `docker-infra` skill's Out-of-Context Imports section).
