---
name: frontend-react
description: Frontend (React/TypeScript/Vite) conventions for Owlgarth Finances - design system tokens, theme reader atomicity (FOUC script, ThemeContext, theme-color metas), modals, component patterns, TanStack Query widgets and cache invalidation, exact money math, UI text i18n (namespaces, plurals, formatPeriodName mirror), dedup seams and domain hooks modules, API client, blob downloads and object-URL ownership, auth token storage/refresh, lint and grep-gate discipline, naming and import order. Use when writing or modifying any code in frontend/.
---

# Frontend Conventions (TypeScript/React)

## Design System Tokens

The frontend uses an "Architectural Ledger" design system via CSS custom properties. All colors reference `var(--color-*)` variables — never hardcoded hex values in component code.

- **Color tokens:** `primary`, `primary-hover`, `background`, `surface`, `surface-hover`, `surface-muted`, `border`, `border-focus`, `text`, `text-muted`, `positive`, `positive-bg`, `negative`, `negative-bg`, `warning`, `warning-bg`, `scrim` (overlay backdrop — `bg-scrim` in `Modal`/`BottomSheet` overlays)
- **Border radii:** `rounded-sm` (4px) — containers, buttons; `rounded-none` (0px) — inputs, table cells
- **Fonts:** `font-sans` — Geist (body/UI); `font-mono` — JetBrains Mono (code, numbers)
- **Icons:** `lucide-react` only. No Material Symbols or other icon fonts.
- **Focus ring:** `:focus-visible` uses `var(--color-border-focus)`. No shadow variables — avoid `box-shadow` utilities for elevation.
- **Full-bleed focus rings draw inside:** a positive `focus-visible:outline-offset-2` draws the outline OUTSIDE the element edge, so on a `w-full h-full` button inside an `overflow-hidden` wrapper (media tiles) it clips invisible on three of four sides - use `focus-visible:-outline-offset-2` (inset ring) there, and the standard positive offset on contained buttons. Exemplar: the attachment tiles in `transactions/TransactionAttachments.tsx`.
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

## Theme Signal Readers Move in One Commit

The theme decision (`owlgarth_theme` in localStorage) is read in three places: `index.html`'s inline FOUC script (the earliest reader - it applies the `.dark` class before first paint), `ThemeContext` (seeds its state from the `<html>` class, owns the toggle and writes the key), and the `theme-color` metas (chrome UI color, synced on toggle). They are three views of one decision: any change to the storage key, the default, or the OS coupling must move ALL readers in the same commit. Leaving one behind diverges the views - a theme flash on reload when the script and the context disagree, or chrome color tracking the OS preference while the app stays light via a leftover media-gated meta. Hit by both the rebrand's storage-key rename and the light-default decoupling: census every reader of the theme signal before editing it.

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
Ad-hoc interactive rows outside the shared classes (listbox option rows, filter chips)
interpolate the full `${controlHeightClass}` constant from `formStyles` instead of
hand-writing a `pointer-coarse:min-h-[44px]`-only half - the `min-h-8` fine-pointer base is
the other half of the contract, and the constant stays the single source of truth.

`.touch-hit` sets `position: relative` in the same `@layer utilities` that Tailwind emits
`.absolute`/`.fixed` into — equal specificity, later source order, so `.touch-hit` wins: an
element carrying both classes silently computes `position: relative`. When an element needs
true absolute positioning plus the enlarged hit area, use `!absolute` — the attachment-tile
delete button in `transactions/TransactionAttachments.tsx` (`!absolute top-1 right-1 …
touch-hit`, the trash button on each receipt tile) is the canonical example; without the
`!` it computes `position: relative`, drops into flow below the image, and the tile's
`overflow-hidden` clips it out of sight. Verify cascade fixes against the compiled CSS, not the
source className. A sneakier instance of the same class: Tailwind v4 emits utilities
alphabetically, so in the compiled sheet a shared base class's `w-full` lands AFTER any appended
caller `w-NN` (a `Select` trigger's base plus a caller's `w-48`) - equal specificity, later sheet
order wins, and the caller's pinned width silently never applies: no error, no lint, the trigger
stays content-sized. A call site needing a genuinely pinned trigger width must resolve the
component's base-vs-caller conflict first; prove sizing and cascade claims against rule offsets
in `dist/assets/*.css` or a static headless-Chrome measuring harness (see
`frontend-live-stack-probing`), never the className string.

## Modal Pattern

Use `common/Modal.tsx` — it renders a centered panel on desktop and delegates to
`common/BottomSheet.tsx` on mobile (animated bottom sheet with scroll-lock, stack-aware
Escape, focus return, keyboard avoidance). Don't hand-roll fixed-overlay markup:

```tsx
const { t } = useTranslation('transactions')
// ...
<Modal open={isOpen} onClose={onClose} title={t('form.editTitle')} size="md" className="p-6">
  {/* content */}
</Modal>
```

The `title` prop is UI text and goes through `t()` like any other label.

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

**A settings bridge from an open form keeps both overlays mounted.** When the second overlay exists so the user can manage reference data mid-form (a "Manage currencies" link inside a form modal), chain-closing would destroy the typed values - the wrong move. Keep the form modal mounted, open the panel as a second overlay, and render the panel instance AFTER every other modal in the page JSX: both sit at the shared `z-modal` level so DOM order decides stacking, and `useOverlay`'s mount-order stack closes the later-mounted panel first on Escape. Gate the bridge callback at the page level (`canManageCurrencies ? openSettings : undefined`) so unauthorized roles never see a dead-end link; the prop itself stays optional so ungated call sites render no link. Exemplar: the `WorkspaceSettingsPanel` bridge in `AccountsPage`/`BudgetsPage`.

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

- **Mount-per-use:** a modal that seeds state from props in `useState` initializers drops the `open` prop entirely — the caller's conditional render (`{row && <Modal …/>}`) IS the open/close mechanism. Document the contract in the docblock (`ExtractionReviewModal`, `PeriodFormModal` - its caller's mode/id/`nonce` render `key` forces a fresh remount every open, including add-after-add). From a list page, page state is `{entity} + nonce` with a key of mode + entity id + nonce (`BudgetsPage`'s add-period modal: `add-${budget.id}-${nonce}`) - the nonce is load-bearing because entity id alone reuses the mounted instance when a close-then-open batches into one tick (the null gap never renders). A plain FORM component owns its Modal the same way: it renders `<Modal open onClose={onClose}>` with the open prop hardcoded (`CreateWorkspaceForm`), so every call site collapses to one conditional element and title/size/padding live in exactly one place. Each opening container (dropdown, sheet) closes itself BEFORE the modal mounts, so Escape always faces exactly one layer - the layering question dissolves by construction instead of by `stopPropagation` discipline. Form-level Escape handlers are deleted, not ported, when a form moves into a Modal: the overlay stack owns Escape, and a surviving form-level branch fights the topmost-layer-only close.

**Escape inside a Modal:** a popup that lives inside a Modal (e.g. `DatePicker`'s desktop panel) consumes Escape at its focusable element — `preventDefault()` + `stopPropagation()` + close — gated on the popup being open, so a closed popup still lets Escape bubble to the surrounding Modal.

**Open-effect deps key on list LENGTH, not identity.** A seeding effect that waits for reference data lists `currencies.length` / `accounts.length` in its deps, not the array itself - a `refetchOnWindowFocus: 'always'` refetch that returns an equal-length list does not re-run the effect and does not reset the form mid-edit, while a genuinely new list still re-seeds.

**Migrating a hand-rolled fixed overlay to `Modal`:** pass `title` (string prop) + `className="p-6"`, and delete the manual `useOverlay` plus the hand-rolled header/`aria-labelledby`/close-X machinery — `Modal` wires stack-aware Escape/scroll-lock/focus on desktop and delegates to `BottomSheet` on mobile, preserving the behavior by construction.

**Sanctioned exception - full-bleed media lightboxes.** A viewer whose content IS the viewport (the attachment image lightbox) does not fit `Modal`'s centered panel and title header, so hand-rolling it is allowed - but it still goes through `useOverlay(active, onClose)` for stack-aware Escape, refcounted scroll lock, and focus capture/restore, and its panel carries `ref` + `role="dialog"` + `aria-modal` + `tabIndex={-1}` exactly like `Modal`'s panel. An unregistered overlay lets Escape close the modal underneath it (the bug class `useOverlay` exists to prevent). Exemplar: the lightbox in `transactions/TransactionAttachments.tsx`.

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

- **ConfirmDialog is wired with `isPending={mutation.isPending}`** (both buttons disable via the shared classes). Dialog close semantics: form modals stay open on error so input can be corrected; a destructive ConfirmDialog with no correctable input (remove/delete, reset 2FA) closes in BOTH `onSuccess` and `onError` - the class is "destructive confirm with nothing to correct", not literally delete mutations.

- **In a `mutationFn`, the durable call comes first; non-durable follow-ups** (post-save description update, post-create upload) go after it, wrapped in a swallowing `catch {}` with a reason comment — a mutation retry must never re-run already-durable side effects (the append branch would duplicate saved rows). When the follow-up is user-recoverable rather than silently retryable, the catch toasts the recovery location instead of swallowing: return the durable result so the mutation still succeeds - two toasts on partial failure (follow-up error + success) is intended design, not a duplicate-toast bug. `isPending` spans the whole chain, so the submit button stays disabled until the follow-up settles. Exemplar: `BudgetsPage`'s `CreateBudgetModal` - create budget, then chain `createPeriod`; its failure toasts "you can add it from the budget page".

- **Derived-until-touched fields:** a field auto-derived from other fields (period name ← start/end dates via `formatPeriodName` in `utils/format.ts`) re-derives in the source fields' `onChange` handlers, guarded by a touched flag that flips `true` only in the derived field's own `onChange` - once the user edits it, source changes stop overwriting their text. Reset the flag only in the modal's reset path (`handleClose` for a permanently-mounted modal; the keyed remount is the reset for mount-per-use), so every fresh open re-derives. No effect is involved - the guarded setters keep `react-hooks/set-state-in-effect` at its frozen baseline. Exemplars: `CreateBudgetModal` (`BudgetsPage.tsx`) and `PeriodFormModal`, both on a `nameTouched` flag.

- **Key-handling scope:** Enter-key interception for a nested non-form action goes on the individual inputs (`onKeyDown` + `preventDefault`), never on a wrapper div — wrapper-level hijacks Enter on focused buttons inside it. Keyboard activation on non-button elements (e.g. a selectable `<tr>`) uses `tabIndex={0}` + `onKeyDown` guarded by `e.target === e.currentTarget` so nested inputs/buttons keep their native Enter/Space.

- **Optional form fields submit `x: value || undefined`** so axios omits the key entirely when blank (backends reject `""`, not absence). To make a text input "required only when non-empty", drop `required` but KEEP `minLength` - native constraint validation ignores `minLength` on an empty, non-required input; zero conditional props needed. A full-replace PUT is the exception - blank sends the key as `null`, never omits it (see Full-replace PUT contracts under API Client Pattern).

- **Conditional ARIA attributes** (`aria-current`, `aria-sort`, `aria-controls`) use `… : undefined` for the inactive state — React then omits the attribute entirely, which is the correct ARIA shape. Prefixed ARIA props destructure as aliases: `'aria-controls': ariaControls`.

- **A takeover panel announces ONCE, statically - mutating step lists stay OUTSIDE live regions.** A panel that takes over a card mid-submit renders exactly one `sr-only` `role="status"` summary when it appears (`grep -c 'sr-only' == 1`); putting the step list inside a live region would announce every stage flip - chatty, and lagging the visuals. The panel itself takes focus via `tabIndex={-1}` + `outline-none`, the same panel shape `Modal` uses. Exemplar: `Register`'s setup checklist.

- **A switching control announces through a sibling live region, never by being one.** Button text changes are not reliably announced and buttons must not BE live regions, so a control whose value switches (a currency switcher) renders a visually hidden `<span className="sr-only" aria-live="polite">` beside it carrying the active value on every change. The live region MOVES with the control when it relocates - render it once beside the new home, never in both places (`grep -c 'sr-only' == 1` pins it). A `display:none` copy of the control (`max-sm:hidden`/`sm:hidden` dual embed, one copy always hidden) is outside the accessibility tree, so only the visible copy announces - the dual embed is safe for the live region. Exemplar: `BudgetDetailPage`'s currency strip.

- **`key={index}` on a reorderable list is a bug** — focus and selection jump when a `move` swaps values between stationary DOM nodes. Mint `crypto.randomUUID()` at every row-creation site (`emptyRow`, seeding maps) and render `key={row.id}`.

- **Invisible characters in source must stay visible escape sequences** — write `'\u00A0'`, never a raw NBSP byte (0xC2 0xA0) or a plain space: file writes can silently mangle the byte, reintroducing the collapsing-trigger bug (`MultiSelect`'s empty-state label) while every grep for `u00A0` still passes. Verify with `grep -P '\xc2\xa0'` when touching nbsp literals.

Standard form component shape: props interface, `isLoading` state, `handleSubmit` with `try/catch` showing `toast.error(...)` and `finally { setIsLoading(false) }`.

- **Submit-button micro-loader:** `Loader2 size={13} animate-spin` rendered BEFORE the "-ing" label ("Signing in"), with `items-center gap-1.5` added to the button's existing `flex justify-center`; keep `disabled:cursor-not-allowed`, never `cursor-wait` - every shipped Loader2 button agrees (blessed in `design/components.md` §3). Exemplar: `Login`'s "Sign in" / "Verify" buttons.

**Inline checkbox labels — raw `inline-flex`, not `labelClass`:** An inline boolean toggle inside a form (e.g. "Set as default for {currency}", "Paid in another currency?") uses a raw `<label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">` wrapping its `<input type="checkbox">` — never the shared `labelClass` from `formStyles.ts`, which carries the block + margin styling meant for field labels *above* inputs. This is the established pattern wherever a checkbox sits inline with its label text.

- **An immediate-action picker pins `value={null}` and holds no selection state.** When every pick fires its action directly from `onChange` and the invalidation refetch removes the option from the derived list (an enable-currency Select whose options are catalog-minus-enabled), local selection state would only ghost an option that no longer exists - zero selection state, the placeholder is the resting state. Only valid where the option list is fully derived and shrinks with every successful action; never copy it to a form whose picked value IS the submission. Exemplar: `CurrenciesSettingsSection`'s enable Select.

- **A control that writes a persisted preference must stay mounted in every state that preference can produce.** A render gate that unmounts the control in a state its own stored value creates is a permanent dead end: the page-size Select lived inside a bar gated on `total_pages > 1`, and picking a size that collapses the list to a single page (persisted in localStorage, re-applied on every mount) unmounted the bar - the dropdown could never come back. Audit persisted-preference controls (localStorage, URL, account setting) for that self-reference. Compound bars split the concern at the component boundary: the persistent preference half renders unconditionally in-component, the situational half (page nav) is gated internally, and call sites key bar presence on "rows exist" (`total > 0`), never "multiple pages exist" - future consumers are correct by construction instead of re-learning the gate at every call site. Exemplar: `Pagination`'s in-component nav gate.

- **An optional FK field in a Select uses a sentinel option - never a widened shared contract.** Select's value contract is `string | number` and cannot hold `null`, and a cleared disabled control renders a deliberate state as an unfilled placeholder. Recipe: a module-level UPPER_SNAKE sentinel primitive (`NO_ACCOUNT = 0` - entity ids are positive, so it never collides), the sentinel option listed FIRST, `value={accountId ?? NO_ACCOUNT}` so the trigger shows a real selected state instead of the muted placeholder, and `onChange` mapping the sentinel back to `null`. Type-conditional option lists derive from one const (`accountSelectOptions` built from `accountOptions` plus a type gate) instead of branching the JSX - a type the backend rejects account-less (adjustments) simply drops the sentinel, and Select's absent-value-renders-placeholder contract shows the incompleteness with zero extra state. Picking a parent entity sets AND locks the dependent field (`disabled={accountId !== null}` + stock disabled styling); picking the sentinel KEEPS the dependent value - the typed amount is already in that currency, so do not snap to the primary. Exemplars: `PlannedFormModal`, `TransactionFormModal`. Do NOT widen a shared component's typed contract for one field.

- **External data seeds form fields through the canonical reference list.** A parsed or imported value (a receipt's currency code) seeds the field by matching it against the enabled-currencies list - the list's casing is canonical, never the raw parse - and an enabled parsed code seeds the own-currency field even when no account matches it (the traveling-cash case); a later account pick then locks the same code. Exemplar: `TransactionFormModal`'s receipt fill.

## Deduplication Seams

Choose the extraction mechanism by WHAT the duplication is:

- **More than half the duplicated surface is JSX → a shared self-contained component**, not a hook (hooks can't dedup JSX). It reads ambient state — filter values from `useSearchParams()`, reference data from the `useDomain` hooks — instead of taking props, so call sites collapse to one element. `common/ListFilterFields.tsx` (Transactions/Planned shared filter group) is the exemplar; page-specific fields stay in the page. When a legitimate call site exists BEFORE the ambient data does (a pre-workspace form - no enabled-currencies query exists yet), add an explicit-prop override instead of forking the component: `const ambient = useEnabledCurrencies(); const currencies = currenciesProp ?? ambient` - the ambient hook still runs unconditionally above every branch (hooks-ordering corollary), the pre-workspace site passes the explicit prop, and every other site passes nothing. Exemplar: `CurrencySetField`. When the ambient query itself would be doomed at that site (an authenticated GET fired pre-auth), give the hook an optional `enabled = true` param and pass the override condition - `useEnabledCurrencies(currenciesProp === undefined)` - so the query never fires at prop-fed sites while every existing caller and the unconditional hook CALL stay untouched. When a spec pins a prop value "because the precedent uses it", verify the precedent in the code actually does - spec claims about code are code claims (a "compact mode, like workspace creation" claim hid that the precedent actually passes full mode).
- **Identical state machine with one behavioral delta → a hook with the delta injected as a callback.** `hooks/useListboxPanel.ts` + `common/listboxParts.tsx` (Select/MultiSelect): the keyboard/open/highlight machinery lives once; `onActivate` carries pick-and-closes vs toggles-and-stays. Extracted hooks keep host-surface state OUT — closing the host dropdown/sheet is the caller's `onDone` callback, run on success only, never on failure.
- **A third consumer needing different presentation is a sibling, not a fork and not a hook change.** `PeriodPicker` reuses `useListboxPanel` + `listboxTriggerBaseClass` untouched; every presentation deviation (panel width, year groups, two-line mobile rows, CURRENT chip, hover semantics) lives in the component. Changing the shared hook/parts to serve one consumer silently changes Select/MultiSelect behavior you never set out to touch.
- **Interleaved non-option rows must not break the hook's flat option indexing.** When groups carry labels/dividers between options, thread the flat index through the grouping: build groups with `periods.reduce` whose third argument IS the hook's option index (items carry `{ period, index }`), with `optionId`/highlight/`onActivate` keyed on `item.index` - never a group-local counter. aria-hidden label divs stay skipped by keyboard nav precisely because the hook counts options only.
- **Scroll-to-selected inside a popover is manual `panel.scrollTop` centering math, never `element.scrollIntoView`** - `scrollIntoView` scrolls every scrollable ancestor and drags the page under the popover.
- **A non-selectable action row inside a listbox ("View all periods") is a pseudo-option in the hook's option space.** A bare `<button>` child of the listbox sits outside `aria-activedescendant`, and End/type-ahead/Enter skip it. Recipe (`PeriodPicker`'s view-all row): append `{ value: SENTINEL, label }` LAST to the hook's options with a numeric sentinel that cannot collide with real values (`-1`, impossible for a DB primary key, keeps `ListboxOption<number>` honest); branch in `activateIndex` on the sentinel (fire the navigation callback, `closePanel`, return) - activation is not selection, so no `onChange` path; render `role="option"` + `aria-selected={false}` (an action is never the selected value), with `id={optionId(index)}` + `tabIndex={-1}` on the desktop panel (the trigger owns focus) and no `id` in the mobile sheet (row parity). The scroll-to-selected `querySelector('[aria-selected="true"]')` still finds the real selection because the pseudo-option is always `aria-selected={false}`. Any windowing around the options (a `limit` cap) is pure per-render derivation clamped so the selection always lands inside the window - never state, which would need re-sync effects; an `effectiveLimit` alias (null when the list already fits) lets TypeScript narrow inside the branches.
- **An input-anchored combobox (text-input autocomplete) is a SIBLING of `useListboxPanel`, not a consumer.** The hook's contract is a trigger button + panel pair; grafting a text input onto its trigger machinery would fork it for one consumer. Recipe (description autocomplete in `TransactionFormModal`): the panel opens on `onFocus` - "true while interacting" needs an explicit open trigger or it can never appear from false; blur closes after a ~150ms delay, because a suggestion-row click blurs the input first and a synchronous close would unmount the row before the click lands; Enter acceptance is bounds-checked (`0 <= highlighted < suggestions.length`) - a mid-flight refetch can shrink the list under a highlight set against the previous render's rows; typing resets the highlight to -1 so Enter submits the typed text (only an explicit arrow press arms acceptance); Escape is consumed (`preventDefault` + `stopPropagation`, gated on the panel being open) so the surrounding Modal/BottomSheet stays open; the plain input carries conditional `aria-controls`/`aria-activedescendant` via `: undefined`, rows are `role="option"` + `tabIndex={-1}` with useId-derived ids, and row touch floors interpolate `${controlHeightClass}`.
- **Logic- or field-identical exports → alias, keep BOTH names** (`const canResetPasswordFor = canEditMember;`): an alias makes drift structurally impossible while every existing call site stays valid. Grep all consumers first to confirm nothing depends on the copies being distinct; deleting a name is a call-site migration, not a cleanup side effect. The inverse: when a new action's backend gate is verbatim identical to an existing predicate's (reset-2fa shares reset-password's role check), reuse the existing predicate verbatim rather than minting a second alias - a new name adds drift surface and saves nothing.
- **Copy at two consumers, extract at the third.** When a task needs a sibling component's module-private helper (a 6-line chip, a 5-line predicate), copy it byte-equivalently into the new file with keep-in-sync comments on BOTH sides instead of extracting - a premature extraction churns a component outside the task's file set (exemplar: `PeriodCard`'s local `CurrentChip`/`temporalOf` copies from `PeriodPicker`). A third consumer is the extraction trigger: promote to a shared module then, moving every copy byte-equivalently. (A task's scope fence may leave the reciprocal keep-in-sync comment off the untouched sibling - editing an out-of-fence file just to add the comment exceeds the fence; the third-consumer extraction reconciles both copies.)
- **A resource's data logic (queries + mutations + cache-key builders) lives in a domain hooks module, not a component and not a class-based service.** When a resource will plausibly serve more than one consumer (attachments feed tiles, a lightbox, future pages), extract its full data logic at the FIRST consumer into `hooks/useAttachments.ts` - the `hooks/useDomain.ts` pattern (see Shared domain hooks) applied per resource: exported key-builder functions (`transactionAttachmentsKey`, `attachmentBlobKey`) so any hook or component can invalidate precisely, one hook per operation, each mutation owning its cache invalidation internally. Pure non-hook helpers (`isImage`, `triggerBrowserDownload`) go in `utils/attachments.ts` beside `utils/errors.ts` / `utils/format.ts`. This is the carve-out to "copy at two, extract at three" above - that rule is for presentation helpers; reusable data logic is extracted immediately because component-inline data logic cannot be reused without a rewrite. Service classes are the wrong seam in React: hooks compose with TanStack Query caching and component lifecycle, and the axios client in `api/client.ts` stays the only HTTP seam.
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

**A long in-flight submit swaps the whole card body for a staged progress panel** - branch on `isSubmitting` (Register's "Setting up your workspace" checklist), never offer only a disabled button: a 2-5s synchronous request with no visible progress reads as a frozen UI. The swap never unmounts the component, so all form state stays alive and a failed submit restores the typed values for free, and the derived stage list is frozen mid-flight because the input that could change it (the sample-data checkbox feeding its conditional) is unmounted by the swap. Stages are pure client-side timers identical on every error path - backend state never leaks through stage count or timing - and the advance is capped (`Math.min(s + 1, setupStages.length - 1)`) so the terminal step stays "active" forever: it must never flip to complete while the request is still hanging. Exemplar: `pages/Register.tsx`.

## Auth Response Error Guard

Every auth function expecting an `access_token` must have an `else` branch showing an error toast when the token is missing — never silently do nothing on an unexpected response:

```typescript
if (response.access_token) {
  // ... existing success logic
} else {
  toast.error(t('errors.unexpectedResponse'))
  return
}
```

The toast message is UI text - the component has `useTranslation('auth')` in scope, and the key lives in the owning `auth` namespace.

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
`getApiErrorMessage(error, t('uploadFailed'))` from `utils/errors.ts` - it wraps
`axios.isAxiosError` and reads `response.data.detail`, returning the fallback when either
is missing. Ninja 422 details arrive as an array of field-error objects; the helper joins
their (server-translated) msg strings into one '; '-separated line and falls back when the
array yields nothing - call sites never hand-roll array handling:

```typescript
onError: (error) => toast.error(getApiErrorMessage(error, t('uploadFailed')))
```

Never hand-roll `(error as { response?: { data?: { detail?: string } } })` casts or
`error: any` at call sites — the helper is the single seam, and it keeps the error
parameter typed as `unknown`.

**Blob responses never have a parsed body.** On `responseType: 'blob'` requests the
error response body arrives as a Blob (axios never parses it as JSON), so
`getApiErrorMessage`'s `response.data.detail` read always finds nothing. Branch on
the HTTP status first (`axios.isAxiosError(error)` + `error.response?.status`, e.g.
404 -> "no longer available", 503 -> "storage unavailable"), then fall through to
the generic helper. Exemplar: `attachmentDownloadErrorMessage` in
`utils/attachments.ts`.

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

**No success toast when the visual change IS the feedback.** A mutation whose effect is immediately visible on screen (an optimistic reorder re-rendering the list) skips the success toast entirely - three rapid clicks must not stack toasts. Errors still get exactly one `toast.error(getApiErrorMessage(...))`; only the success channel is conditionally silent.

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

**"Known/loaded" gates count terminal error as known.** A boolean gate derived from a query and feeding a default-selection or reconcile branch must arm on `isSuccess || isError`, not success alone: with `retry: false`, ONE terminal request failure (backend `--reload` mid-visit, network blip) leaves a success-only gate closed for the whole mount, killing every auto-pick branch behind it while healthy list data renders behind the placeholder (this exact shape stranded budget opening with no period selected, and every naive probe passed because the defect needs a failed request). Exemplar: `BudgetDetailPage`'s `currentPeriodKnown = budget?.cadence === 'custom' || currentPeriodLoaded || currentPeriodError`. Decide a gate's error arm deliberately: a "known" gate counts error as known (no answer is coming - proceed with what is there), while a fallback-deferral gate does not fire its fallback on error (it must not preempt the authoritative answer); when touching a query's error handling, check every gate consumer for which shape it is.

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
- react-query v5 has no query-level `onError` — query failure UX renders inline (`isError || !data` early-return), not via a toast. A manual `useEffect` + `useState` fetch should become a `useQuery` (caching, retries, dedup at zero extra code). The inline early-return is for data-carrying queries; an optional-enhancement query - one that enriches a form but does not gate it - degrades silently instead: render the defaults over `data === undefined`, no error UI, and fail fast without burning the app-wide retry budget (`retry: (failureCount) => failureCount < 1` preserves `retry: 1` for genuinely transient failures). This is the shape for pre-workspace queries against workspace-scoped auth (the currency catalog inside workspace creation 400s while no current workspace exists): an errored query is stale, so the next open refetches and the degrade self-heals once the precondition exists. Exemplar: `CreateWorkspaceForm`'s catalog query.
- **Key a derived query INSIDE the list-family prefix its mutations invalidate.** A derived query over the same rows a list shows (a totals strip, autocomplete suggestions, a fetched edit prefill) is keyed `['transactions', 'totals', ...]`, `['transactions', 'frequent-descriptions', type]`, `['transfers', 'detail', id]` - nested under the family prefix, never a sibling key like `['transaction-totals']`. The family's create/edit/delete mutations often live in other files and invalidate only the family prefix; TanStack prefix matching then refetches the derived query through those existing invalidation calls with zero out-of-scope edits, where a sibling key goes stale after every create/edit. The exception is cardinality-keyed ephemeral queries: a per-keystroke palette search (`['palette-transactions', q]`) mints a new cache entry per committed query string, so family nesting would replay one request per query string ever typed on every invalidation - keep those sibling/isolated. The partition question: does the UI re-read this data (nest under the family) or mint a new key per interaction (isolate)?

- **Await the refetch before clearing a selection that an effect re-derives.** When a null-picker effect re-selects from a list (`setPeriodId(periods[0].id)` whenever the selection is null), a delete mutation must `await` the list's `invalidateQueries` refetch BEFORE clearing the selected id - clearing against a stale cache lets the effect re-select the just-deleted id, and a ghost id whose lookup returns null renders a dead page. Exemplar: `BudgetDetailPage`'s `deletePeriod` awaits the `['periods', budgetId]` refetch before `setPeriodId(null)`; a fire-and-forget invalidation plus an immediate clear reintroduces the race. Invalidation ownership follows mutation ownership: the form modal's own `onSuccess` invalidates its add/edit (`PeriodFormModal`); a page-level delete mutation invalidates in the page.
- **Cross-tab staleness is a different bug class from invalidation.** Each browser tab keeps its own query cache, so a mutation's invalidation never reaches other tabs - and `refetchOnWindowFocus` defaults to stale-only while `api/queryClient.ts` sets a 5-minute `staleTime` app-wide, so focusing the observing tab refetches nothing until that expires; an entry deleted in another tab lingers in this tab's dropdown and selecting it 404s. Fix class: `refetchOnWindowFocus: 'always'` on the cheap list GETs that feed dropdowns - the `useDomain.ts` list hooks (`useAccounts`, `useBudgets`, `useEnabledCurrencies`, `useWorkspaceCategories`) and page-local lists such as `BudgetDetailPage`'s `['periods', budgetId]` query - leaving `staleTime` in force everywhere else for navigation snappiness. Probe by bug class: same-tab invalidation via SPA-link navigation (no reload), cross-tab staleness via two real tabs plus a focus event (`bringToFront()`); never `page.goto()` - a full load re-creates the query cache and masks both.

- **An optimistic reorder goes `onMutate` + `queryClient.setQueryData`, with a narrower invalidation than set-changing writes.** `onMutate` fires synchronously in the click tick, so swapping two rows in the cached array renders the move instantly with no local state and no effect - structurally lint-quiet. Capture the render-scoped previous array for `onError` rollback, and disable the move controls on `isPending` so a second move cannot interleave. Set-preserving mutations own a NARROWER invalidation internally: a reorder invalidates only `['enabled-currencies']`, never `['currency-catalog']` - the set and the catalog are unchanged, only the order moved; set-changing mutations (enable/disable/custom) keep the both-keys pattern. Exemplar: `CurrenciesSettingsSection`'s reorder.

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

**Date-dependent helpers are module-level functions** (`nearestPeriod` and `nextDayIso` in `pages/BudgetDetailPage.tsx`): a component-level `const todayIso = new Date().toISOString().slice(0, 10)` declared below the effect that consumes it is TDZ-poison, and hoisting it above does not help either - adding it to the effect's deps buys nothing across a day rollover. The helper takes the list as its argument and computes "today" itself.

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

The project lints `react-hooks/set-state-in-effect`; the pre-existing warnings are codebase-wide backlog — never add a new one. The baseline is frozen at a fixed warning count (19 at PR #84, 16 since the multi-currency feature) and gated by counting rule-fired warning lines (`grep -cE '^\s+[0-9]+:[0-9]+\s+warning'`), never lines containing the word `warning` - the summary line (`0 errors, 19 warnings`) also matches a substring count and skews the gate by one. The baseline can also DROP: deleting the flagged call (not the whole effect) removes that effect's report - a drop caused by deleting the offending code is the good direction, not a gate failure (18 to 17 to 16 as flagged localStorage-seed calls were removed). When a spec pins a predicted count, re-measure clean HEAD instead of carrying the arithmetic forward - a stale prediction propagates a wrong gate. Build new components lint-quiet by construction: all state in a shared hook (zero `useState` in the component, e.g. `PeriodPicker`) and effects that only mutate the DOM (`scrollTop` math, no setters) - a structurally quiet component adds zero warnings whatever the baseline drifts to. For mount-time behavior (e.g. focusing a just-added row), set transient state inside the **event handler** that caused the mount, act via a plain HTML attribute (`autoFocus={condition}` — fires when the conditionally rendered content mounts), and self-clear in an `onFocus` handler — the self-clear keeps the behavior correct across unmount/remount of conditionally rendered content. Event handlers are not effects: the lint stays quiet. Don't reach for `useEffect` + `setState` or ref callbacks for this class of behavior.

The same warn-baseline discipline covers a second rule: `i18next/no-literal-string` flags JSX text and the placeholder/title/alt/aria-label props so new hardcoded English cannot land silently. Its baseline is a ceiling documented in `frontend/eslint.config.js` that only goes DOWN as literals become t() keys - never add a warning of either rule.

**Grep/lint done-criteria gates - classify the failure before touching code.** Gates that grep the working tree count comment text and exact-cased identifiers only: keep gated literals out of the comments/docblocks of gated files (the phrase "Zero useEffect by construction" tripped a `grep -c 'useEffect' == 0` gate; comment mentions of `scrollIntoView` tripped a banned-call gate - both fixed by rewording the comment, zero code change), and a lowercase grep pattern cannot see a PascalCase setter (`grep 'periodModalNonce'` finds 2 lines, not 3 - `setPeriodModalNonce` hides its capital P; count exact-cased occurrences only). When a lint count disagrees with the spec, prove "pre-existing" mechanically instead of fixing a non-regression: `git show main:<path> | npx eslint --stdin --stdin-filename <path>` lints main's copy without touching the working tree, and findings compare by IDENTIFIER, not line number - earlier tasks' import lines shift rows without adding warnings. The binding invariant is zero NEW warnings against the frozen baseline; a spec's per-file count that disagrees is a spec arithmetic error, and "improving" a pre-existing warning mid-pass is an out-of-scope refactor of working code. Diff-level special-char gates (no added em/en dashes) constrain which LINES you may touch, not just what you write: a line carrying a pre-existing gated character (a U+2014 placeholder in a fallback render) re-emits it in any edit's `+` twin, so ANY edit to that line fails the gate. When a pinned edit collides with one, restructure the change so the line stays byte-identical - name the derived const what the consumers already read (rename the raw picked state instead) so every consumer line goes untouched - never re-type the character and never relax the gate. A formatter can force the collision anyway (ruff format re-indenting a docstring re-emits a pre-existing dash as an added line); repair via byte-anchored whitespace surgery - replace only the leading-whitespace prefix of the line, never retyping the character - and prove preservation from BOTH directions: zero dashed lines added AND zero dashed lines removed, which together show the pre-existing dashes as unchanged context.

When a `setState` in an effect is genuinely unavoidable, the rule reports **once per effect** (at the first violating call) — work within that granularity:

- **State seeded by an effect is declared ABOVE that effect.** `react-hooks/immutability` errors (not warns - "Cannot access variable before it is declared... prevents the earlier access from updating") on an effect referencing a setter declared later in the component body, even though a plain JS/TS closure would legally allow the later declaration. Declaration order is doubly load-bearing here: the seeded `useState` sits above the effect that writes it, while derived consts sit below the memo they read and above whatever consumes them.
- **Per-entity resets extend an already-flagged effect.** Resetting state on id change (stale period leaking across budget→budget navigation in an unkeyed route) goes INTO the existing `[entityId]` effect as more setters — zero new warnings. A new same-shaped effect would add one.
- **Adopting server truth is derivation, not effect-setState.** `const activePendingId = pendingId ?? serverPendingId` — a derived const is lint-quiet where copying the server value into state would add a warning, and the derived value drives the poll that eventually clears it.
- **Loaders stay effect-local.** A hoisted `useCallback` loader called from a mount `useEffect` is traced by the compiler lint across the `await` and produces a NEW warning even when every setter sits after the await — declare the named `async` loader inside the effect. Retry comes from an event-handler-bumped tick in the deps (`const [retryTick, setRetryTick] = useState(0)`; the Try-again button does `setRetryTick(t => t + 1)` — always lint-quiet).
- **Timed or staged progress setState lives ONLY inside the timer callback.** `useEffect(() => { const timer = setInterval(() => setStage((s) => Math.min(s + 1, last)), 1200); return () => clearInterval(timer) }, [isSubmitting, setupStages.length])` adds zero `set-state-in-effect` warnings - the rule flags synchronous setter calls in the effect body, and the timer callback runs on a later tick; a synchronous `setStage` seed in the same body would be flagged. Deps stay in the list-LENGTH member-expression form (see Modal Pattern's open-effect deps rule). Exemplar: `Register`'s setup-progress effect.
- **Event-to-effect signaling uses a one-shot ref flag, never state.** When an event handler must trigger behavior in an effect that runs after the re-commit (focus restore after a failed submit), the handler's `catch` sets `failedSubmitRef.current = true` and an `[isSubmitting]`-deps effect consumes it: `if (!isSubmitting && failedSubmitRef.current) { failedSubmitRef.current = false; submitButtonRef.current?.focus() }`. Ref reads/writes in effects are invisible to `react-hooks/set-state-in-effect`, where a boolean useState flag would add a warning and a pointless re-render. Exemplar: `Register`'s `failedSubmitRef`.
- **React-Compiler lint mechanics around custom-hook tuples and memo deps:** a setter returned through a custom hook's tuple (`useDebouncedField`'s `setQuery`) loses its stable-setter recognition - `exhaustive-deps` then demands it in the consuming effect's deps (safe: it wraps a `useState` setter, stable at runtime), and `set-state-in-effect` stops flagging its calls, relocating that effect's single report to the next traceable setter (net zero against the frozen baseline). And a plain const holding a fresh array (`const rows = data?.items ?? []`) used as a `useMemo` dep trips "dependencies change on every render" - move the derivation inside the memo and depend on the stable `data` reference instead.

## URL Search-Param State Sync

Pages that mirror a selection into a URL param (`/budgets/:id?period=X`) follow a read-once / write-from-handlers contract (`BudgetDetailPage` is the exemplar):

- **Seed read via latest-ref:** `const periodParamRef = useRef(intParam(searchParams, 'period'))` plus a ref-sync effect whose body contains ONLY the ref write - no `setState`, so zero set-state-in-effect cost (render-time `ref.current` writes are illegal under `react-hooks/refs`). This extends the latest-ref rule under Contexts from callbacks to derived values: effects read the seed from the ref instead of the page subscribing to `searchParams` changes. The idiom generalizes to ANY opaque external-store seed, not just URL params: `react-hooks/set-state-in-effect` flags a setState whose ARGUMENT is an opaque external call (a `localStorage` read the compiler cannot analyze) even inside an otherwise-clean effect, while a `ref.current` read passes - so `const storedRef = useRef(readStoredValue(id))` as the initializer, a ref-write-only sync effect, and the consuming effect seeds from `storedRef.current`. The ref-sync effect must be declared BEFORE the consumer (effects run in declaration order, so the reset reads THIS entity's value). Exemplar: `BudgetDetailPage`'s `storedViewRef` per-budget view-currency seed.
- **A render-consumed stored seed is a lazy `useState` initializer, never a ref read.** `react-hooks/refs` errors on READING `ref.current` during render ("Cannot access ref value during render"), not just on writing - the ref seed above is effect-consumed only. A stored value the render itself consumes (a remembered search term) is seeded as `useState(() => urlHasParam ? '' : readStored())`: the lazy initializer runs exactly once, and the change handler clears it so a removed URL param can never re-apply the old term.
- **Effects NEVER write the URL - only event handlers and mutation callbacks do.** Sanctioned write sites: the selection setter invoked from the picker's `onChange`, adjacent/materialize navigation branches, and a delete mutation's `onSuccess` when it removed the selected id. An effect-side router write is both a fresh lint risk and URL churn - an auto-pick running in an effect would rewrite every entry URL.
- **Writes use functional `setSearchParams` with `{ replace: true }`.** The functional form preserves unrelated params (same shape as `createUpdateParams` in `utils/params.ts`); `replace` keeps selections out of history so Back leaves the page in one press.
- **Effect declaration order is load-bearing.** Ref-sync effect BEFORE the `[entityId]` reset effect (the reset seeds from the ref, so the ref must already hold the NEW URL's value on mount and entity-to-entity nav); the reconcile effect also before the reset effect (its seed must land last, beating a cached `currentPeriod` auto-pick mid-race) but AFTER any memo its deps reference - a deps array naming a later-declared const is a TDZ `ReferenceError`.
- **Two effects writing the same state in one flush can coalesce the first write away - guard the LATER write functionally.** With a warm query cache, an auto-pick effect (declared first) can queue `setPeriodId(currentPeriod.id)` and the `[entityId]` reset effect then call `setPeriodId(null)` in the SAME effects flush: the updates coalesce to null, no dependency ever changes, and the pick never re-fires - works on cold mount, dead on warm remount, no error anywhere (the deps array cannot see it: the loser's re-trigger condition is "the value changed", and it reads null to null). Fix the later effect with a functional, membership-guarded write: an explicit `?period=` seed wins outright, a same-entity pick queued in the same flush survives (`prev` still belongs to this entity), foreign ids still clear immediately for entity-to-entity navigation. Feed the updater's membership data through a latest-ref synced by a ref-write-only effect - ref reads INSIDE a setState updater closure are exempt from `react-hooks/exhaustive-deps`, while putting the list in the effect deps would re-run the whole reset effect (and every seed it owns) on each refetch. The guarded write is StrictMode-idempotent, unlike a skip-first-run latch. Exemplar: `BudgetDetailPage`'s `allPeriodsRef` + functional `setPeriodId` reset; the ref-sync effect stays between the memo it mirrors and the reset effect that reads it.
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

**Write payloads declare a dedicated `XInput` interface, never `Partial<Entity>`** (`TransactionInput`, `BudgetInput` in `client.ts`): the interface lists exactly the fields the frontend actually sends, so adding a payload field is a documented decision. `Partial<Budget>` keeps silently accepting `id`/`workspace_id`/`created_at`, and the next payload field becomes an accident of the response type instead of a declared contract.

**Full-replace PUT contracts make EVERY update call site echo the derived fields.** When a backend update becomes full-replace (the whole resource is rewritten from the payload), every caller that updates in place - including best-effort follow-ups like a post-parse description update - must echo the fields the server now requires (`currency_code: p.currency_code`), or account-less rows 400 and a swallowing `catch {}` silently drops the side effect. When the payload contract gains a required-when-X field, grep the sibling `xxxApi.update` call sites across pages and modals - the sites that break are the ones that never looked like update flows (a cancel action, an extraction review). For an OPTIONAL field under a full-replace PUT this inverts the optional-fields rule: every create and update payload sends the key, with `null` as the cleared value (`note: note.trim() || null`) - direct field assignment server-side makes the schema default the stored value, so an omitted key silently wipes stored data; pin the contract in a doc comment on the `XInput` field so the next payload editor sees it. Close the sweep with a two-way grep: the API method's call sites PLUS the raw `api.put('/<endpoint>'...)` path - only the second grep proves no untyped bypass exists. Payload fields echoed from a stored object pass through verbatim (`note: transaction.note`); `trim() || null` normalization belongs only to fields sourced from user input.

**Internal per-request flags go through axios module augmentation, never `as any`:**

```typescript
// api/client.ts
declare module 'axios' {
  interface AxiosRequestConfig { _skipAuthRefresh?: boolean }
}
```

Augmenting `AxiosRequestConfig` also types `error.config` (`InternalAxiosRequestConfig` extends it), so producer and consumer sites stay fully typed with zero casts.

**Idempotency keys on create mutations:** `crypto.randomUUID()` per modal session — stable within one open, fresh across opens. A modal that resets in an open-effect generates the key in the create branch of that effect (`null` in the edit branch); a permanently-mounted modal reset via `close()` → `reset()` uses a lazy `useState(() => crypto.randomUUID())` initializer and regenerates inside `reset()`.

**Backend-mirrored constants:** `PAGE_SIZE_OPTIONS` in `utils/pageSize.ts` duplicates the backend's `ALLOWED_PAGE_SIZES` — the user's choice is persisted to localStorage and sent as `page_size` on every list request, so the two lists must change together (the 422 trap is documented under Pagination Param Caps in the `django-backend` skill). Put an inline sync comment at the constant itself in the one-line `/** Synced with backend <file> <CONSTANT>. */` format (see `TotalsLabel`) — the coupling knowledge belongs where the next editor actually looks, not only in this skill. Mirrored reference DATA pulls from the backend's data module, never its seed command - `PRE_AUTH_CURRENCIES` in `utils/currencies.ts` mirrors `currencies/data.py`'s ISO 4217 rows byte-for-byte under a source-naming sync comment. Ordering type unions in `client.ts` are the same mirror for the backend's `ORDERING_PATTERN` allowlists - they widen in lockstep with the backend change that widens the pattern. The same discipline applies to format strings: `formatPeriodName` (`utils/format.ts`) mirrors the backend's period-naming format (dd MMM + en dash) and is persisted as period names, while the adjacent display-only `formatPeriodRange` ("Apr 1 - Apr 30", regular hyphen) is deliberately different - harmonizing the look-alikes would corrupt the mirror, and the separator difference is invisible in review surfaces. The docblock adjacency warning between them is the guard; do not remove it.

## Blob Downloads and Object-URL Ownership

Files behind authenticated endpoints are fetched as blobs through the axios
client (`responseType: 'blob'`, e.g. `transactionsApi.downloadAttachment`) -
browsers cannot send the JWT header on navigations, so `<img src>`/`<a href>`
pointing at the API never works; `URL.createObjectURL` bridges blob -> URL. The
load-bearing contract is that exactly one site creates a URL per lifecycle, and
`URL.revokeObjectURL` ownership is explicit at each call site (exemplar:
`hooks/useAttachments.ts` + `utils/attachments.ts`):

- **The query cache mints and pins display URLs.** The blob query's `queryFn`
  returns `URL.createObjectURL(blob)` with BOTH `staleTime: Infinity` AND
  `gcTime: Infinity` - the bytes are immutable, and the default 5-min gc drops
  the cache entry, leaks its object URL, and mints a duplicate URL for the same
  bytes on remount.
- **A download-to-disk mutation creates and revokes its own short-lived URL**
  around the programmatic anchor click (`useAttachmentDownload`).
- **A reuse path NEVER revokes a cached URL.** The lightbox reuses the URL
  passed in from the tile's cached data - revoking it after close would poison
  the thumbnail that still references it. Shared download helpers stay
  deliberately revoke-free (`triggerBrowserDownload`); never "simplify" the two
  paths into one helper that always revokes.
- **Per-item blob queries live in a child component** (`AttachmentMedia`) -
  hooks cannot be called inside a list `.map()` callback; the parent's map keeps
  the stateless chrome (border, delete button, extraction overlay).
- **Delete mutations drop the deleted item's blob cache entry**
  (`queryClient.removeQueries({ queryKey: attachmentBlobKey(...) })`); the
  object URL itself is reclaimed at document unload, bounded by the
  per-transaction attachment caps. A new blob consumer reuses the same client
  call and key builders instead of minting a second query family for the same
  bytes.

## Money Arithmetic (Exact Strings)

Backend Decimal amounts cross the API as strings; any arithmetic whose result is **persisted or sent back** must be exact string/BigInt math via the helpers in `utils/format.ts` (`subtractAmounts` — BigInt cents, 3rd-digit round-half-up, never returns `'-0.00'`). Never `parseFloat` a backend Decimal that will be persisted: a 17-digit Decimal through `parseFloat` loses the last cent, and the wrong delta gets recorded as a real adjustment transaction. Floats are for validation/display only.

Number-input values are arbitrary strings — `'1e5'`, `''`, `'.5'`, `'5.'` — so validate with a regex (`/^-?(\d+(\.\d*)?|\.\d+)$/`, which also rejects e-notation) before the BigInt math. BigInt itself accepts leading zeros; only the regex gate keeps scientific notation out.

## UI Text and i18n

Every user-visible string goes through `t()` from `useTranslation('<namespace>')`. The UI ships in English, Ukrainian, and Polish; a new UI string is THREE files' worth of work: the `t()` call plus the key in the owning namespace's `en`, `uk`, and `pl` JSONs under `src/i18n/locales/` - `npm run i18n:check` fails a key that exists in one language and not the others. Namespaces map to owning surfaces (auth, nav, accounts, transfers, budgets, transactions, planned, dashboard, members, settings, common, numbers - the table lives in `docs/i18n.md`); a component adds keys only to its own namespace.

- **`aria-label`, `placeholder`, `title`, and `alt` are UI text.** They go through `t()` like JSX text. The ESLint `i18next/no-literal-string` rule (warn) flags new literals in those positions and in JSX children - see the baseline note in §State Changes in Event Handlers, Not Effects.
- **Module-level label arrays hold keys, not text.** The nav-item arrays (`Sidebar`, `BottomNav`) store key strings (`as const`, so `labelKey` stays a literal union) and resolve them in the component body via `t(item.labelKey)` - the same trap shape as any module-level constant: English text at module scope has no hook in scope and silently ships untranslated.
- **Plurals use i18next `count`:** `t('multiSelect.selectedCount', { count: n })` (exemplar: `MultiSelect`) with `selectedCount_one`/`selectedCount_other` in English and the full `_one`/`_few`/`_many`/`_other` set in Ukrainian and Polish - both Slavic languages need all four forms, and `i18n:check` validates the category set per language via `Intl.PluralRules`. Interpolation is `{{name}}`; never concatenate translated fragments with `+`.
- **`formatPeriodName` never localizes** - it mirrors the backend's period-naming format and its output is persisted as period names (the full warning and the do-not-unify rule against `formatPeriodRange` are in Backend-mirrored constants under API Client Pattern). Do not route it through `t()`; do not "fix" its en dash.
- **Backend errors arrive already translated** - the API client sends `Accept-Language` (`setApiLanguage`), so `getApiErrorMessage(error, ...)` receives a localized `detail`. The FALLBACK argument is frontend UI text and goes through `t()` like any other string.

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
- **Comments**: plain-language rationale only - never planning artifacts ("(R1)", "patterns.md SS3", task ids, "(plan decision N)", "(SKILL §section)"). Review-round and spec references are meaningless outside the session that wrote them, and the citation forms rot mechanically: "(plan decision N)" points into `.plans/`, which is pruned post-merge, and "(SKILL §...)" section numbering reshapes on every skill promotion - both targets disappear while the code stays. A comment must state the WHY so a reader with no access to the plan can act on it.

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
