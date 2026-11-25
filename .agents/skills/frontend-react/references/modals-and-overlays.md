# Modals, Popovers and Overlays

Part of the `frontend-react` skill. Read before adding or changing a modal, bottom sheet, popover, Escape handling, or focus return.

## Modal Pattern

Use `common/Modal.tsx` - it renders a centered panel on desktop and delegates to
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

**Titles go through the `title` prop - never a hand-rolled `<h2>`.** The prop is `string`,
not `ReactNode`: dynamic titles are template literals or string ternaries
(`title={`Set balance - ${account.name}`}`), never JSX. `Modal` renders one header flex row -
title left, labeled Close button (X icon + "Close" text) right - and the Close button carries
`shrink-0` so it can never overlap the title; a standalone `<h2>` in the panel flow
paired with a floating absolute X is the legacy overlap / accidental-closure bug - do not
reintroduce it, and never absolutely position a close button over panel content. The same
header row renders on both viewports: desktop at the top of the centered panel, and on mobile
inside the sheet body just below the drag handle (`BottomSheet` itself renders no close
button - its handle bar is a visual affordance; closing is scrim tap or Escape) - callers just
pass `title`. Modal title typography lives solely in `Modal`'s header render; don't add
per-caller title styling or title-to-content spacing (the header owns the bottom margin).

Non-modal sheets (pickers, action menus) use `BottomSheet` / `ActionSheet` directly
(`design/components.md` §21).

When a component manages multiple modals, use separate boolean state for each. Modals can chain by closing one and opening another (`onEdit={() => { setShowDetail(false); setShowEdit(true) }}`). `ActionSheet` actions close the sheet before running, so they chain safely.

**A settings bridge from an open form keeps both overlays mounted.** When the second overlay exists so the user can manage reference data mid-form (a "Manage currencies" link inside a form modal), chain-closing would destroy the typed values - the wrong move. Keep the form modal mounted, open the panel as a second overlay, and render the panel instance AFTER every other modal in the page JSX: both sit at the shared `z-modal` level so DOM order decides stacking, and `useOverlay`'s mount-order stack closes the later-mounted panel first on Escape. Gate the bridge callback at the page level (`canManageCurrencies ? openSettings : undefined`) so unauthorized roles never see a dead-end link; the prop itself stays optional so ungated call sites render no link. Exemplar: the `WorkspaceSettingsPanel` bridge in `AccountsPage`/`BudgetsPage`.

**Modal state lifecycle - two sanctioned shapes:**

- **Permanently mounted (rendered unconditionally, no `key`):** seed **all** form state in a session render-adjust - never an open-effect (`set-state-in-effect` is an error; see §State Changes in Event Handlers). A sentinel-initialized session snapshot (`{ open: false, mode: 'none', source: null }` can never match a real session, so the first open always seeds), then a two-if fall-through below the last hook (`AccountFormModal`, `TransferModal`, `TransactionFormModal`):

  ```tsx
  const seeding = open !== session.open || session.mode !== mode || session.source !== source
  if (seeding) setSession({ open, mode, source })
  if (seeding && open) {
    setName(account?.name ?? '')
    // …every field, every open
  }
  ```

  The mode discriminator (edit/repeat/create; footer Copy moves the SAME entity object from `transaction` to `copyFrom` without closing) catches mid-open source swaps that identity comparison alone would miss. NO `return null` inside the adjust: React discards the pass and re-runs the component before children render anyway, and the fall-through form keeps every hook below the adjust unconditional (the queries/mutations sitting at the old effect's slot stay in place) and keeps the seed body byte-stable as diff context. `useState(account?.x)` initializers are dead weight here - they run exactly once, before the entity prop exists, so Edit opens blank and silently submits defaults, and the stale values leak into a later New session. When a full reset plus a fresh-per-open default is all you need, prefer ONE `handleClose` wrapper on `onClose` (`BudgetsPage`'s `CreateBudgetModal`): `Modal` funnels every dismissal path (Cancel/Close/scrim/Escape) through `onClose`, and an event handler needs no render-adjust machinery at all. Exemplars of the two-if fall-through: `AccountFormModal` directly, and the form hooks `hooks/useTransactionForm.ts`/`hooks/useTransferForm.ts` behind their modals.

- **Mount-per-use:** a modal that seeds state from props in `useState` initializers drops the `open` prop entirely - the caller's conditional render (`{row && <Modal …/>}`) IS the open/close mechanism. Document the contract in the docblock (`ExtractionReviewModal`, `PeriodFormModal` - its caller's mode/id/`nonce` render `key` forces a fresh remount every open, including add-after-add). From a list page, page state is `{entity} + nonce` with a key of mode + entity id + nonce (`BudgetsPage`'s add-period modal: `add-${budget.id}-${nonce}`) - the nonce is load-bearing because entity id alone reuses the mounted instance when a close-then-open batches into one tick (the null gap never renders). A plain FORM component owns its Modal the same way: it renders `<Modal open onClose={onClose}>` with the open prop hardcoded (`CreateWorkspaceForm`), so every call site collapses to one conditional element and title/size/padding live in exactly one place. Each opening container (dropdown, sheet) closes itself BEFORE the modal mounts, so Escape always faces exactly one layer - the layering question dissolves by construction instead of by `stopPropagation` discipline. Form-level Escape handlers are deleted, not ported, when a form moves into a Modal: the overlay stack owns Escape, and a surviving form-level branch fights the topmost-layer-only close.

**A modal whose target is a LIVE-DERIVED match latches the whole session (mode + row) in the opener state at click time - render-site props branch on the latched state, never on the live derivation.** The mount-per-use shape above assumes the opened entity is fixed by the click that opened it (a row button); a create-or-edit affordance whose edit target is a client-side match over a query list is different - `BudgetDetailPage`'s bookmark button derives the matching non-archived budget bookmark from `useBookmarks()`, and a form modal that recomputes its discriminator from props on every render (`BookmarkFormModal`'s `isEdit = !!bookmark`) would let a mid-open `refetchOnWindowFocus: 'always'` refetch (the hook pins it) flip a mounted form between create and edit submit paths mid-session. The latched opener state (`{ mode: 'create' } | { mode: 'edit'; bookmark } | null`, set in the single opener button's onClick) freezes the session; the null state always renders between sessions, so close-then-reopen is a remount and no key/nonce is needed.

**A modal whose caller clears its source prop in the same tick as close renders exit-window content from a local source copy.** `BottomSheet`'s `useDelayedUnmount(open, 80)` keeps the sheet mounted through the 80ms exit animation, and a page that clears its source row state in the same tick as the close leaves the modal's source prop null while the sheet is still animating out - a modal reading the prop directly blanks its context line for that window. Seed a local `source` state copy alongside the other seeded fields in the session render-adjust and render context lines from the copy, never from the prop. Exemplar: the session render-adjust's latched `source` copy in `AccountFormModal` - the sanctioned modal shape keeps the source alive through close; a sheet-hosted body reads context from that copy during the exit window, never from the prop.

**Escape inside a Modal:** a popup that lives inside a Modal (e.g. `DatePicker`'s desktop panel) consumes Escape at its focusable element - `preventDefault()` + `stopPropagation()` + close - gated on the popup being open, so a closed popup still lets Escape bubble to the surrounding Modal. A transient overlay with no focused element to consume Escape at (a hover/pinned hint) cannot use that shape: a document-level keydown in the CAPTURE phase + `stopPropagation()` fires before `useOverlay`'s bubble-phase listener, so the first Escape closes only the hint and the next closes the modal. Exemplar: `common/InfoHint.tsx` (component spec in `design/components.md` §4).

**An in-flow panel (not an overlay) skips every overlay mechanism and yields Escape to the overlay stack.** No scrim, focus trap, scroll lock, `useOverlay`, `role="dialog"`, or z-index of any kind - the panel is page flow, and the caller's conditional render IS the open/close mechanism (mount IS open). Its document-level keydown runs in the BUBBLE phase with `[]` deps, gated on `!hasActiveOverlay()`, reading `onClose` through a latest-callback ref so the listener never re-registers. Bubble phase is load-bearing: DatePicker's desktop popup consumes Escape at its input with `stopPropagation`, which halts propagation at the React root BEFORE a document bubble listener - a capture-phase listener would fire first and close both the popup and the panel. The pinned footer sits OUTSIDE the scroll area as `shrink-0`. An inline editor hosted in such a panel consumes its OWN Escape: the editor `preventDefault()`s the handled key at its focusable element (EditableField's base keydown arm and every override - a documented editor-bag contract), and the panel's document-level listener yields on `e.defaultPrevented` before closing. That preventDefault/defaultPrevented pair - not `stopPropagation` - is the in-repo convention for consumed Escape (the add-row hotkey and note-override sites use the same yield): React 19's synthetic `stopPropagation` DOES delegate to `nativeEvent.stopPropagation()` for bubble-phase document listeners (correcting an older planning note that claimed otherwise), but it halts propagation for every other consumer, while `defaultPrevented` leaves the native event untouched. Exemplars: `common/EditableField.tsx` + `layout/DetailPanel.tsx`.

**A standalone popover (no Modal, no overlay stack) owns its Escape and focus-return machinery through ONE document bubble listener, attached while open.** While open, a single `document.addEventListener('keydown', ...)` consumes Escape with `preventDefault()` + `stopPropagation()` so nothing beneath the row reacts to the press; teardown removes it. `stopPropagation` is load-bearing against overlay consumers that never check `defaultPrevented`: `useOverlay`'s sheet-close listener is a document-level bubble-phase keydown with no `defaultPrevented` read, so an EDITOR hosted inside such a sheet steps one level per press only by consuming Escape at its own container element (a React `onKeyDown` doing `preventDefault()` + `stopPropagation()` - preventDefault alone would still close the whole sheet). The element-level form works because focus sits inside the container by construction (the back button `autoFocus`es on mount), putting the container in the event path - the same idiom as a popup consuming Escape inside a Modal. Focus return on close keys on `document.activeElement === document.body`: that predicate alone distinguishes Escape-close (focus fell out of the removed panel to `<body>` and needs a home) from swap-close (focus already moved to the newly clicked trigger) without the component knowing anything about the host's popover state. The return focus itself is deferred (`setTimeout 0`): a focus call issued inside a mousedown listener is clobbered by the browser's default mousedown focus action, so it must land one macrotask later. The outside-click path discriminates with `target.closest('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')` so a dismissal never steals focus from a focusable click target; dismissal listeners read the close path through a latest-ref (`closeRef` synced in an effect, the merged-setter idiom under Controlled-Open Props) so a popover swap can never run a stale trigger's refocus path; and an action row that chains into a modal calls close-without-focus-return (`closePopover(false)`) so the modal mounting next owns focus unraced. Exemplars: `components/filters/FilterChipsBar.tsx` (document listener, `deferFocus`, `closeRef`) and the editor level of `components/filters/FilterSheet.tsx` (element-level consume inside the sheet).

**A scrollable selection list inside a Modal scrolls the inner list, never the panel.** Put `overflow-y-auto` on the list element with `flex-1 min-h-0` + `overscroll-contain`, not in the panel `className` - a panel-level scroll unpins the header title on desktop and double-scrolls inside the mobile BottomSheet (whose base `max-h-[92dvh]` out-cascades a caller `max-h-[85vh]` in compiled-sheet order). Exemplar: the language list in `LanguageModal`.

**Reference-data arrival gets a separate length-keyed render-adjust.** Late-arriving accounts/currencies fill a pristine create form but never clobber typed edits: key the adjust on list LENGTHS (`accounts.length`), never array identity - a `refetchOnWindowFocus: 'always'` refetch returns an equal-length list and re-seeds nothing - and guard each seeded field with a still-at-seed check so a mid-edit refetch leaves typed values alone. Exemplar: the arrival adjust beside the session adjust in `TransferModal`.

**Migrating a hand-rolled fixed overlay to `Modal`:** pass `title` (string prop) + `className="p-6"`, and delete the manual `useOverlay` plus the hand-rolled header/`aria-labelledby`/close-X machinery - `Modal` wires stack-aware Escape/scroll-lock/focus on desktop and delegates to `BottomSheet` on mobile, preserving the behavior by construction.

**Sanctioned exception - full-bleed media lightboxes.** A viewer whose content IS the viewport (the attachment image lightbox) does not fit `Modal`'s centered panel and title header, so hand-rolling it is allowed - but it still goes through `useOverlay(active, onClose)` for stack-aware Escape, refcounted scroll lock, and focus capture/restore, and its panel carries `ref` + `role="dialog"` + `aria-modal` + `tabIndex={-1}` exactly like `Modal`'s panel. An unregistered overlay lets Escape close the modal underneath it (the bug class `useOverlay` exists to prevent). Exemplar: the lightbox in `transactions/TransactionAttachments.tsx`.

## Controlled-Open Props on Popup Components

Making a component with internal open state controllable (DatePicker's additive `open?`/`onOpenChange?` pair) must stay invisible to uncontrolled callers:

```tsx
const isOpen = open !== undefined ? open : internalOpen
const setOpen = (next: boolean) => {
  if (open === undefined) setInternalOpen(next)
  onOpenChange?.(next)
}
```

- The inline ternary is load-bearing: an `isControlled` boolean const cannot narrow TypeScript at the use site.
- A document-level listener consuming the merged setter (the outside-mousedown close) reads it through a latest-ref (`const setOpenRef = useRef(setOpen); useEffect(() => { setOpenRef.current = setOpen })`, no deps array - the latest-ref idiom under Contexts): a per-render function in a `[]`-deps effect both breaks the compiler lint's stability proof (a plain function is not an exempt `useState` setter, so the empty deps stop being provably safe) and captures the mount-time closure - a controlled caller passing a fresh `onOpenChange` arrow per render would get a stale close path from the mount-time listener.
- Rename EVERY internal setter call site to the merged `setOpen` (a `setIsOpen` == 0 grep gate catches stragglers) - including dismissal funnels like the mobile sheet's `onClose`, or a sheet-dismiss stops reporting through `onOpenChange`.

Exemplar: DatePicker's controlled-open pair (consumer: DateQuickPick's hidden-trigger embed).
