---
name: frontend-react
description: Frontend (React/TypeScript/Vite) conventions for Owlgarth Finances — design system tokens, modals, component patterns, TanStack Query widgets and cache invalidation, exact money math, dedup seams, API client, auth token storage/refresh, lint and grep-gate discipline, naming and import order. Use when writing or modifying any code in frontend/.
---

# Frontend Conventions (TypeScript/React)

## Design System Tokens

The frontend uses an "Architectural Ledger" design system via CSS custom properties. All colors reference `var(--color-*)` variables — never hardcoded hex values in component code.

- **Color tokens:** `primary`, `primary-hover`, `background`, `surface`, `surface-hover`, `surface-muted`, `border`, `border-focus`, `text`, `text-muted`, `positive`, `positive-bg`, `negative`, `negative-bg`, `warning`, `warning-bg`, `scrim` (overlay backdrop — `bg-scrim` in `Modal`/`BottomSheet` overlays)
- **Border radii:** `rounded-sm` (4px) — containers, buttons; `rounded-none` (0px) — inputs, table cells
- **Fonts:** `font-sans` — Geist (body/UI); `font-mono` — JetBrains Mono (code, numbers)
- **Icons:** `lucide-react` only. No Material Symbols or other icon fonts.
- **Focus ring:** `:focus-visible` uses `var(--color-border-focus)`. No shadow variables — avoid `box-shadow` utilities for elevation.
- **Border widths:** Tailwind preflight resets `border-width: 0`, so a color utility alone (`border-primary`) renders **no** border. Always keep the bare `border` width utility and swap only the color half — `border border-primary` (open/selected) vs `border border-border` (default).
- **Shared control classes:** button/control variants live in `common/formStyles.ts` and follow the four-part shape: base colors + padding + `controlHeightClass` + `focus-visible:outline-*` + `disabled:opacity-50 disabled:cursor-not-allowed`. Solid semantic fills have no `-hover` token — hover is an opacity step (`hover:bg-negative/90`), which inverts acceptably in both themes.
- **Stacking (z-index) tokens:** use the semantic scale from `tailwind.config.js` — `z-dropdown` (100) < `z-sticky` (200) < `z-sidebar`/`z-bottom-nav` (300) < `z-topbar` (400) < `z-modal-backdrop` (500) < `z-modal` (510) < `z-toast` (600) < `z-tooltip` (700) — never raw `z-10`/`z-50` utilities for overlays or persistent chrome. An overlay is two layers: backdrop at `z-modal-backdrop`, dismiss wrapper + panel at `z-modal` (`Modal.tsx`); plain `z-10` is only for local stacking *inside* a surface (a sticky drag handle, the lightbox close X above a tall sibling image, sticky table columns).
- **Animation utilities:** keyframes + utilities live at `index.css` root level (`fadeIn` / `.animate-fade-in`) and are covered by the GLOBAL `prefers-reduced-motion` kill switch at the end of that file - a new root-level animation utility needs no per-class reduced-motion handling, and a block-local reduced-motion list there is wrong (the global switch already fires).

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

## Responsive Breakpoints & Adaptive Components

Canonical device tiers (see `design/responsive.md`): **mobile <640px, tablet 640–1023px,
desktop ≥1024px**, snapped to Tailwind's `sm`/`lg`. In JS use `useBreakpoint()` from
`hooks/useBreakpoint.ts` — never write ad-hoc `useMediaQuery('(max-width: …)')` calls. In CSS,
mobile = `max-sm:`, desktop = `lg:`. For grid layouts `md:` remains fine as a middle step:

```tsx
<div className="grid grid-cols-1 md:grid-cols-3">
```

Input-device behavior (hover reveals, hit areas) keys on `useIsTouch()` (`pointer: coarse`),
not width. Never gate an action behind hover on touch: list rows open a `common/ActionSheet`
on tap instead, and the hover-revealed buttons are **not rendered** when `isTouch` (invisible
`opacity-0` buttons still intercept taps).

**Adaptive component pattern** (`design/patterns.md` §13): when a component needs a different
mobile presentation, branch *inside* the component on `useBreakpoint()` and keep one exported
API — zero call-site changes. State lives above the variants so a resize across the breakpoint
mid-interaction loses nothing. `Modal`, `Select`, and `DatePicker` already do this.

Mobile rules: text-entry controls are forced to 16px on mobile globally in `index.css` (iOS
zoom prevention — don't undo per-input); amount inputs get `inputMode="decimal"`; interactive
elements meet 44px on touch — shared button/control classes get the floor via
`controlHeightClass` in `common/formStyles.ts` (`min-h-8 pointer-coarse:min-h-[44px]`, keyed
on the custom `pointer-coarse` variant so tablets above `sm` keep full touch targets); only
`SegmentedControl` uses `max-sm:min-h-[44px]` (viewport-keyed); small icon buttons use the
`.touch-hit` utility, but not on adjacent buttons whose expanded hit areas would overlap).

`.touch-hit` sets `position: relative` in the same `@layer utilities` that Tailwind emits
`.absolute`/`.fixed` into — equal specificity, later source order, so `.touch-hit` wins: an
element carrying both classes silently computes `position: relative`. When an element needs
true absolute positioning plus the enlarged hit area, use `!absolute` — the attachment-tile
delete button in `transactions/TransactionAttachments.tsx` (`!absolute top-1 right-1 …
touch-hit`, the trash button on each receipt tile) is the canonical example; without the
`!` it computes `position: relative`, drops into flow below the image, and the tile's
`overflow-hidden` clips it out of sight. Verify cascade fixes against the compiled CSS, not the
source className.

## Modal Pattern

Use `common/Modal.tsx` — it renders a centered panel on desktop and delegates to
`common/BottomSheet.tsx` on mobile (animated bottom sheet with scroll-lock, stack-aware
Escape, focus return, keyboard avoidance). Don't hand-roll fixed-overlay markup:

```tsx
<Modal open={isOpen} onClose={onClose} title="Edit transaction" size="md" className="p-6">
  {/* content */}
</Modal>
```

**Titles go through the `title` prop — never a hand-rolled `<h2>`.** The prop is `string`,
not `ReactNode`: dynamic titles are template literals or string ternaries
(`title={`Set balance — ${account.name}`}`), never JSX. `Modal` renders one header flex row —
title left, labeled Close button (X icon + "Close" text) right — and the Close button carries
`flex-shrink-0` so it can never overlap the title; a standalone `<h2>` in the panel flow
paired with a floating absolute X is the legacy overlap / accidental-closure bug — do not
reintroduce it, and never absolutely position a close button over panel content. The same
header row renders on both viewports: desktop at the top of the centered panel, and on mobile
inside the sheet body just below the drag handle (`BottomSheet` itself renders no close
button — its handle bar is a visual affordance; closing is scrim tap or Escape) — callers just
pass `title`. Modal title typography lives solely in `Modal`'s header render; don't add
per-caller title styling or title-to-content spacing (the header owns the bottom margin).

Non-modal sheets (pickers, action menus) use `BottomSheet` / `ActionSheet` directly
(`design/components.md` §21).

When a component manages multiple modals, use separate boolean state for each. Modals can chain by closing one and opening another (`onEdit={() => { setShowDetail(false); setShowEdit(true) }}`). `ActionSheet` actions close the sheet before running, so they chain safely.

**Modal state lifecycle — two sanctioned shapes:**

- **Permanently mounted (rendered unconditionally, no `key`):** re-seed **all** form state from props in an open-effect — `if (!open) return` first, deps `[open, entity]` (`AccountFormModal`, `TransferModal`):

  ```tsx
  useEffect(() => {
    if (!open) return
    setName(account?.name ?? '')
    // …every field, every open
  }, [open, account])
  ```

  `useState(account?.x)` initializers are dead weight here — they run exactly once, before the entity prop exists, so Edit opens blank and silently submits defaults, and the stale values leak into a later New session. When a full reset plus a fresh-per-open default is all you need, prefer ONE `handleClose` wrapper on `onClose` (`BudgetsPage`'s `CreateBudgetModal`): `Modal` funnels every dismissal path (Cancel/Close/scrim/Escape) through `onClose`, and an event handler stays lint-quiet where an open-effect spends `set-state-in-effect` budget (see §State Changes in Event Handlers).

- **Mount-per-use:** a modal that seeds state from props in `useState` initializers drops the `open` prop entirely — the caller's conditional render (`{row && <Modal …/>}`) IS the open/close mechanism. Document the contract in the docblock (`ExtractionReviewModal`, `PeriodFormModal` - its caller's mode/id/`nonce` render `key` forces a fresh remount every open, including add-after-add). From a list page, page state is `{entity} + nonce` with a key of mode + entity id + nonce (`BudgetsPage`'s add-period modal: `add-${budget.id}-${nonce}`) - the nonce is load-bearing because entity id alone reuses the mounted instance when a close-then-open batches into one tick (the null gap never renders).

**Escape inside a Modal:** a popup that lives inside a Modal (e.g. `DatePicker`'s desktop panel) consumes Escape at its focusable element — `preventDefault()` + `stopPropagation()` + close — gated on the popup being open, so a closed popup still lets Escape bubble to the surrounding Modal.

**Migrating a hand-rolled fixed overlay to `Modal`:** pass `title` (string prop) + `className="p-6"`, and delete the manual `useOverlay` plus the hand-rolled header/`aria-labelledby`/close-X machinery — `Modal` wires stack-aware Escape/scroll-lock/focus on desktop and delegates to `BottomSheet` on mobile, preserving the behavior by construction.

## File Structure

Components live in lowercase-plural feature directories (`components/accounts/`,
`components/transactions/`, `components/modals/transactions/`, `components/common/`,
`components/dashboard/`, `components/layout/`, `components/profile/`; a few cross-cutting
components like `DatePicker.tsx` sit at `components/` top level) — never a PascalCase
feature directory like `components/Budget/`:

- Components: `components/accounts/AccountFormModal.tsx`
- Pages: `pages/BudgetDetailPage.tsx`
- Types: `types/index.ts`
- API: `api/client.ts`
- Contexts: `contexts/AuthContext.tsx`

## Component Pattern

- Remove unused props from component interfaces — dead props create misleading API surfaces.
- **Component defaults live inside the component.** Placeholder, aria-label, and similar presentation defaults ship with the component (`PeriodPicker` owns its "Select period" trigger placeholder and "Periods" panel label); call sites pass data and handlers only. A call site re-supplying a default creates a second copy that can drift from the component's.
- When a component handles a concern internally (e.g., resend verification via API call), don't also expose a callback prop for the same concern. One mechanism is enough.
- When a child component needs more than an ID from a list item, pass the full object through callback props instead of just the ID:

```tsx
// Bad — child must fetch data again
onExecute: (id: number) => void
// Good — child has all the data it needs
onExecute: (planned: PlannedTransaction) => void
```

- **Accordion/disclosure components:** the collapsed header is a real `<button>` carrying `aria-expanded` + `aria-controls`; the expanded region is its **sibling** with a matching `id` + `role="region" aria-label` — never nested inside the button (interactive content inside `<button>` is invalid HTML and steals focus/clicks). On list pages, wire the pair from ONE `useId()` value (`FiltersToggle aria-controls` ↔ `FilterPanel id` via `common/FilterBar.tsx`).

- **Every non-submit `<button>` carries `type="button"`.** Inside a `<form>` the browser
  default is `type="submit"`, so a bare Cancel/icon/close button silently submits the form
  on click. Only actual submit buttons omit the attribute. `common/ConfirmDialog.tsx`
  and `Modal`'s Close button show the pattern.

- **Inside a Link-wrapped card, per-card actions are `<button type="button">`, never a nested `<Link>`/`<a>`.** Interactive content inside an anchor is invalid HTML and double-navigates - the card's own Link still fires after the inner one. The handler starts with `e.preventDefault(); e.stopPropagation()` to suppress the card's navigation, then `navigate()` from `useNavigate()` for route changes. Exemplar: `BudgetsPage`'s per-card icon cluster.

- **Sticky rows inside a `max-h`-capped scroll panel need an opaque background and exactly one unconditional bg utility.** A pinned footer (`sticky bottom-0 z-10 bg-surface`, mirroring `PanelSearchInput`'s `sticky top-4 z-10 bg-surface` in `listboxParts.tsx`) must be opaque so rows scrolling beneath are masked, and the conditional background goes through mutually exclusive branches - the keyboard-highlight branch carries `bg-surface-hover` ALONE, never stacked on an unconditional `bg-surface` (two same-specificity plain utilities make the winner stylesheet-order luck; only pseudo-class variants like `hover:` safely out-specify the base). The mobile sheet gets plain row parity instead - its 92dvh cap is not the desktop panel's tight max-h, so pinning buys nothing.

- **Consume hook predicates where they're needed** — call `usePermissions()` inside the row/component that needs the decision; never re-derive permission math locally or thread it down as boolean props (`canManage`, `isOwner`). Derived copies drift from the hook's truth; dead props are removed from the interface in the same commit.

- **A form component that submits its own API call owns its mutation internally** — no `onSubmit`/`isLoading` props threading a parent's `useMutation` down, and never a parent reaching into the child's DOM (`getElementById` + `form.reset()`) — that coupling breaks silently when ids change and couples lifecycles across the boundary. Reset/clear fields in the mutation's `onSuccess`, never at fire-and-forget submit time (a server rejection would otherwise wipe the typed values and force a full retype).

- **ConfirmDialog is wired with `isPending={mutation.isPending}`** (both buttons disable via the shared classes). Dialog close semantics: form modals stay open on error so input can be corrected; only remove/delete mutations close their dialog in BOTH `onSuccess` and `onError`.

- **In a `mutationFn`, the durable call comes first; non-durable follow-ups** (post-save description update, post-create upload) go after it, wrapped in a swallowing `catch {}` with a reason comment — a mutation retry must never re-run already-durable side effects (the append branch would duplicate saved rows). When the follow-up is user-recoverable rather than silently retryable, the catch toasts the recovery location instead of swallowing: return the durable result so the mutation still succeeds - two toasts on partial failure (follow-up error + success) is intended design, not a duplicate-toast bug. `isPending` spans the whole chain, so the submit button stays disabled until the follow-up settles. Exemplar: `BudgetsPage`'s `CreateBudgetModal` - create budget, then chain `createPeriod`; its failure toasts "you can add it from the budget page".

- **Derived-until-touched fields:** a field auto-derived from other fields (period name ← start/end dates via `formatPeriodName` in `utils/format.ts`) re-derives in the source fields' `onChange` handlers, guarded by a touched flag that flips `true` only in the derived field's own `onChange` - once the user edits it, source changes stop overwriting their text. Reset the flag only in the modal's reset path (`handleClose` for a permanently-mounted modal; the keyed remount is the reset for mount-per-use), so every fresh open re-derives. No effect is involved - the guarded setters keep `react-hooks/set-state-in-effect` at its frozen baseline. Exemplars: `CreateBudgetModal` (`BudgetsPage.tsx`) and `PeriodFormModal`, both on a `nameTouched` flag.

- **Key-handling scope:** Enter-key interception for a nested non-form action goes on the individual inputs (`onKeyDown` + `preventDefault`), never on a wrapper div — wrapper-level hijacks Enter on focused buttons inside it. Keyboard activation on non-button elements (e.g. a selectable `<tr>`) uses `tabIndex={0}` + `onKeyDown` guarded by `e.target === e.currentTarget` so nested inputs/buttons keep their native Enter/Space.

- **Optional form fields submit `x: value || undefined`** so axios omits the key entirely when blank (backends reject `""`, not absence). To make a text input "required only when non-empty", drop `required` but KEEP `minLength` — native constraint validation ignores `minLength` on an empty, non-required input; zero conditional props needed.

- **Conditional ARIA attributes** (`aria-current`, `aria-sort`, `aria-controls`) use `… : undefined` for the inactive state — React then omits the attribute entirely, which is the correct ARIA shape. Prefixed ARIA props destructure as aliases: `'aria-controls': ariaControls`.

- **`key={index}` on a reorderable list is a bug** — focus and selection jump when a `move` swaps values between stationary DOM nodes. Mint `crypto.randomUUID()` at every row-creation site (`emptyRow`, seeding maps) and render `key={row.id}`.

- **Invisible characters in source must stay visible escape sequences** — write `'\u00A0'`, never a raw NBSP byte (0xC2 0xA0) or a plain space: file writes can silently mangle the byte, reintroducing the collapsing-trigger bug (`MultiSelect`'s empty-state label) while every grep for `u00A0` still passes. Verify with `grep -P '\xc2\xa0'` when touching nbsp literals.

Standard form component shape: props interface, `isLoading` state, `handleSubmit` with `try/catch` showing `toast.error(...)` and `finally { setIsLoading(false) }`.

**Inline checkbox labels — raw `inline-flex`, not `labelClass`:** An inline boolean toggle inside a form (e.g. "Set as default for {currency}", "Paid in another currency?") uses a raw `<label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">` wrapping its `<input type="checkbox">` — never the shared `labelClass` from `formStyles.ts`, which carries the block + margin styling meant for field labels *above* inputs. This is the established pattern wherever a checkbox sits inline with its label text.

## Deduplication Seams

Choose the extraction mechanism by WHAT the duplication is:

- **More than half the duplicated surface is JSX → a shared self-contained component**, not a hook (hooks can't dedup JSX). It reads ambient state — filter values from `useSearchParams()`, reference data from the `useDomain` hooks — instead of taking props, so call sites collapse to one element. `common/ListFilterFields.tsx` (Transactions/Planned shared filter group) is the exemplar; page-specific fields stay in the page.
- **Identical state machine with one behavioral delta → a hook with the delta injected as a callback.** `hooks/useListboxPanel.ts` + `common/listboxParts.tsx` (Select/MultiSelect): the keyboard/open/highlight machinery lives once; `onActivate` carries pick-and-closes vs toggles-and-stays. Extracted hooks keep host-surface state OUT — closing the host dropdown/sheet is the caller's `onDone` callback, run on success only, never on failure.
- **A third consumer needing different presentation is a sibling, not a fork and not a hook change.** `PeriodPicker` reuses `useListboxPanel` + `listboxTriggerBaseClass` untouched; every presentation deviation (panel width, year groups, two-line mobile rows, CURRENT chip, hover semantics) lives in the component. Changing the shared hook/parts to serve one consumer silently changes Select/MultiSelect behavior you never set out to touch.
- **Interleaved non-option rows must not break the hook's flat option indexing.** When groups carry labels/dividers between options, thread the flat index through the grouping: build groups with `periods.reduce` whose third argument IS the hook's option index (items carry `{ period, index }`), with `optionId`/highlight/`onActivate` keyed on `item.index` - never a group-local counter. aria-hidden label divs stay skipped by keyboard nav precisely because the hook counts options only.
- **Scroll-to-selected inside a popover is manual `panel.scrollTop` centering math, never `element.scrollIntoView`** - `scrollIntoView` scrolls every scrollable ancestor and drags the page under the popover.
- **A non-selectable action row inside a listbox ("View all periods") is a pseudo-option in the hook's option space.** A bare `<button>` child of the listbox sits outside `aria-activedescendant`, and End/type-ahead/Enter skip it. Recipe (`PeriodPicker`'s view-all row): append `{ value: SENTINEL, label }` LAST to the hook's options with a numeric sentinel that cannot collide with real values (`-1`, impossible for a DB primary key, keeps `ListboxOption<number>` honest); branch in `activateIndex` on the sentinel (fire the navigation callback, `closePanel`, return) - activation is not selection, so no `onChange` path; render `role="option"` + `aria-selected={false}` (an action is never the selected value), with `id={optionId(index)}` + `tabIndex={-1}` on the desktop panel (the trigger owns focus) and no `id` in the mobile sheet (row parity). The scroll-to-selected `querySelector('[aria-selected="true"]')` still finds the real selection because the pseudo-option is always `aria-selected={false}`. Any windowing around the options (a `limit` cap) is pure per-render derivation clamped so the selection always lands inside the window - never state, which would need re-sync effects; an `effectiveLimit` alias (null when the list already fits) lets TypeScript narrow inside the branches.
- **Logic- or field-identical exports → alias, keep BOTH names** (`const canResetPasswordFor = canEditMember;`): an alias makes drift structurally impossible while every existing call site stays valid. Grep all consumers first to confirm nothing depends on the copies being distinct; deleting a name is a call-site migration, not a cleanup side effect.
- **Copy at two consumers, extract at the third.** When a task needs a sibling component's module-private helper (a 6-line chip, a 5-line predicate), copy it byte-equivalently into the new file with keep-in-sync comments on BOTH sides instead of extracting - a premature extraction churns a component outside the task's file set (exemplar: `PeriodCard`'s local `CurrentChip`/`temporalOf` copies from `PeriodPicker`). A third consumer is the extraction trigger: promote to a shared module then, moving every copy byte-equivalently.
- When extracting, copy behavior-critical blocks **byte-equivalent** and verify mechanically (`diff` against git HEAD) — never "improve" during a move; a future fix should diff against exactly what shipped.
- Shared row/shape normalization between sibling components lives in `utils/` behind a deliberately **structural param type** (`RowLike` in `utils/transactionItems.ts` — four string fields) so each component's local row type satisfies it without component-to-component type imports. URL-param readers (`intParam`/`intListParam`/`amountParam`/`createUpdateParams`) live in `utils/params.ts` — list pages import them instead of re-declaring. Object-literal API modules (`authApi`, `legalApi`) are `this`-less arrow functions — safe as bare `queryFn:` references and as stable module-level fetcher props for shared page components.

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

## API Error Message Extraction

Every API-error toast or handler extracts its message with
`getApiErrorMessage(error, 'Fallback message')` from `utils/errors.ts` — it wraps
`axios.isAxiosError` and reads `response.data.detail`, returning the fallback when either
is missing:

```typescript
onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to upload'))
```

Never hand-roll `(error as { response?: { data?: { detail?: string } } })` casts or
`error: any` at call sites — the helper is the single seam, and it keeps the error
parameter typed as `unknown`.

## Avoid Duplicate Toasts

Before adding error toasts in a catch block, check whether the called function already shows toasts (e.g., `AuthContext.login()` shows `toast.error()` and re-throws). If so, the catch only prevents unhandled rejection; an empty catch needs a comment for ESLint's `no-empty`:

```typescript
} catch {
  // Error already displayed by AuthContext
} finally {
  setIsSubmitting(false);
}
```

When a catch block exists only to swallow the error (no inspection), use the optional catch binding `catch { ... }` rather than `catch (e)`/`catch (_e)` — no unused binding, satisfies `@typescript-eslint/no-unused-vars` without underscore noise.

## Token Storage

Access and refresh tokens are stored separately in `localStorage` (`owlgarth_token`, `owlgarth_refresh_token`). Helpers in `api/client.ts`: `setRefreshToken`, `getRefreshToken`, `clearAuthToken` (clears both tokens and the Authorization header).

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

Credential endpoints (`login`, `register`, `verify2FA`, `refresh`) mark their requests `_skipAuthRefresh: true` — a wrong-credential 401 must reject immediately instead of entering the refresh path (a stale refresh token in storage would attempt a silent rotation and redirect to `/login`, swallowing the login form's own error toast). New credential-style endpoints (token exchange, magic-link consume) set the flag too.

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
- Public token pages must guard any authenticated follow-up call (e.g. `getCurrentUser()` refresh) with `if (getAuthToken())` — otherwise the 401 interceptor redirects anonymous visitors to `/login`, hiding the page's own success/error state
- Success states offer a navigation link; error states offer retry/resend
- Use a named `async` function inside `useEffect` with `try/catch/await` — no `.then()` chains
- Never show the same success state in both `try` and `catch` — add a distinct error state with a recovery path

## Dashboard Widget Component Pattern

Filter-scoped widgets (e.g. account- or budget-scoped) follow this structure:

```tsx
interface Props {
  budgetId: number | null
}

export default function MyWidget({ budgetId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['my-data', budgetId],
    queryFn: async () => {
      if (!budgetId) return null
      return myApi.getData({ budget_id: budgetId })
    },
    enabled: !!budgetId,
  })

  if (!budgetId) return null
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

**Key conventions:** early-return `null` when `budgetId` is null (no skeleton); `enabled: !!budgetId` on `useQuery`; three rendering states (loading skeleton / empty message / data); always a `<Link>` to the detail page; skeletons use `bg-surface-muted rounded-sm animate-pulse`; container uses `border border-border rounded-sm bg-surface p-4`.

**Enabled-chained queries gate loading on data presence, not `isLoading`.** When a query's `enabled` chains on another query's data (currentPeriod → history → summary), a disabled query reports `isLoading: false` — a bare `isLoading` gate flashes the empty-state message during the waiting window. Gate skeletons on `!!id && !data`, with a comment at the gate explaining the disabled window. Same class of race for defaults: when a fast list query and an authoritative query compete to supply a default value, gate the list fallback on the authoritative query's `isSuccess`. For switch-flash: paginated list queries get `placeholderData: keepPreviousData` (with placeholder data, `isLoading` is true only on first load, so the existing skeleton branch needs no change); non-paginated queries that should keep showing current data across id changes use `placeholderData: (prev) => prev`.

**Enabled flags gate on data PRESENCE, not optional-field inequality.** `budget?.cadence !== 'custom'` is TRUE while `budget` is still undefined - the query fires a doomed GET on every visit; write `enabled: budget != null && budget.cadence !== 'custom'`. Same race class for foreign-id arguments: a derived-membership gate (`const summaryPeriodId = allPeriods.some((p) => p.id === periodId) ? periodId : undefined`, feeding the queryKey) keeps a stale previous-entity id - the pre-reset render of budget-to-budget nav - and garbage `?period=` seeds off the server, killing the transient `budgetSummary(B, A_period)` 404. The gate is a derived const (zero set-state-in-effect cost) and must sit below the memo it reads (TDZ).

**Shared domain hooks:** Widgets read workspace data through the hooks in
`hooks/useDomain.ts` (`useAccounts`, `useBudgets`, `useEnabledCurrencies`,
`useMultiCurrency`, `useExtractionConfig` (returns `{ enabled, reachable }` — extraction UI
keys polling cadence on `reachable`), `useExtractionEnabled`) rather than threading props.
Periods are per-budget, so period selection is local state on the Budget detail page — there
is no global period context.

## State Refresh After Mutations

After operations that change server-side state (email change, profile update), fetch the full updated object rather than patching local state partially:

```tsx
// Good: fetch full state from server
const updatedUser = await authApi.getCurrentUser()
updateUser(updatedUser)
```

**Workspace cache invalidation is removal-by-predicate with a keep-set — never an invalidation list.** Workspace-scoped query keys don't encode the workspace id (the API serves the *current* workspace), so on workspace switch/create/delete `WorkspaceContext` runs `queryClient.removeQueries({ predicate })` keeping only the user/deployment-scoped keys in its `userScopedQueryKeys` set. Drift asymmetry is the reasoning: a drop-list that forgets a new query ships stale cross-workspace data (that IS the bug); a keep-set that forgets a new user-scoped key costs one harmless extra refetch (the safe direction). New workspace-scoped queries need zero action; new USER-scoped query keys must be added to `userScopedQueryKeys`.

- Use `removeQueries` (query cache only), not `clear()`, inside `useMutation.onSuccess` — `clear()` also empties the mutation cache and can evict the in-flight mutation's own entry. `clear()` is reserved for auth identity changes (login/logout), where a full wipe is wanted.
- `refetch()` from `useQuery` bypasses the query's `enabled` flag — guard manual refetches on the same condition `enabled` uses whenever the queryFn dereferences possibly-null data, or it throws on null.
- react-query v5 has no query-level `onError` — query failure UX renders inline (`isError || !data` early-return), not via a toast. A manual `useEffect` + `useState` fetch should become a `useQuery` (caching, retries, dedup at zero extra code).
- **Await the refetch before clearing a selection that an effect re-derives.** When a null-picker effect re-selects from a list (`setPeriodId(periods[0].id)` whenever the selection is null), a delete mutation must `await` the list's `invalidateQueries` refetch BEFORE clearing the selected id - clearing against a stale cache lets the effect re-select the just-deleted id, and a ghost id whose lookup returns null renders a dead page. Exemplar: `BudgetDetailPage`'s `deletePeriod` awaits the `['periods', budgetId]` refetch before `setPeriodId(null)`; a fire-and-forget invalidation plus an immediate clear reintroduces the race. Invalidation ownership follows mutation ownership: the form modal's own `onSuccess` invalidates its add/edit (`PeriodFormModal`); a page-level delete mutation invalidates in the page.
- **Cross-tab staleness is a different bug class from invalidation.** Each browser tab keeps its own query cache, so a mutation's invalidation never reaches other tabs - and `refetchOnWindowFocus` defaults to stale-only while `api/queryClient.ts` sets a 5-minute `staleTime` app-wide, so focusing the observing tab refetches nothing until that expires; an entry deleted in another tab lingers in this tab's dropdown and selecting it 404s. Fix class: `refetchOnWindowFocus: 'always'` on the cheap list GETs that feed dropdowns - the `useDomain.ts` list hooks (`useAccounts`, `useBudgets`, `useEnabledCurrencies`, `useWorkspaceCategories`) and page-local lists such as `BudgetDetailPage`'s `['periods', budgetId]` query - leaving `staleTime` in force everywhere else for navigation snappiness. Probe by bug class: same-tab invalidation via SPA-link navigation (no reload), cross-tab staleness via two real tabs plus a focus event (`bringToFront()`); never `page.goto()` - a full load re-creates the query cache and masks both.

## Reading State in Mutation Callbacks and Effects

**TDZ-safe reads in `useMutation.onSuccess`:** A mutation callback defined before a derived `const` in source order cannot reference that const — JavaScript's temporal dead zone throws `ReferenceError` at call time, and **`tsc` does NOT catch this** (TDZ is a runtime semantic, not a type error; a clean build does not prove TDZ safety). When `onSuccess` needs state that is also captured by a later-declared const, read the source state directly:

```tsx
// `account` is declared AFTER `parse` in source order — referencing it here throws at runtime
const parse = useMutation({
  onSuccess: () => {
    const current = accounts.find((a) => a.id === accountId)?.currency_code  // read source state, not `account`
    if (current !== parsed.currency) { ... }
  },
})
const account = accounts.find((a) => a.id === accountId)
```

**Stale-state-safe reads inside an effect that sets then branches:** When an effect calls `setState` and then needs to branch on the value being set, reading the state variable reflects the render that created the effect (the *previous* value), not the just-set value — React flushes state between effect runs, not mid-effect. Recompute the value locally instead of reading the state variable:

```tsx
useEffect(() => {
  const intended = accounts.length === 1 ? accounts[0].id : null
  setAccountId(intended)
  // branch on `intended`, NOT on `accountId` — accountId is still the previous open's value here
  if (intended !== parsedCurrency) { ... }
}, [accounts, ...])
```

**Guards inside closures created before an early return are NOT dead.** After `if (!x) { return }`, JSX guards on the narrowed `const` are dead (TS narrows; delete them). But the same guards inside handlers/closures declared BEFORE the return are live — the closure's `x` keeps its declared nullable type because the closure is created where `x` was still nullable, and `tsc` fails if you remove them. Check closure creation order, not just runtime reachability, before deleting "redundant" guards.

## State Changes in Event Handlers, Not Effects

The project lints `react-hooks/set-state-in-effect`; the pre-existing warnings are codebase-wide backlog — never add a new one. The baseline is frozen at a fixed warning count (19 at PR #84) and gated by counting rule-fired warning lines (`grep -cE '^\s+[0-9]+:[0-9]+\s+warning'`), never lines containing the word `warning` - the summary line (`0 errors, 19 warnings`) also matches a substring count and skews the gate by one. Build new components lint-quiet by construction: all state in a shared hook (zero `useState` in the component, e.g. `PeriodPicker`) and effects that only mutate the DOM (`scrollTop` math, no setters) - a structurally quiet component adds zero warnings whatever the baseline drifts to. For mount-time behavior (e.g. focusing a just-added row), set transient state inside the **event handler** that caused the mount, act via a plain HTML attribute (`autoFocus={condition}` — fires when the conditionally rendered content mounts), and self-clear in an `onFocus` handler — the self-clear keeps the behavior correct across unmount/remount of conditionally rendered content. Event handlers are not effects: the lint stays quiet. Don't reach for `useEffect` + `setState` or ref callbacks for this class of behavior.

**Grep/lint done-criteria gates - classify the failure before touching code.** Gates that grep the working tree count comment text and exact-cased identifiers only: keep gated literals out of the comments/docblocks of gated files (the phrase "Zero useEffect by construction" tripped a `grep -c 'useEffect' == 0` gate; comment mentions of `scrollIntoView` tripped a banned-call gate - both fixed by rewording the comment, zero code change), and a lowercase grep pattern cannot see a PascalCase setter (`grep 'periodModalNonce'` finds 2 lines, not 3 - `setPeriodModalNonce` hides its capital P; count exact-cased occurrences only). When a lint count disagrees with the spec, prove "pre-existing" mechanically instead of fixing a non-regression: `git show main:<path> | npx eslint --stdin --stdin-filename <path>` lints main's copy without touching the working tree, and findings compare by IDENTIFIER, not line number - earlier tasks' import lines shift rows without adding warnings. The binding invariant is zero NEW warnings against the frozen baseline; a spec's per-file count that disagrees is a spec arithmetic error, and "improving" a pre-existing warning mid-pass is an out-of-scope refactor of working code.

When a `setState` in an effect is genuinely unavoidable, the rule reports **once per effect** (at the first violating call) — work within that granularity:

- **Per-entity resets extend an already-flagged effect.** Resetting state on id change (stale period leaking across budget→budget navigation in an unkeyed route) goes INTO the existing `[entityId]` effect as more setters — zero new warnings. A new same-shaped effect would add one.
- **Adopting server truth is derivation, not effect-setState.** `const activePendingId = pendingId ?? serverPendingId` — a derived const is lint-quiet where copying the server value into state would add a warning, and the derived value drives the poll that eventually clears it.
- **Loaders stay effect-local.** A hoisted `useCallback` loader called from a mount `useEffect` is traced by the compiler lint across the `await` and produces a NEW warning even when every setter sits after the await — declare the named `async` loader inside the effect. Retry comes from an event-handler-bumped tick in the deps (`const [retryTick, setRetryTick] = useState(0)`; the Try-again button does `setRetryTick(t => t + 1)` — always lint-quiet).

## URL Search-Param State Sync

Pages that mirror a selection into a URL param (`/budgets/:id?period=X`) follow a read-once / write-from-handlers contract (`BudgetDetailPage` is the exemplar):

- **Seed read via latest-ref:** `const periodParamRef = useRef(intParam(searchParams, 'period'))` plus a ref-sync effect whose body contains ONLY the ref write - no `setState`, so zero set-state-in-effect cost (render-time `ref.current` writes are illegal under `react-hooks/refs`). This extends the latest-ref rule under Contexts from callbacks to derived values: effects read the seed from the ref instead of the page subscribing to `searchParams` changes.
- **Effects NEVER write the URL - only event handlers and mutation callbacks do.** Sanctioned write sites: the selection setter invoked from the picker's `onChange`, adjacent/materialize navigation branches, and a delete mutation's `onSuccess` when it removed the selected id. An effect-side router write is both a fresh lint risk and URL churn - an auto-pick running in an effect would rewrite every entry URL.
- **Writes use functional `setSearchParams` with `{ replace: true }`.** The functional form preserves unrelated params (same shape as `createUpdateParams` in `utils/params.ts`); `replace` keeps selections out of history so Back leaves the page in one press.
- **Effect declaration order is load-bearing.** Ref-sync effect BEFORE the `[entityId]` reset effect (the reset seeds from the ref, so the ref must already hold the NEW URL's value on mount and entity-to-entity nav); the reconcile effect also before the reset effect (its seed must land last, beating a cached `currentPeriod` auto-pick mid-race) but AFTER any memo its deps reference - a deps array naming a later-declared const is a TDZ `ReferenceError`.
- **Garbage or foreign seeds reconcile by clearing state only** - never an effect-side URL rewrite; the URL keeps the bad param and self-heals on reload. Gate the clear on the data being authoritative (`periodsLoaded && currentPeriodKnown`): a valid seed may equal a lazily-materialized current period that is not in the periods list mid-race, and clearing it early flashes the wrong selection.

## API Client Pattern

```typescript
// Categories are nested under a budget (see budgetsApi in client.ts):
export const budgetsApi = {
  listCategories: (budgetId: number, includeArchived = false): Promise<Category[]> =>
    api.get<Category[]>(`/budgets/${budgetId}/categories`, { params: { include_archived: includeArchived } }).then(r => r.data),
  createCategory: (budgetId: number, data: { name: string }): Promise<Category> =>
    api.post<Category>(`/budgets/${budgetId}/categories`, data).then(r => r.data),
  // …update / archive / delete follow the same nested shape
}
```

**Export type aliases for repeated literal unions:** When a literal union (e.g., ordering options) is used in more than one place, export it as a `type` alias at the top of `client.ts` and import it at call sites — don't inline the same union in multiple files:

```typescript
// client.ts
export type TransactionOrdering =
  | '-date' | 'date' | '-description' | 'description'
  | '-amount' | 'amount' | '-type' | 'type'
  | '-category__name' | 'category__name'
  | '-account__name' | 'account__name' | '-account__currency__code' | 'account__currency__code';
```

**Per-request headers via an optional `opts` bag:** `create(data, opts?: { idempotencyKey?: string })` injects the header with a conditional spread on the axios config — `...(opts?.idempotencyKey ? { headers: { 'Idempotency-Key': opts.idempotencyKey } } : {})` — so call sites without the option are untouched. Never push per-request headers onto `api.defaults.headers`; that leaks across requests.

**Internal per-request flags go through axios module augmentation, never `as any`:**

```typescript
// api/client.ts
declare module 'axios' {
  interface AxiosRequestConfig { _skipAuthRefresh?: boolean }
}
```

Augmenting `AxiosRequestConfig` also types `error.config` (`InternalAxiosRequestConfig` extends it), so producer and consumer sites stay fully typed with zero casts.

**Idempotency keys on create mutations:** `crypto.randomUUID()` per modal session — stable within one open, fresh across opens. A modal that resets in an open-effect generates the key in the create branch of that effect (`null` in the edit branch); a permanently-mounted modal reset via `close()` → `reset()` uses a lazy `useState(() => crypto.randomUUID())` initializer and regenerates inside `reset()`.

**Backend-mirrored constants:** `PAGE_SIZE_OPTIONS` in `utils/pageSize.ts` duplicates the backend's `ALLOWED_PAGE_SIZES` — the user's choice is persisted to localStorage and sent as `page_size` on every list request, so the two lists must change together (the 422 trap is documented under Pagination Param Caps in the `django-backend` skill). Put an inline sync comment at the constant itself in the one-line `/** Synced with backend <file> <CONSTANT>. */` format (see `TotalsLabel`) — the coupling knowledge belongs where the next editor actually looks, not only in this skill. The same discipline applies to format strings: `formatPeriodName` (`utils/format.ts`) mirrors the backend's period-naming format (dd MMM + en dash) and is persisted as period names, while the adjacent display-only `formatPeriodRange` ("Apr 1 - Apr 30", regular hyphen) is deliberately different - harmonizing the look-alikes would corrupt the mirror, and the separator difference is invisible in review surfaces. The docblock adjacency warning between them is the guard; do not remove it.

## Money Arithmetic (Exact Strings)

Backend Decimal amounts cross the API as strings; any arithmetic whose result is **persisted or sent back** must be exact string/BigInt math via the helpers in `utils/format.ts` (`subtractAmounts` — BigInt cents, 3rd-digit round-half-up, never returns `'-0.00'`). Never `parseFloat` a backend Decimal that will be persisted: a 17-digit Decimal through `parseFloat` loses the last cent, and the wrong delta gets recorded as a real adjustment transaction. Floats are for validation/display only.

Number-input values are arbitrary strings — `'1e5'`, `''`, `'.5'`, `'5.'` — so validate with a regex (`/^-?(\d+(\.\d*)?|\.\d+)$/`, which also rejects e-notation) before the BigInt math. BigInt itself accepts leading zeros; only the regex gate keeps scientific notation out.

## Contexts

```typescript
const { user, isAuthenticated } = useAuth()
const { workspace, workspaces, switchWorkspace, createWorkspace, deleteWorkspace, userRole } = useWorkspace()
// No global account/period context — use hooks/useDomain.ts and page-local period state.
```

**Stable context values:** wrap every context function in `useCallback` and the value object in `useMemo`. When a callback reads mutable state, prefer a functional `setState` update (`setUser(prev => prev ? {...prev, ...patch} : prev)`, empty deps) over listing the state in deps — stable identity beats freshness for context functions. Every render of an unmemoized provider recreates its function values, so any consumer effect keyed on them replays — the verification-pages double-POST class of bug.

**Latest-ref for context callbacks consumed in effects:** `const fnRef = useRef(fn)`; `useEffect(() => { fnRef.current = fn }, [fn])` — effect deps then stay `[realDeps]` while the effect always calls the current callback. Sync the ref inside an effect; render-time `ref.current = fn` writes are an ERROR under the `react-hooks/refs` rule — do not "simplify" back to them.

**Singletons shared between `main.tsx` and contexts live in their own module** (`api/queryClient.ts`), never exported from `main.tsx` — importing app code from the entry file creates a circular import the moment that module imports anything from the app.

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
