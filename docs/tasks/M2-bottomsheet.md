# M2 — BottomSheet primitive + Modal unification

Size **M** · Deps: M1 · Plan: `IMPLEMENTATION_PLAN.md` · Design: `design/responsive.md`
(Modal Behavior on Mobile), `design/patterns.md` §1 (motion), `design/components.md` §11 (modals)

## Objective
One `BottomSheet` primitive that becomes the universal mobile container (plan decision 3).
`Modal` delegates to it on mobile so all 11 existing modal consumers (incl. `ConfirmDialog`)
become animated sheets with **zero call-site changes**. An `ActionSheet` convenience on top
provides the titled 44px action-row list M7/S-track will use for touch row actions.

## Read first
- `.agents/skills/frontend-react/SKILL.md` (modal pattern, variant props)
- `frontend/src/components/common/Modal.tsx` (current scrim/panel split and why)
- `design/patterns.md` §1 — durations: sheet in 120ms `cubic-bezier(0.32,0.72,0,1)`,
  out 80ms `cubic-bezier(0.4,0,0.2,1)`

## Create

### `frontend/src/hooks/useOverlay.ts`
Shared overlay behavior for Modal (desktop) and BottomSheet:
- **Escape-to-close, stack-aware**: a module-level overlay stack; only the topmost active
  overlay responds to Escape. (Without this, Escape on a `ConfirmDialog` layered over a form
  modal would close both and lose form input.)
- **Body scroll lock, refcounted**: `overflow: hidden` on `<body>` while ≥1 overlay is active;
  restores the prior inline value when the count reaches 0.
- **Focus management**: focuses the panel on open (`tabIndex={-1}`, no visible outline),
  restores focus to the previously focused element on close.
- Returns the panel ref. Signature: `useOverlay(active: boolean, onClose: () => void)`.

### `frontend/src/components/common/BottomSheet.tsx`
Props: `{ open, onClose, children, className?, 'aria-label'? }` — deliberately mirrors `Modal`.
- Scrim: `z-modal-backdrop bg-scrim backdrop-blur-sm`, fades with the panel; tap dismisses
  (same wrapper-owns-dismiss structure as `Modal`, documented there).
- Panel: `fixed` bottom, full width, `bg-surface border border-border rounded-t-sm`,
  `max-h-[92dvh]` with internal scroll, `pb-safe` (M1), centered drag-handle bar
  (visual affordance only — the drag-to-dismiss *gesture* is deferred to N2).
- Motion per patterns.md §1: slide-up 120ms on open, slide-down 80ms on exit. Exit requires
  delayed unmount (internal `mounted` state outliving `open` by the exit duration).
  `prefers-reduced-motion` disables both.
- `role="dialog" aria-modal="true"`; behavior via `useOverlay`.

### `frontend/src/components/common/ActionSheet.tsx`
`{ open, onClose, title?, actions: ActionSheetAction[] }` where an action is
`{ label, icon? (Lucide), onSelect, destructive?, disabled? }`.
- Rows: full-width, `min-h-[44px]`, 16px Lucide icons (mobile-nav scale, not the 14px desktop
  default), `text-negative` when destructive, `active:bg-surface-hover` press feedback.
- Selecting closes the sheet first, then runs `onSelect` (safe for chaining into a modal).
- Trailing full-width Cancel row.

## Modify
- **`Modal.tsx`** — `useBreakpoint()`; on mobile return `<BottomSheet>` wrapping the same
  X button + children; on desktop keep current markup exactly (drop the now-dead `max-sm:`
  classes) plus `useOverlay` wiring (Escape was already documented as planned there) and
  `role="dialog"`. Hooks called unconditionally before the branch; variant switch mid-open
  (resize across 640px) must not crash or lose children state.
- **`index.css`** — sheet/scrim keyframes + animation classes (durations/easings from
  patterns.md §1, commented), with a `prefers-reduced-motion` opt-out.

## Out of scope
`WorkspaceSettingsPanel` (slide-over) and the `TransactionAttachments` lightbox — separate
overlay species, handled in their screen passes. Drag-to-dismiss gesture (N2). Swapping any
call site to `ActionSheet` (M7/S-track).

## Done
- Mobile viewport: every existing modal (transaction form, confirm delete, transfer, receipt,
  legacy import…) opens as a bottom sheet with slide-up motion, drag handle, safe-area padding.
- Scrolling the page behind any open modal/sheet is impossible; closing restores scroll.
- Escape closes only the topmost overlay; focus returns to the trigger.
- Desktop modals visually identical to before.
- `npm run lint` + `npm run build` clean.
