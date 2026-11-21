# Owlgarth Finances Mobile UX - Interaction Spec

The mobile web experience doubles as the interaction spec for any future mobile client
(PWA wrapper, Capacitor, or native). A native implementation reimplements the *components*
but inherits these *decisions*. Web implementation details live in `design/responsive.md`,
`design/components.md` §19/§21/§22, and `design/patterns.md` §13.

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

- **Bottom tab bar, 5 slots**: Home · Activity · **[+]** · Accounts · Budgets. Labels always
  visible, active tab in the primary color, safe-area padded. The Activity tab covers all
  three activity routes (`/transactions`, `/planned`, `/transfers`): it lights by pathname
  prefix, not per-route matching.
- **Account menu** (sheet, opened from the page-header profile button on every page; no
  More tab exists): Search (global page search), Accounts, Planned, Members, Settings,
  logout, then a bookmarks section (the user's active bookmarks, capped
  by their preference, with a Manage link to `/bookmarks` - shown only
  when they have any), then workspace switching
  (with role badges), a create-workspace row (closes the sheet and opens the
  create-workspace modal - a bottom sheet with the ordered currency multi-select - as the
  only overlay layer), workspace settings, then a user section (labeled with the user's
  full name or email): reload, dark mode, language (closes the sheet
  and opens the language picker - one card per registry language, showing the
  active one's native name on the row; a tap applies the switch immediately),
  disable-zoom toggle (opt-in,
  per-device: kills double-tap/pinch zoom for a native feel), close. Logout lives mid-sheet
  (below Settings, away from the thumb). The bottom-most row (logout's old slot, kept as a
  misclick guard) holds a Close button on its left side only - the rest of the row
  is deliberately inert so a stray tap there does nothing.
- **The three activity routes share one scope chrome**: `/transactions`, `/planned` and
  `/transfers` all head the page with the same "Activity" title, a breadcrumb naming the
  current scope (the month label when the URL date range is an exact calendar month, the
  sole filtered account's name when exactly one account is filtered, joined " / "), and a
  three-segment tab row (Transactions / Planned / Transfers). A tab switch carries the date
  range always, and the account filter between the pages: as a comma list between the two
  list pages, as a single id to Transfers only when exactly one account is selected. Every
  other filter param stays behind - a tab switch is a scope change, not a filter copy.
- **The center FAB opens the full-page create flow** (`/new`): one form for a new
  transaction or transfer, Transfer as a third type segment beside Expense and Income.
  The FAB pushes (Back returns to the list the user left) and carries the scope -
  `type=transfer` from `/transfers`, and the account filter when it holds exactly one id.
  Hidden on `/new` itself (the page already is the create form; the slot stays so the tabs
  don't shift) and for viewers (read-only role) and workspace-less users. Planned and
  recurring-rule creation is not part of `/new`: the Planned page's own create buttons are
  visible on phones.
- Each tab remembers its scroll position (native stack behavior).
- **Global search**: jump to any page or budget by name, and once the query reaches
  two characters also surface matching data - accounts (filtered client-side from the
  shared list cache) and transactions/planned items (server search, top 5 each) -
  ⌘K/Ctrl+K and a Search row
  in the desktop sidebar; on mobile, the page-header search button and the account
  menu's Search row (sheet presentation).

## Per-screen patterns

| Screen | Mobile pattern |
|---|---|
| Transactions | List rows (description / meta line / amount right-aligned, the 52px two-line coarse shape); row tap → the transaction record page (`/transactions/:id`, a full page below 1024px: summary + one-field edit-in-place rows presented as sheets, Items/Receipts sections, footer Duplicate and Delete-with-confirm; the header Back target and browser Back both return to the filtered list); mid-edit rotation keeps drafts (the 640px crossing swaps presentation, never remounts the page); always-visible month stepper (chevrons only while the range is one exact calendar month; the label button always opens the filter sheet and is the date entry point) above a debounced search row (remembered across visits) + Filters trigger with an active-count badge; the trigger opens the two-level filter sheet: a hub of rows (label + value summary; active rows carry the marker and an X clear) and, behind each row, an editor level with a Back header - multi-select account/type/budget/category/currency - the transaction's stored own currency, hidden in single-currency workspaces - amount range, and the date editor (This month / Last month / Last 30 days / This year / All time preset chips - All time clears both date bounds and is lit whenever neither is set, the first-load state when no default is saved - plus localized From/To text inputs, an invalid entry reverting on blur, and a range calendar; no native date inputs); multi-choice editors grow a search field above 8 options; the sheet also holds the sort row and the Save-as-default and bookmark actions (persists the current view as the page's opening state - personal, per workspace) over a live "Show N transactions" footer; per-type totals strip (adjustments excluded); Export view button (JSON; honors only the date range and a single type); filter state lives in the URL |
| Accounts | Per-currency totals lines above full-width balance cards (name, computed balance, Archived badge) - each card is a link; card tap → the account page (`/accounts/:id`: summary with balance and In/Out this month, Add/Transfer/Set balance actions, Edit/Archive/Delete in the touch overflow sheet, Upcoming planned and recent transactions/transfers sections whose headers link into the filtered Activity tabs); when transfers exist, a chevron "View all transfers" link row to `/transfers` |
| Transfers | Rows (from → to / date / amount, cross-currency amounts on two lines); row tap → the transfer record page (`/transfers/:id`: summary, one-field edit-in-place rows presented as sheets, From/To account rows linking to the account pages, footer Repeat and Delete-with-confirm; the header Back target and browser Back both return to the filtered list); account (either side, single-select) + date-range filters, URL-synced (opens on the saved date-range default, persisted by the same Save-as-default action as the other list pages - the sheet's save row on phones); phone filter surface: the month stepper row plus a right-aligned Filters trigger opening the two-level sheet with date + account rows only (no sort row or bookmark action - the wire contract has no search or ordering params) and a live "Show N transfers" footer; creation via `/new` seeded `type=transfer` (the FAB carries the seed from this page; the page is part of the Activity scope - reached from the Activity tab, the Accounts "View all transfers" link, or global search) |
| New record (`/new`) | Full-page create flow (FormPage shell): type segmented control (Expense / Income / Transfer) with the amount (type-sign-prefixed) and date rows shared across types - switching type keeps both; description combobox over frequent descriptions of the picked type (applied only on explicit Enter/tap); account + category side by side; Budget row in multi-budget workspaces; one "More details" disclosure holding the note, items, the receipt file, the other-currency facet and the balance-adjustment switch (derived-open while it holds values); scan-receipt header action (extraction-gated, hidden in transfer mode); sticky footer with stacked full-width "Save and add another" + "Save transaction" ("Save transfer" in transfer mode) buttons; closing with unsaved changes asks to confirm; viewers are redirected away |
| Budget detail | Category cards (name centered in the header; Planned/Actual/Remaining beneath, planned tap → numeric editor; card/row tap toggles a visual highlight); one currency at a time, selected through a per-currency totals strip above the cards (one chip per currency with that currency's own planned total + spend meter, horizontally scrollable; last-viewed currency remembered per budget); single-currency budgets show a plain code chip; desktop keeps the ledger table with a sticky category column; period switcher = arrows + sheet picker (capped window centered on the viewed period; "View all periods" as the sheet's last row), plus admin-only add/edit/delete period icon buttons beside it on custom-cadence budgets (44px touch targets); "Manage categories" (write roles) opens the archive-first manager - delete only on already-archived rows (confirm states the live transaction count), merge into a target; its rows tap → action sheet on touch |
| Budget periods | Year-sectioned period cards, newest first (CURRENT chip on the active period, past periods muted); card tap opens the budget detail on that period (`?period=`); admin-only edit/delete icons on custom periods and an Add period button on custom-cadence budgets (44px touch targets) |
| Planned | "Planned \| Recurring" view switch above the status control (`?view=`, URL-synced; on phones the header's recurring-rules icon button owns the toggle - the segmented row is hidden below 640px - showing the active-rule count and lit while the recurring view is open); planned rows (status chip, Recurring badge on rows a rule materialized) tap → action sheet (Edit, Make recurring - pending rows not yet on a rule, Execute now, Execute with adjustments, and Cancel plan - pending rows only, Delete); recurring rows (Active/Paused chip, schedule + next-occurrence meta line) tap → action sheet (Edit, Pause/Resume, Delete - the confirm offers "Also delete its N pending planned transactions"); the planned view opens on the saved range default (personal, per workspace) or, with none saved, focused on the current calendar month (default written into the URL as `from`/`to`, no history entry; explicit date params win, and an explicit All time never re-defaults within the session); a month stepper row (full-width on mobile; planned view only) always sits above the status control - chevrons only while the effective date range is an exact calendar month, and the label button opens the filter sheet - and an empty month with no other filters gets a month empty state whose "Show all dates" action clears the range; status segmented control on its own row + the same Filters-trigger sheet pattern as Transactions (hub rows for multi-select account/budget/category/currency - the planned transaction's stored own currency, hidden in single-currency workspaces - amount range, planned-date range; no type facet - status and search keep their own toolbar controls), URL-synced; interim (a planned later trim, not the final shape): phones carry three control rows in the planned view - stepper, status, search + Filters - until search folds into the sheet; per-currency totals strip; sort row and the Save-as-default/bookmark actions in the sheet (as Transactions); Export view button (JSON; honors only the status and date filters) - search/filters/sort/totals/export/save-default belong to the planned view only, and the recurring view has no filter UI at all |
| Members | Card list (avatar, name, role/status badges); card tap → action sheet (Edit role, Reset password, Reset 2FA - same role gate as reset password, Remove) |
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
