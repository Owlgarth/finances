# Owlgarth Finances Mobile UX - Interaction Spec

The mobile web experience doubles as the interaction spec for any future mobile client
(PWA wrapper, Capacitor, or native). A native implementation reimplements the *components*
but inherits these *decisions*. Web implementation details live in `design/responsive.md`,
`design/components.md` §19/§21, and `design/patterns.md` §13.

## Principles

1. **Web and mobile may diverge in interaction, never in capability or data rules.** Every
   workflow reachable on desktop is reachable on mobile; only the presentation differs.
2. **The bottom sheet is the universal container.** Dialogs, option pickers, action menus,
   date picker, overflow navigation - one surface, one dismissal model (scrim tap / swipe
   down in native), one motion spec (in 120ms ease-out, out 80ms ease-in).
3. **Nothing hides behind hover.** Touch rows open an action sheet on tap; destructive
   actions are styled destructive and confirm before executing.
4. **44px touch minimum**, 16px minimum font in text inputs, numeric keypad
   (`inputMode="decimal"`) for amounts.
5. **Density is kept.** 32px table rows and the 11–16px scale survive on mobile; wide tables
   scroll horizontally with a sticky identity column - no table→card explosions except where
   a card list is the better native idiom (Members, Budget detail).

## Navigation

- **Bottom tab bar, 5 slots**: Home · Transactions · **[+]** · Budgets · More. Labels always
  visible, active tab in the primary color, safe-area padded.
- **More** opens a sheet: Search (global page search), Accounts, Planned, Members, Settings,
  logout, then workspace switching
  (with role badges), a create-workspace row (closes the sheet and opens the
  create-workspace modal - a bottom sheet with the ordered currency multi-select - as the
  only overlay layer), workspace settings, dark mode, disable-zoom toggle (opt-in,
  per-device: kills double-tap/pinch zoom for a native feel), close. The bottom-most row
  (logout's old slot, directly above the just-tapped More button, which collected
  accidental logouts) holds a Close button on its left side only - the rest of the row
  is deliberately inert so a stray tap there does nothing.
- **The center FAB is the global create action**: New transaction · Transfer · From receipt
  (only when extraction is configured) · Planned. Available from every screen; screens hide
  their own creation buttons when the FAB covers them. Viewers (read-only role) get no FAB.
- Each tab remembers its scroll position (native stack behavior).
- **Global page search**: jump to any page or budget by name - ⌘K/Ctrl+K and a Search entry
  in the desktop sidebar; the Search row in the More sheet on mobile (sheet presentation).

## Per-screen patterns

| Screen | Mobile pattern |
|---|---|
| Transactions | List rows (description / meta line / amount right-aligned); row tap → action sheet (Edit, Delete); always-visible debounced search + Filters disclosure (multi-select account/type/budget/category/currency - the transaction's stored own currency, hidden in single-currency workspaces - amount range, date range) with an active-count badge; filter state lives in the URL |
| Accounts | Full-width balance cards; card tap → action sheet (Set balance, Edit, Archive, Delete-when-archived); transfers listed with cross-currency amounts on two lines |
| Budget detail | Category cards (name centered in the header; Planned/Actual/Remaining beneath, planned tap → numeric editor; card/row tap toggles a visual highlight); one currency at a time, selected through a per-currency totals strip above the cards (one chip per currency with that currency's own planned total + spend meter, horizontally scrollable; last-viewed currency remembered per budget); single-currency budgets show a plain code chip; desktop keeps the ledger table with a sticky category column; period switcher = arrows + sheet picker (capped window centered on the viewed period; "View all periods" as the sheet's last row), plus admin-only add/edit/delete period icon buttons beside it on custom-cadence budgets (44px touch targets) |
| Budget periods | Year-sectioned period cards, newest first (CURRENT chip on the active period, past periods muted); card tap opens the budget detail on that period (`?period=`); admin-only edit/delete icons on custom periods and an Add period button on custom-cadence budgets (44px touch targets) |
| Planned | Rows; row tap → action sheet (Execute now - pending rows only, Edit, Delete); status segmented control + same search/Filters pattern as Transactions (multi-select account/budget/category/currency - the planned transaction's stored own currency, hidden in single-currency workspaces - amount range, planned-date range), URL-synced |
| Members | Card list (avatar, name, role/status badges); card tap → action sheet (Edit role, Reset password, Remove) |
| Settings/Profile | Wrapping tab pills; section forms in sheets |

## Platform mechanics (what a native client must reproduce)

- Safe-area insets respected on the tab bar (bottom) and content (top, standalone).
- Keyboard never covers the focused input or the submit action of an open sheet.
- Sheet overscroll doesn't scroll the page behind; background never scrolls under an
  open sheet.
- Escape/back dismisses only the topmost overlay; focus returns to the trigger.
- Reduced-motion preference disables sheet/nav animation.
- App identity: "Owlgarth Finances", the O-mark icon (maskable variant for platform-shaped icons),
  standalone display, status bar matching the page background in both themes.

## Deferred (known gaps, not regressions)

- Sheet drag-to-dismiss gesture (handle is currently visual only on web).
- Swipe actions on rows (action sheet is the v1 pattern).
- Offline/service worker - the PWA shell is install-only.
- Tab scroll restoration restores before data loads, so on a slow fetch the browser clamps
  to the skeleton height and deep positions in long lists are lost.
