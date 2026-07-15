# Denarly Mobile UX — Interaction Spec

The mobile web experience doubles as the interaction spec for any future mobile client
(PWA wrapper, Capacitor, or native). A native implementation reimplements the *components*
but inherits these *decisions*. Web implementation details live in `design/responsive.md`,
`design/components.md` §19/§21, and `design/patterns.md` §13.

## Principles

1. **Web and mobile may diverge in interaction, never in capability or data rules.** Every
   workflow reachable on desktop is reachable on mobile; only the presentation differs.
2. **The bottom sheet is the universal container.** Dialogs, option pickers, action menus,
   date picker, overflow navigation — one surface, one dismissal model (scrim tap / swipe
   down in native), one motion spec (in 120ms ease-out, out 80ms ease-in).
3. **Nothing hides behind hover.** Touch rows open an action sheet on tap; destructive
   actions are styled destructive and confirm before executing.
4. **44px touch minimum**, 16px minimum font in text inputs, numeric keypad
   (`inputMode="decimal"`) for amounts.
5. **Density is kept.** 32px table rows and the 11–16px scale survive on mobile; wide tables
   scroll horizontally with a sticky identity column — no table→card explosions except where
   a card list is the better native idiom (Members, Budget detail).

## Navigation

- **Bottom tab bar, 5 slots**: Home · Transactions · **[+]** · Budgets · More. Labels always
  visible, active tab in the primary color, safe-area padded.
- **More** opens a sheet: Accounts, Planned, Members, Settings, then workspace switching
  (with role badges), workspace settings, dark mode, logout.
- **The center FAB is the global create action**: New transaction · Transfer · From receipt
  (only when extraction is configured) · Planned. Available from every screen; screens hide
  their own creation buttons when the FAB covers them. Viewers (read-only role) get no FAB.
- Each tab remembers its scroll position (native stack behavior).

## Per-screen patterns

| Screen | Mobile pattern |
|---|---|
| Transactions | List rows (description / meta line / amount right-aligned); row tap → action sheet (Edit, Delete); filters full-width, values visible in place |
| Accounts | Full-width balance cards; card tap → action sheet (Set balance, Edit, Archive, Delete-when-archived); transfers listed with cross-currency amounts on two lines |
| Budget detail | Category cards (name centered in the header; Planned/Actual/Remaining beneath, planned tap → numeric editor); one currency at a time with a prev/next currency switcher above the cards; desktop keeps the ledger table with a sticky category column; period switcher = arrows + sheet picker |
| Planned | Rows; pending-row tap → action sheet (Execute now, Edit, Delete) |
| Members | Card list (avatar, name, role/status badges); card tap → action sheet (Edit role, Reset password, Remove) |
| Settings/Profile | Wrapping tab pills; section forms in sheets |

## Platform mechanics (what a native client must reproduce)

- Safe-area insets respected on the tab bar (bottom) and content (top, standalone).
- Keyboard never covers the focused input or the submit action of an open sheet.
- Sheet overscroll doesn't scroll the page behind; background never scrolls under an
  open sheet.
- Escape/back dismisses only the topmost overlay; focus returns to the trigger.
- Reduced-motion preference disables sheet/nav animation.
- App identity: "Denarly", the D-mark icon (maskable variant for platform-shaped icons),
  standalone display, status bar matching the page background in both themes.

## Deferred (known gaps, not regressions)

- Sheet drag-to-dismiss gesture (handle is currently visual only on web).
- Swipe actions on rows (action sheet is the v1 pattern).
- Offline/service worker — the PWA shell is install-only.
- Tab scroll restoration restores before data loads, so on a slow fetch the browser clamps
  to the skeleton height and deep positions in long lists are lost.
