# Frontend Application

React SPA for budget tracking with multi-workspace collaboration and role-based access control.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite 8 | Build tool |
| React Router 7 | Client routing |
| TanStack Query 5 | Server state |
| Axios | HTTP client |
| i18next / react-i18next | Internationalization (UI catalogs; en/uk/pl - see [docs/i18n.md](../docs/i18n.md)) |
| Tailwind CSS 4 | Styling (Architectural Ledger design system) |
| Lucide React | Icon library |
| React Hot Toast | Notifications |

## Project Structure

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts         # Axios instance + typed API modules
│   │   └── queryClient.ts    # App-wide QueryClient (own module - no import cycles)
│   ├── components/
│   │   ├── layout/           # MainLayout, Sidebar, BottomNav (mobile), AccountMenuSheet (mobile account menu) + AccountMenuContext (its open-request channel), ActivityTabs (the Activity tab row), UserMenu, LanguageModal (language picker), WorkspaceSelector, ThemeToggleRow, WorkspaceSettingsPanel, CreateWorkspaceForm, PageHeader, FormPage, SplitView, DetailPanel
│   │   ├── common/           # Modal, Select, ConfirmDialog, Pagination, SwipeRow (left-swipe action reveal for touch rows), formStyles, DateQuickPick, Disclosure, EditableField, LinkedRow…
│   │   ├── accounts/         # AccountFormModal, SetBalanceModal
│   │   ├── bookmarks/        # bookmarkMeta (bookmark icon + swatch-key registry, BookmarkGlyph)
│   │   ├── currencies/       # CurrencySetField (ordered set picker), CurrenciesSettingsSection
│   │   ├── budgets/          # PeriodPicker (budget period listbox), PeriodCard (periods-page card), BudgetSummaryCard (phone ledger summary with swatches), BudgetCategoryList (phone grouped category cards)
│   │   ├── dashboard/        # Home widgets (AccountsWidget, BudgetWidget, UpcomingWidget, RecentActivityWidget), BudgetInsights (planned-vs-spent charts, mounted on the periods page)
│   │   ├── filters/          # FiltersTrigger (phone Filters entry), FilterSheet (two-level phone bottom sheet), FilterChipsBar (640+ toolbar), DateRangeEditor, MultiChoiceEditor, AmountRangeEditor, SingleChoiceEditor (container-agnostic editor bodies)
│   │   ├── transactions/     # TransactionsTable, TransactionAddRow, TransactionRecord, TransferRecord, TransactionFormFields, TransferFormFields, AmountField, TransactionItemsEditor, TransactionItemsList, TransactionAttachments, ExtractionReviewModal
│   │   ├── modals/budgets/   # PeriodFormModal (custom-period add/edit), ManageCategoriesModal
│   │   ├── modals/bookmarks/ # BookmarkFormModal (create/edit bookmarks)
│   │   ├── modals/transactions/ # PlannedFormModal, ExecuteAdjustedModal, RecurringFormModal
│   │   ├── profile/          # Settings/profile sections
│   │   └── settings/         # WorkspaceDefaultsSection (workspace panel "Default views" - per-page view defaults)
│   ├── contexts/
│   │   ├── AuthContext.tsx          # Authentication + consent state
│   │   ├── WorkspaceContext.tsx     # Current workspace and role
│   │   ├── UserPreferencesContext.tsx
│   │   └── ThemeContext.tsx         # Light/dark theme
│   ├── hooks/
│   │   ├── useDomain.ts             # useAccounts, useBudgets, useEnabledCurrencies, useMultiCurrency, useExtractionEnabled, useTransaction (single-transaction detail query on the shared `['transactions','detail',id]` entry)
│   │   ├── useAttachments.ts        # Attachment list/upload/delete + cached-blob view/download (per transaction)
│   │   ├── useExtractionPolling.ts  # Receipt-extraction polling for one transaction's attachments: pending id, poll query, done/failed side effects, review payload
│   │   ├── useBookmarks.ts          # Bookmark list + mutations + useVisibleBookmarks (shared sidebar/account-menu-sheet rows)
│   │   ├── useWorkspaceSettings.ts  # Per-workspace page defaults - useWorkspaceSettings + useUpdateWorkspaceSettings (the member-settings blob query + delta PATCH)
│   │   ├── usePermissions.ts        # Role-based permission checks
│   │   ├── useTransactionForm.ts    # Transaction form state machine (create/copy/receipt prefill): field state, session seeding, derived options, validation, save mutation - host-agnostic (the /new page and the transactions create panel both drive it); a suggestion pick prefills the untouched category/budget/account fields from the suggestion's last-used values and arms a tap-to-fill "Last: X" amount hint; an optional draft controller + restored values thread /new draft persistence through the same seams as the initial seeds (reseedNonce forces a fresh create-mode seed for the draft notice's Discard)
│   │   ├── useTransactionFieldSave.ts # One-field saves on a loaded transaction row: full-replace PUT assembled from the row (`Omit<Partial<TransactionInput>, 'items'>` patch), rejects without toasting (the editor owns error display), invalidates the form's three keys
│   │   ├── useTransferFieldSave.ts  # One-field saves on a loaded transfer row: full-replace PUT assembled from the row (`Partial<TransferInput>` patch), rejects without toasting (the editor owns error display), invalidates the form's three keys
│   │   ├── useTransferForm.ts       # Transfer form state machine (create/repeat): last-used pair, cross-currency implied rate, validation, save - driven by the /new page and the transfers list's create panel; /new draft persistence via the same optional draft controller + reseedNonce seams
│   │   ├── useActivityScope.ts      # Shared Activity scope chrome for the three list routes - the "Activity" title plus the scope breadcrumb (exact-calendar-month label + sole filtered account name, joined " / "), derived from the URL like the pages' export handlers
│   │   ├── useListboxPanel.ts       # Shared Select/MultiSelect/PeriodPicker panel state + keyboard nav
│   │   ├── useWorkspaceSwitch.ts    # Shared workspace-switch handler (workspace selector dropdown + account menu sheet); a successful switch clears the old workspace's /new draft (a failed one leaves it in place)
│   │   ├── useMediaQuery.ts         # Responsive breakpoint detection
│   │   ├── useBreakpoint.ts         # Device-tier truth (isMobile/isTablet/isDesktop/isWide, Tailwind-snapped; isWide overlaps isDesktop from 1280px - responsive.md's tier table predates it, the hook's comment is the interim contract) + useIsTouch (pointer: coarse)
│   │   ├── useKeyboardInset.ts      # On-screen keyboard overlap via visualViewport (iOS never resizes the layout viewport) - lifts BottomSheet and FormPage's sticky footer
│   │   ├── useDebouncedField.ts     # Draft state for inputs whose committed value lives in URL params (search, amount filters)
│   │   ├── useMainScrollRestoration.ts # `<main>` scrollTop save/restore keyed by pathname for the 640-1023 band (a route swap clamps that scroll container); module-level Map survives page remounts
│   │   ├── useDragToDismiss.ts      # Vertical drag-to-dismiss gesture for BottomSheet: pointer events with axis lock, arms only at panel scroll top, releases past 25% of panel height or on a downward flick (80ms dismiss / 120ms settle); reduced motion swaps the handle band for a close button
│   │   ├── useHorizontalStepDrag.ts # Horizontal step-drag: exactly one `onStep(dir)` per gesture past a 48px threshold, axis-locked (vertical scroll always wins), trailing click suppressed; MonthStepper's month label and the budget page's phone content block attach it (Phase 30's calendar adopts it next)
│   │   ├── useDeferredDelete.tsx    # 5-second client-side Undo window for transaction/transfer deletes: a module-level pending store per entity family (survives the record page's navigate-back and the panel's route swap), pagehide/visibilitychange keepalive flush, reactive `pendingId` the lists filter rows by; `useTransactionDeferredDelete` / `useTransferDeferredDelete` are the host-facing wrappers
│   │   └── useOverlay.ts            # Blocking-overlay behavior for Modal/BottomSheet: stack-aware Escape, refcounted scroll lock, focus restore
│   ├── i18n/
│   │   ├── index.ts             # Synchronous i18next bootstrap (all catalogs inlined at build time; detection: localStorage then navigator)
│   │   ├── LanguageContext.tsx  # LanguageProvider + useLanguage() - active language/number format, switching, server-preference sync
│   │   ├── dateLocales.ts       # date-fns locale per registry language
│   │   ├── i18n.d.ts            # Key types derived from the en catalogs
│   │   └── locales/<lang>/      # One JSON file per domain namespace (13), per language
│   ├── pages/                # Route page components
│   ├── types/index.ts        # TypeScript interfaces
│   └── utils/                # format, errors (string + 422 detail-array extraction), pageSize, params (list filters), dates (local-date period math for the from/to list-filter params: whole-month, whole-week, and whole-year ranges, calendar-month detection, adjacent-month shift), listFilters (the Activity lists' filter registry - one ordered def list per page over the unchanged URL param names; drives badge counts, Clear, chips, the sheet hub and the Add-filter menu; Transactions and Planned carry a `search` def so the remembered term shows as a removable chip and counts toward the badge - its editor is the page's always-visible search input, so the sheet hub and the Add-filter menu skip it), pageDefaults (resolve the member-settings blob into fresh-visit URL params and capture the current URL back into the blob), transactionItems, attachments (view/download helpers), bookmarks (bookmark target path, active-state matching, filter-params capture), currencies (budget-view active-code derivation + `PRE_AUTH_CURRENCIES`, the curated pre-auth list behind the register/reset pickers), amountInput (normalizeAmountInput/parseAmountNumber - accepts both decimal separators, disambiguated by the active number style, normalized at submit), tappable (button semantics for plain-div rows that open an ActionSheet on touch), zoomLock (the account menu sheet's device-local "disable zoom" preference), formDraft (/new draft persistence: `owlgarth_formdraft_<user>_<workspace>` localStorage keys, 24h expiry, debounced writes flushed on unmount, a generation counter that aborts writes racing a logout/workspace-switch clear)
├── scripts/                 # i18n tooling: i18n-check (parity gate), lang-add/list/rm, key-find/rm, i18n-lib
├── i18next.config.ts        # i18next-cli config (i18n:extract; locales list)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Pages and Routes

Four primary destinations in the sidebar and the bottom bar (Home, Activity, Accounts,
Budgets - Activity covers `/transactions`, `/planned` and `/transfers` through one tab and
one tab row; the sidebar adds Members and Settings footer rows), a Transfers page reached
through the Activity tab (and the Accounts "View all transfers" link and the command
palette), a full-page create flow at `/new` (transaction and transfer creation in one
form - the FAB and the below-1024px create buttons land there; editing a transaction or
transfer happens on its record through one-field saves, not `/new`),
a Bookmarks manage page (reached from
the Manage row of the sidebar's or the account menu sheet's bookmarks section), nested budget
routes, auth/legal routes and a 404 catch-all. Every page opens with the shared
`PageHeader`; the three list routes share the "Activity" title, a scope breadcrumb and the
`ActivityTabs` row.

| Path | Component | Description |
|------|-----------|-------------|
| `/login`, `/register` | Login, Register | Auth; registration picks a currency set (`CurrencySetField` on the pre-auth curated list; first = workspace primary) + optional sample data; a `/login` visit bounced from a protected route carries the destination in router state (validated to an in-app path, never a URL param) and returns the user there after sign-in - direct visits land on `/` |
| `/verify-email` | VerifyEmailPage | Public; consumes the email-verification `?token=` link (verifying/success/error states, plus a resend form); refreshes the logged-in user only when a session already exists |
| `/confirm-email-change` | ConfirmEmailChangePage | Consumes the email-change `?token=` link; requires auth - the token is validated against the logged-in user's ID, so a fresh session lands on login and must re-click the link |
| `/reconsent` | ReConsentPage | Requires auth; consent gate shown when terms/privacy were updated - states which document is outdated and requires accepting both before proceeding |
| `/privacy` | PrivacyPolicyPage | Public; Privacy Policy rendered through the shared `LegalDocPage` shell (`legalApi.getPrivacy`) |
| `/terms` | TermsPage | Public; Terms of Service through the same `LegalDocPage` shell (`legalApi.getTerms`) |
| `/` | Dashboard | Four widgets in a 2-column grid (single column on phones): Accounts (balance rows link to the account page, per-currency exact totals below - one line per currency present, codes as row labels), Budget (default budget's current period, spent-of-planned per currency, up to three attention rows - over or >=75% of planned, each linking to Activity filtered to that category and the period - plus a "Budget history" link to the periods page), Upcoming (pending planned items due within 14 days, overdue included; each row links to `/planned` with a window that always contains its own date), and Recent activity (last three transactions, rows linking to the record page) |
| `/accounts` | AccountsPage | Account cards (name, computed balance with the currency code as the suffix in multi-currency workspaces, Archived badge) that link to the account page; per-currency totals above the grid (one line per enabled currency in creation order); create account (admin+), header Transfer button to `/new?type=transfer` (hidden on phones, where the FAB owns creation), Show-archived toggle, and - when transfers exist - one chevron "View all transfers" link row to `/transfers` |
| `/accounts/:id` | AccountPage | One account's page, a full page at every width: summary card (name, balance from the shared `['current-balances']` entry, In/Out this month), Add (`/new?account=`) and Transfer (`/new?type=transfer&account=`) actions for writers, Set balance (admin+), and an overflow menu with Edit, Archive/Unarchive and Delete (archived accounts only) - ActionSheet on touch, anchored popover on fine pointers; Upcoming planned, Recent transactions (rows link to `/transactions/:id`) and Recent transfers sections whose header chevrons link to the filtered Activity tab (empty sections hide; transactions keeps an empty state); archived accounts render read-only with the badge (balance and sections still show); foreign/deleted/garbage ids render a not-found state |
| `/budgets` | BudgetsPage | Budget list with create/edit modals (name + ordered currency set); cards list their currency codes; card icons open a budget's periods / add a custom period; "Show archived budgets" toggle with per-card unarchive (archived cards stay navigable, presentation muted) |
| `/budgets/:id` | BudgetDetailPage | Category plan-vs-actual with period switcher (`?period=` param deep-links a period; capped 7-row window + "View all periods" row; opens on the current period, nearest-today fallback); multi-currency budgets select the viewed currency through a per-currency totals strip (keyboard-cyclable tablist; last view remembered per budget in localStorage); custom-cadence period management; "Manage categories" (write roles) opens an archive-first manager (delete offered only on already-archived rows, merge moves a category's history to a target); exact planned/actual/remaining column totals (footer row on desktop, `BudgetSummaryCard` on mobile - ledger-color swatches beside each label) sum the visible, non-archived rows client-side - not the API's summary totals, which include archived categories' money the table hides. Desktop renders the ledger table with a row-order control ("Needs attention first" - over rows, then near-limit, percent descending - or natural category order, remembered per budget in localStorage), status chips beside category names (Over / Near limit) and the category name as a link into Activity filtered to that category and the viewed period (trailing chevron). Phones render the grouped card list (`BudgetCategoryList`): "Needs attention" first, then "On track", each card carrying a spend bar, status word, amount-left line and a chevron Activity link; card/row tap still toggles a visual highlight; on coarse pointers a horizontal swipe on that phone card block steps one period (through the same `goToPeriod` the header chevrons call, so the `?period=` URL contract is untouched - the currency chip strip and any horizontally scrollable region never trigger it, and a step is busy-guarded while the next period is materializing). Planned amounts are edited through the page-wide **Edit plan** mode (member+, past periods read-only): every planned figure of the viewed currency becomes a draft input, a sticky footer offers Save plan / Cancel with a changed-row count, Save sequentially PUTs only changed rows (failed rows keep their drafts with inline server errors), and a dirty Cancel or period/currency switch asks to confirm the discard |
| `/budgets/:id/periods` | BudgetPeriodsPage | All periods of a budget as year-sectioned cards (newest first); cards deep-link to the detail page via `?period=`; add/edit/delete for custom periods (admin); below the grid, `BudgetInsights` renders the budget's planned-versus-spent history (charts scoped to this budget's fixed `budgetId` prop - no budget picker) |
| `/transactions` | Transactions | Transaction list, filters, create (below 1024px the button navigates to `/new`, carrying the account filter when exactly one is set; 1024px+ sets the `?new=transaction` param, opening the in-flow create panel in SplitView's panel slot - copy mode rides `?copy=`); rows open the record (below 1024px the full page, 1024px+ the side panel; the ledger table with container-query column sets and the keyboard-first inline add row renders at 640px+, phones keep the two-line div rows, each swiped left to reveal Duplicate + Delete for writers (auto-managed adjustment rows excluded); totals strip, remembered search (an active term shows as a removable Search chip - its body click focuses the search input - and counts toward the Filters badge; the chip's X and Clear all drop the URL param, the stored value and the restored hint together), "Export view" JSON download; the filter surface is a two-level phone sheet (Filters trigger with an active-count badge; date presets live in its date editor, sort and the Save-as-default/bookmark actions in the sheet) below 640px, and a 640+ chips toolbar above it (month stepper whose label opens the date editor and drags sideways to step one month, applied chips, "Add filter" menu, search, sort select, "Save view" menu holding Save-as-default and the bookmark action); opens on the user's saved view defaults (personal, per workspace - explicit URL params win) |
| `/transactions/:id` | TransactionRecordPage / Transactions | A single transaction's record: a full page below 1024px, the side panel beside the list at 1024px+ (one route; the element branches on tier). Summary + one-field edit-in-place rows (sheet presentation on phones), belongs-to LinkedRows, Items/Receipts sections for writers, footer Duplicate and Delete - the delete arms the 5-second Undo window (`useDeferredDelete`, no confirm dialog) and returns to the list at once, where the row is hidden until Undo or the window's expiry decides; foreign/deleted/garbage ids render a not-found state, and rows stay disabled for viewers and auto-managed adjustments |
| `/planned` | Planned | Planned transactions with a "Planned \| Recurring" view switch (`?view=` URL param, default planned; below 640px the segmented row hides and a phone-only recurring-rules icon button in the page header toggles the same param, labeled with the active-rule count); the recurring view lists active and paused rules (schedule + next-occurrence meta line, pause/resume, delete dialog offering "Also delete its N pending planned transactions"); planned rows carry a Recurring badge when a rule materialized them, and pending rows without a rule offer "Make recurring" (prefills the rule form and adopts the row as its first occurrence - no duplicate row); the planned view opens on the member's saved view defaults (personal, per workspace; explicit or deep-linked date params always win) or, with none saved, focused on the current calendar month - the default is materialized into the URL as `from`/`to` (replace, no history entry, so the focused view is shareable), partial ranges pass through, and clearing both params is an explicit All time that never re-defaults within the session (a fresh mount re-initializes); a month stepper (‹ October 2026 ›; chevrons only while the range is an exact calendar month) above the status control is always present (planned view only), and an empty month with no other filters gets a month-aware empty state with a "Show all dates" action; list features mirror Transactions (the same phone filter sheet and 640+ chips toolbar, totals strip, remembered search as a removable chip, "Save as default", "Export view" - planned view only; the recurring view has no filter UI); on touch, pending planned rows for writers reveal a left-swipe tray with "Paid differently" (Execute with adjustments) and Delete - the swipe Delete keeps its confirm dialog, unlike the transactions/transfers undo flow |
| `/transfers` | TransfersPage | Transfer history with account (either side, single-select) + date filters in the URL (opens on the saved date-range default, personal per workspace; the "Save as default" action lives in the 640+ "Save view" menu - the page header keeps only New - and in the phone filter sheet's save row, whose hub offers date + account rows only); rows open the transfer record (full page below 1024px, the list's side panel at 1024px+ - the selected row carries the reserved-border highlight and `aria-current`; touch rows reveal a left-swipe tray with Repeat + Delete for writers via the 5-second undo flow, and fine-pointer hover rows keep the same Repeat/Delete shortcuts); creation below 1024px navigates to `/new?type=transfer` (carrying a single account filter), 1024px+ sets `?new=transfer`, opening the in-flow create panel in SplitView's panel slot (create wins the panel slot over a selected record); part of the Activity scope - the Activity tab and tab row light on it, and it is also reached via the Accounts "View all transfers" link or the command palette |
| `/transfers/:id` | TransferRecordPage / TransfersPage | A single transfer's record: a full page below 1024px, the side panel beside the list at 1024px+ (one route; the element branches on tier). Summary (description, From → To, amounts - a second line when cross-currency) + one-field edit-in-place rows (date, description, sent amount, received amount when cross-currency, From/To accounts - the account rows are also LinkedRows to the account pages), footer Repeat (to `/new?type=transfer&copy_transfer=<id>`) and Delete - the delete arms the 5-second Undo window (no confirm) and the full-page host returns to the list with replace, the row hidden there until Undo or expiry decides; foreign/deleted/garbage ids render a not-found state, and rows stay disabled for viewers and while a save is in flight |
| `/new` | NewTransactionPage | Full-page create flow for transactions and transfers (FormPage shell; the URL seeds `?type=`, `?account=`, `?copy=` (transaction copy) and `?copy_transfer=` (transfer repeat - pair + description prefilled, amounts and date cleared), read once at mount): a three-segment type control (Expense / Income / Transfer) with the amount and date rows shared across types - switching type keeps both - then description combobox (a suggestion pick prefills the untouched category/budget/account fields from its last-used values and offers the last amount as a tap-to-fill "Last: X" hint), account + category, Budget row (multi-budget workspaces) and one "More details" disclosure (note, items, receipt scan, other-currency, balance-adjustment switch) in the G5.1 field order; scan-receipt header action (`?scan=1` app-shortcut deep link focuses it once usable, silently degrading when it never becomes usable); unsaved scalar values draft to localStorage per user + workspace (24-hour expiry; the key waits for the workspace so the first seeding pass consumes the restore) and reappear with a notice + Discard - dormant under `?copy=`/`?copy_transfer=`, the receipt file/parse state/line items never drafted, and logout or a workspace switch clears them; sticky footer with "Save and add another" + "Save transaction" ("Save transfer" in transfer mode); closing with unsaved changes asks to confirm; viewers are redirected to `/` |
| `/members` | WorkspaceMembersPage | Member management |
| `/bookmarks` | BookmarksPage | Manage personal bookmarks: chevron reorder, sidebar-visibility switch, archive (with restore), edit, delete; the header's cap select sets how many entries render in the sidebar/account menu sheet (3/5/8/All); no sidebar slot - entry via the Manage row of the sidebar bookmarks section or the account menu sheet's; creation happens on the source pages (budget detail header, Transactions/Planned filter surfaces - the phone sheet or the 640+ toolbar); the budget detail header's button edits the matching non-archived bookmark (viewed budget+currency) when one exists, offering create otherwise |
| `/settings` | ProfilePage | Profile, preferences, data export/import; muted app-version line below the card (shown on every tab, from `VITE_APP_VERSION`) |
| `*` | NotFoundPage | 404 catch-all for unknown paths |

## Components

**Layout** (`components/layout/`): `MainLayout` (responsive wrapper - renders the
desktop `Sidebar` and the mobile `BottomNav`; both branches sit inside
`AccountMenuProvider`, and the phone branch also mounts `AccountMenuSheet`, so every
page header can open the account menu and the context survives a 640px
viewport crossing; the phone branch also owns POP-only scroll restoration
(Back/Forward return a view to its saved offset once the document is tall
enough to hold it - new navigations start at the top); with no stored sidebar
preference, desktop viewports below the 1280px `isWide` boundary mount the
collapsed icon rail - 1280px+ keeps the expanded default - and while no
preference is stored, crossing that boundary re-applies the tier default; the
first manual toggle writes the preference and permanently disarms the
adjust), `Sidebar` (a Ctrl K / ⌘K search row, then four nav destinations - Home,
Activity (lit on `/transactions`, `/planned` and `/transfers` by pathname
prefix), Accounts and Budgets, each followed by up to six sub-rows plus a
View-all link (account rows are per-account NavLinks to `/accounts/:id`
showing name + balance, the currency code only in multi-currency workspaces;
balances reuse the `['current-balances']` cache
entry), a personal bookmarks section (the user's active
bookmarks - capped by their preference - with a Manage link to `/bookmarks`),
and a footer with Members and Settings rows above the user menu; the workspace
selector's gear opens `WorkspaceSettingsPanel`; in the collapsed rail the
labels and sub-rows hide and the icons carry title tooltips),
`BottomNav` (mobile shell: bottom bar with Home/Activity/Accounts/Budgets tabs
around a
center create FAB - the FAB navigates to `/new` as a plain push (Back returns
to the list); from `/transfers` it carries `type=transfer`, and the account
filter travels as `account` when it holds exactly one id. The FAB hides for
viewers/workspace-less users and on `/new` itself, but the slot stays so tabs
don't shift),
`AccountMenuSheet` (the mobile account menu, opened from the page-header
profile button through `AccountMenuContext`'s monotonic open-tick: the
overflow destinations (Accounts, Planned, Members,
Settings), a bookmarks section (the same capped entries + Manage link as the
sidebar's), search, logout, workspace switcher + create/settings, the theme row
and the zoom toggle),
`UserMenu`, `WorkspaceSelector`, `ThemeToggleRow` (dark-mode toggle row shared by
the desktop UserMenu dropdown and the mobile account menu sheet), `LanguageModal`
(mount-per-use language picker - one card per registry language with the active
one checked; opened by the "Language" row in the desktop UserMenu dropdown and
the mobile account menu sheet, each closing itself first so the modal is the only
overlay; a tap applies the switch immediately, then a fire-and-forget
preferences PATCH persists it when authenticated), `WorkspaceSettingsPanel`
(workspace rename/delete modal hosting the admin-gated
`CurrenciesSettingsSection` and the personal `WorkspaceDefaultsSection`
("Default views" - the member's per-workspace page defaults, every role);
opened from the workspace selector's gear and the account menu sheet),
and `CreateWorkspaceForm` (mount-per-use create-workspace
modal - name + ordered currency multi-select via `CurrencySetField` in compact
mode - opened as a modal from all three call sites: the no-workspace message,
the workspace selector dropdown, and the mobile account menu sheet; also exports
`CreateWorkspaceButton`).
`PageHeader` (standard page-top row, used by all eleven pages: an optional back
affordance (`backTo`
route, overridable with `onBack` - the record pages pass a `navigate(-1)` POP
when the row tap that opened them can be unwound, deep links keep the PUSH), a
context breadcrumb in the metadata register, the title, and
right-aligned `actions`; `showAccountActions` adds the phone-only search +
profile pair (`sm:hidden`) opening the command palette and the account menu
sheet; the row's min-height floors serve the 44px
coarse-pointer and 48px phone controls), `FormPage` (full-page form shell: a
title row whose back affordance calls `onClose` - the caller owns any
unsaved-changes confirmation - a scrolling body, and a sticky footer whose
bottom offset composes the phone bottom-nav clearance with the on-screen
keyboard inset via `useKeyboardInset`), `SplitView` (desktop list + side-panel
split: the list wrapper is the `@container` container-query container so
column sets key on the list's own available width, the panel slot carries
the fixed 400px panel width once, and a null panel leaves the bare list
pixel-identical), and `DetailPanel` (the in-flow record panel for
`SplitView`'s slot: a card in the page flow, not an overlay - no scrim, focus
trap or scroll lock - whose Escape closes it only while no blocking overlay
is open). `ActivityTabs` (the Activity tab row on the three list routes -
NavLink segments in the SegmentedControl register carrying `from`/`to` always
and the `account` filter as a comma list between the list pages or a single
id to Transfers when exactly one account is selected). FormPage's first
consumer was the `/new` create page (redesign phase 3); SplitView and
DetailPanel host the record panels beside the Transactions and Transfers
lists at 1024px+ (phases 4 and 6), where the same slot also holds each
list's in-flow create panel (`?new=transaction` / `?new=transfer`).

**Common** (`components/common/`): `Modal`, `Select`/`MultiSelect` (custom dropdowns
sharing the `useListboxPanel` hook + `listboxParts.tsx` primitives), `ConfirmDialog`,
`Pagination`, `EmptyState`, `Switch`, `SegmentedControl`, `BottomSheet` (the
universal mobile container - slide-up panel with scrim dismiss, body scroll lock
and safe-area padding; modals, selects, action menus and pickers render inside
it on mobile; its sticky handle band doubles as a drag-to-dismiss surface
(`useDragToDismiss` - arms only while the panel is at scroll top so content
scrolling always wins, and release past 25% of the panel height or a downward
flick closes while shorter releases settle back; under reduced motion the band
renders as a labeled Close button instead)), `ActionSheet` (titled list of 44px
tap actions in a bottom sheet -
the touch replacement for hover-revealed row actions; closes the sheet before
running the action so it can safely open a modal), `SwipeRow` (left-swipe
action reveal for coarse-pointer rows: an inert action tray behind the row
content - out of the tab order and the a11y tree until revealed - with
axis-locked gestures where vertical scroll always wins, one open row app-wide
and no auto-fire on a full swipe; hosts pass `enabled={isTouch && canWrite}`
plus per-row eligibility and the row keeps its own tappable activation;
wired into the transactions, transfers and planned lists), `CommandPalette`
(Ctrl/Cmd+K page search, summoned via the exported `openPageSearch()` from the
sidebar's search row, the page headers' phone-only search button, and the
account menu sheet: static destinations plus server-backed
Budgets/Accounts/Transactions/Planned results once the query reaches 2 chars;
desktop popover, mobile bottom sheet), `MonthStepper` (the Activity lists' month
stepper: chevrons only while the effective range is one exact calendar month -
the page gates them via `onShift` - and the label always a button, the
date-editor trigger, that coarse pointers can also drag sideways to step one
month (one step per gesture through the same `onShift`; the trailing click is
suppressed so the editor does not also open); `inline` drops the standalone
phone row's margin and width
claim for toolbar membership), `AppliedFilters` (removable applied-filter
chips, one per active registry filter except the date range, plus "Clear all";
chips carry an optional `onBodyClick` seam - the search chip routes its body
click to focusing the page's search input instead of an editor popover, with
that chip's `aria-haspopup`/`aria-expanded` suppressed; 640px+ only standalone
via a CSS gate, `inline` inside the toolbar),
`SearchInput` (search box with leading icon, debounced commit and clear
X - the remembered search on the list pages; an optional `inputRef` is what the
search chip's body click focuses), `AmountInput` (debounced numeric
input for the min/max amount filters), `Skeleton` (wireframe loading bars -
`Skeleton` single bar + `SkeletonRows` stack), `RoleBadge` (inline workspace-role
chip next to workspace rows in the selector dropdown and the mobile account
menu sheet),
`ListTotalsStrip` (presentational totals
strip for the list pages - the owning page runs the query and passes the
results; Transactions also drives its updating pulse while a deferred delete
is pending),
`InfoHint` (inline "?" hint icon after form labels - the bubble shows on hover on
hover-capable devices and pins on click/tap elsewhere; negative vertical margins
keep it from ever growing its label row), `DateQuickPick` (one-tap date control
composed from `SegmentedControl` + `DatePicker`: Today / Yesterday / the day
before (labeled by its weekday) / Other - "Other" opens the DatePicker and a
custom pick takes over the third slot so the choice stays visible),
`Disclosure` (controlled collapsible form section: a full-width toggle button
carrying `aria-expanded` over a sibling region wired from one `useId()`; the
region stays mounted and hides via the class, never the HTML attribute, so
prefilled content survives toggling), `EditableField` (click-to-edit row field:
the idle row renders `display`, clicking swaps in the caller-rendered editor -
`renderEditor` receives the draft, commit/cancel, and `inputProps` with
Enter=commit / Escape=cancel / blur=commit on single-line inputs; `onSave`
drives the saving state and a rejection shows the server message under the
row; mobile renders the editor in a one-field `BottomSheet`, and the editing
state lives above the mobile/desktop branches so a mid-edit resize keeps the
draft), `LinkedRow` (`EditableField` plus a trailing chevron `Link` cell - a
real cell with its own 44px coarse-pointer floor, deliberately not the
expanded-hit-area utility), and `formStyles.ts` (the input/label/button
class constants - the redesign's form primitives). `DatePicker` (react-day-picker;
an optional controlled-open `open`/`onOpenChange` pair drives the calendar in
place of internal state - `DateQuickPick` is the controlled caller - while
omitting it keeps the uncontrolled trigger behavior) and
`LegalDocPage` (shared shell for the Privacy/Terms pages) live at `components/`,
alongside `ProtectedRoute` (the auth gate: loading splash while auth resolves,
redirect to `/login` when unauthenticated; wraps the workspace/preferences
providers around all in-app routes, and `/reconsent` and `/confirm-email-change`
individually).

**Accounts** (`components/accounts/`): `AccountFormModal`, `SetBalanceModal` (records a
balance adjustment).

**Currencies** (`components/currencies/`): `CurrencySetField` (ordered currency-set
picker on top of `MultiSelect` - a visible ordered list with up/down arrows and a
primary marker for index 0; a compact mode folds the list into helper copy for
constrained call sites, and an optional "Manage currencies..." bridge jumps to the
workspace-settings currencies section; used by the budget create/edit modals in
full mode with ambient `useEnabledCurrencies()` options, and by the
create-workspace form, register page, and account-reset section with explicit
catalog options - the prop-fed mode also disables the ambient query, which those
pre-workspace/pre-auth call sites have nothing to answer),
`CurrenciesSettingsSection` (workspace-settings section, admin-gated: enabled
list with per-row reorder arrows (first = primary) and disable, catalog enable
picker, and an inline custom-currency form - custom currencies are always
2-decimal).

**Budgets** (`components/budgets/` + `components/modals/budgets/`): `PeriodPicker`
(the period listbox on Budget detail - desktop popover grouped by year with a
CURRENT chip and muted past periods, mobile bottom sheet; a sibling consumer of
the `useListboxPanel` machinery, not a Select fork; optional `limit` caps the list
to a window centered on the viewed period, and `onViewAll` appends a
"View all periods" row - sticky popover footer on desktop, last row in the mobile
sheet - that navigates to the periods page instead of selecting), `PeriodCard`
(one period as a card on the periods page; the whole card is a link to
`/budgets/:id?period=<id>`, with a CURRENT chip, muted past periods, and admin
edit/delete icons on custom periods), `PeriodFormModal` (add/edit a custom budget
period; the name is derived from the date range until edited), `ManageCategoriesModal`
(archive/merge/delete manager for a budget's categories - archive-first: delete is
offered only on already-archived rows and states the live transaction count, merge
picks the target that keeps the history; mount-per-use, lists archived-inclusive),
`BudgetSummaryCard` (the phone ledger summary: Planned / Actual / Remaining rows,
each label prefixed by its ledger-color swatch - the value never wears the ledger
color; receives the page's exact string totals), `BudgetCategoryList` (the phone
category cards, grouped "Needs attention" then "On track"; one card per category
with spent-of-planned, a status-colored spend bar, status word on attention rows,
amount-left line and a trailing-chevron Activity link - all state lives in the page,
which also threads the Edit-plan draft inputs through the cards).

**Dashboard** (`components/dashboard/`): the four Home widgets - `AccountsWidget`
(balance rows linking to the account page with per-currency exact totals beneath),
`BudgetWidget` (default budget's current-period spent-of-planned plus up to three
attention rows - over or >=75% of planned - linking into filtered Activity; custom
cadence shows a note, no budget an empty state with a create link), `UpcomingWidget`
(pending planned items due within 14 days, overdue included; per-row links open
`/planned` on a window containing the row's own date), `RecentActivityWidget` (last
three transactions linking to the record page) - and `BudgetInsights` (planned-vs-
actual data view now mounted on the budget periods page below the period list,
scoped to a fixed `budgetId` prop: horizontal paired bars per category (top 6 +
Other) or grouped columns per period, a table/chart view toggle, per-currency
Select and hover tooltips; chart tokens - series-1 = planned, series-2 = actual,
text never wears series color).

**Filters** (`components/filters/`): the Activity lists' filter surface, built
over the per-page registries in `utils/listFilters.ts` (one ordered def list
per page over the unchanged URL param names - badge counts, Clear, chips, the
sheet hub and the Add-filter menu all read the same defs).
`FiltersTrigger` (phone-only trigger with the active-count badge; the
`sm:hidden` gate is baked in), `FilterSheet` (the below-640 two-level bottom
sheet: hub rows with summaries and per-row clears, an editor level behind each
row with a Back header, the sort/save rows and a live "Show N" footer),
`FilterChipsBar` (the 640+ wrapping toolbar: stepper label opening the
date-editor popover, applied chips opening their editors, an "Add filter" menu
of inactive defs, search and sort slots, and a "Save view" menu - one popover
at a time, panels at the `z-popover` tier over the sticky table THEAD), and
the four container-agnostic editor bodies - `DateRangeEditor` (presets +
localized From/To inputs with blur-revert + the first range-mode calendar),
`MultiChoiceEditor` (search field above 8 options), `AmountRangeEditor`,
`SingleChoiceEditor` (no chrome or Escape handling of their own; the host owns
the panel).

**Transactions** (`components/transactions/` + `components/modals/transactions/`):
`TransactionFormFields` (the presentational transaction form body in the G5.1
order - type segmented control, amount with sign prefix and a trailing
currency-code button, date quick picks, description combobox, account +
category side by side, a Budget row in multi-budget workspaces, and one "More
details" disclosure holding the note, items, the receipt file, the
other-currency facet and the balance-adjustment switch, derived-open while it
holds values; host-agnostic, renders against the `useTransactionForm` return
value - the `/new` page and the transactions create panel both host it; optional
account - "No account" is first-class, adjustments excepted - plus an
own-currency select that locks to the account's when one is set; description
autocomplete over frequent descriptions of the picked type, applied only on
explicit Enter/click - the pick also prefills the category/budget and account
fields the user has not touched this session (suggestion last-used values; an
explicit Select pick guards the field against later overwrites, and ids missing
from the loaded options - archived, other-budget - are skipped) and shows the
group's last amount as a "Last: X" hint under the amount field, filled only on
tap; the disclosure
opens pre-expanded when the seeded
transaction carries values; a receipt scan (the `/new` header action) seeds
the form through the hook: own currency from the parsed code when it is
enabled, the matching account auto-selected - preferring the per-currency
default), `AmountField` (amount input with a decorative
type-sign prefix and a trailing currency-code button/picker that locks to the
account's currency when one is set; the transfer flavor omits the whole
currency group - the currency comes from the From account; an optional `hint`
prop renders a caller-owned row under the error line - the suggestion
Last-amount button), `TransferFormFields`
(the transfer form body: From/To selects plus a More-details disclosure with
the description, the cross-currency received amount and the implied-rate
line - the shared amount/date rows live in the host), `TransactionsTable`
(the 640px+ ledger table: container-query column sets keyed on the table's
own width via SplitView's `@container` wrapper, sticky thead, `h-` row
floors, zebra with a mutually exclusive selected branch, roving-tabindex
keyboard row selection with a form-control guard), `TransactionAddRow` (the
table's inline create row at 1024px+ - the first body row plus a reserved
fixed-height status row; hosts `useTransactionForm` in create mode with
inline errors, Enter saves, a leading-sign type picker, and an N hotkey that
focuses the description), `TransactionRecord` (the host-neutral record
content: summary, one-field `EditableField` rows saved through
`useTransactionFieldSave`, belongs-to `LinkedRow`s, Items/Receipts sections,
footer - rendered by the full-page host below 1024px and the side panel at
1024px+), `TransferRecord` (the host-neutral transfer record content:
summary - description, From → To, amounts with a second line when
cross-currency - Details rows (date, description, sent amount, received
amount when cross-currency) and From/To account rows that are each both an
`EditableField` and a `LinkedRow` to `/accounts/:id`, saved through
`useTransferFieldSave`, with footer Repeat/Delete as host hooks - rendered
by the full-page host below 1024px and the transfers list's side panel at
1024px+), `TransactionItemsEditor` (loads a saved transaction's items and persists edits
through the list), `TransactionItemsList` (the editable rows grid both the
editor and the transaction form render - name/quantity/unit price/line total with
add/remove/reorder, a per-item category select (unset inherits the
transaction's category; the select is disabled until the transaction has one),
and the remainder card for the uncovered amount (editable name/category in the
edit tab, a display-only preview in create mode), stable per-row identity,
touch-aware),
`TransactionAttachments` (upload + view/download, extraction),
`ExtractionReviewModal`, `PlannedFormModal` (same optional-account +
own-currency pairing; account-less plans default to the workspace primary),
`ExecuteAdjustedModal` (execute a pending plan with adjustments - payment
date + amount prefilled from the plan, sent as execute overrides),
`RecurringFormModal` (recurring-rule create/edit - interval kind/count, start
date, plan-ahead count, optional end date with create-all-until-end-date
switch, active toggle, `InfoHint` field hints;
"Make recurring" prefills it from a pending planned row and adopts that row as
the rule's first occurrence instead of duplicating it).

## Contexts

### AuthContext

Handles authentication state and operations.

```typescript
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
}
```

`login`/`verify2FA` never navigate: post-sign-in routing is owned by the Login page,
whose already-authenticated guard returns the user to the protected route that
bounced them (carried in router state; direct visits land on `/`). The consent
check still runs inside both - reconsent redirects from `checkConsentStatus`
itself, since it is mandatory before any page. `logout` clears every `/new` form
draft belonging to the user (`removeDraftsForUser` in `utils/formDraft`, whose
generation bump also aborts any pending draft write) before wiping tokens and the
query cache.

### WorkspaceContext

Provides current workspace, user role, and workspace management operations.

```typescript
interface WorkspaceContextType {
  workspace: Workspace | null;
  workspaces: Workspace[];
  currentMembership: WorkspaceMember | null;
  userRole: 'owner' | 'admin' | 'member' | 'viewer' | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  switchWorkspace: (id: number) => Promise<void>;
  createWorkspace: (name: string, currencyCodes?: string[]) => Promise<Workspace>;
  deleteWorkspace: (id: number) => Promise<void>;
  updateWorkspace: (data: { name: string }) => Promise<Workspace>;
}
```

> There is no global account or period context. Accounts and budgets are read
> through the hooks in `hooks/useDomain.ts`; period selection is local state on the
> Budget detail page (periods are per-budget). The old `BudgetAccountContext` /
> `BudgetPeriodContext` were removed in the redesign. The selection is backed by
> a `?period=` URL param: deep links and reloads seed the chosen period,
> user-initiated selections are written back with `{ replace: true }` (selections
> stay out of history), and a garbage or foreign period id falls back to the
> default pick. The periods overview page (`/budgets/:id/periods`) holds no
> selection either - its cards deep-link into the detail page via the same
> `?period=` param.

### ThemeContext

Manages light/dark theme. Mounted at the top of the provider tree (inside `<BrowserRouter>`, wrapping `<AuthProvider>`) so all routes are themed.

```typescript
interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  setDark: (dark: boolean) => void;
}
```

The choice is persisted to `localStorage` under `owlgarth_theme` (`'light'` | `'dark'` | `null`). `null` (no stored value) means the light theme - the OS `prefers-color-scheme` is ignored; once the user toggles, the stored choice wins. An inline script in `index.html` sets the `.dark` class on `<html>` before React hydration to prevent a flash of the wrong theme (the same script also syncs `<html lang>` from the stored UI language pre-paint).

### LanguageContext

Lives in `src/i18n/LanguageContext.tsx` (beside the i18next bootstrap it drives, not under `contexts/`). Mounted inside `<AuthProvider>`, wrapping every route; owns the active UI language and number format.

```typescript
interface LanguageContextType {
  language: string;
  numberFormat: string;
  setLanguage: (code: string) => Promise<void>;
  setNumberFormat: (code: string) => void;
}
```

Resolution precedence: the authenticated server preference (`UserPreferences.language` / `.number_format`, applied silently on load, never re-applied after an in-session switch) > `localStorage` (`owlgarth_language` / `owlgarth_number_format`) > the registry default; i18next's browser detection (localStorage, then navigator) covers anonymous visitors. `setLanguage` switches i18next, persists the choice, syncs `<html lang>` and the API client's `Accept-Language` header, and reconfigures number/date formatting; `setNumberFormat` persists the choice and reconfigures formatting. Both re-apply `configureFormatting` in `src/utils/format.ts`. The full reference (registry, catalogs, lifecycle) is in [docs/i18n.md](../docs/i18n.md).

## Hooks

### usePermissions

Role-based permission checks for UI visibility.

```typescript
const {
  isOwner,
  isAdmin,
  isMember,
  isViewer,
  canManageBudgetAccounts,  // owner, admin
  canManageBudgetData,      // owner, admin, member
  canManageMembers,         // owner, admin
  canEditMember,            // checks role hierarchy
  canResetPasswordFor,      // checks role hierarchy
  canManageAccounts,        // owner, admin (alias of canManageBudgetAccounts)
  canManageCurrencies,      // owner, admin (same check; gates the currencies settings section)
  canWrite,                 // owner, admin, member (alias of canManageBudgetData)
} = usePermissions();
```

## API Client

### Configuration

The API base URL resolves at runtime: `window.__APP_CONFIG__.apiUrl` (from `/config.js`, generated by the deployed ui container at startup) -> `VITE_API_URL` (host Vite dev only) -> `http://localhost:8000/api`. `getRuntimeApiUrl()` in `src/runtimeConfig.ts` reads the runtime value; demo mode resolves the same way via `getRuntimeDemoMode()`. `getApiBaseUrl()` in `api/client.ts` wraps that resolution as the expression's single source: the axios instance and any out-of-band request - the keepalive DELETE in `hooks/useDeferredDelete.tsx`, which must survive page teardown where axios cannot - both go through it.

```typescript
const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
});
```

### API Modules

| Module | Purpose |
|--------|---------|
| `authApi` | Login, register, current user, preferences (incl. language / number-format), GDPR export/import + legacy import |
| `workspacesApi` | Workspace management |
| `workspaceMembersApi` | Member management |
| `workspaceSettingsApi` | Member settings - the user's per-workspace page-defaults blob (GET returns the full blob; PATCH sends only the changed page keys) |
| `currenciesApi` | Catalog + enabled currencies (enable/disable/custom/reorder) |
| `accountsApi` | Accounts, archive, computed balance |
| `budgetsApi` | Budgets + nested periods, categories, category-budgets |
| `transactionsApi` | Transactions (single fetch, filters, totals, bulk-account, filtered JSON export, frequent descriptions), line items, attachments, extraction, receipt parse |
| `transfersApi` | Transfers between accounts |
| `plannedTransactionsApi` | Planned with execute, totals by `currency`/`category`, filtered JSON export |
| `recurringTransactionsApi` | Recurring rules - list (incl. paused), create (optionally adopting a pending planned row), update, delete (optionally its pending planned rows) |
| `reportsApi` | Budget summary (planned vs actual), current balances |

### Token Management

```typescript
// Set token after login
setAuthToken(access_token);

// Clear token on logout
clearAuthToken();

// Get saved token
const token = getAuthToken();
```

The instance also tracks the UI language: `setApiLanguage(code)` sets the
`Accept-Language` header (seeded from the stored language at startup, updated on
every switch) so backend error details arrive translated. `getApiErrorMessage`
in `utils/errors` renders them - string details pass through, and Django Ninja
422 detail arrays are flattened (deduplicated `msg` strings joined with `; `)
into one line.

## Data Types

### Core Types

```typescript
interface User {
  id: number;
  email: string;
  full_name?: string;
  current_workspace_id?: number;
  is_active: boolean;
  created_at: string;
}

interface Workspace {
  id: number;
  name: string;
  owner_id?: number;
  created_at: string;
}

interface Account {
  id: number;
  workspace_id: number;
  name: string;
  type: 'cash' | 'bank' | 'other';
  currency_code: string;
  opening_balance: string;   // balance is computed, not stored
  is_archived: boolean;
  is_default_for_currency: boolean;  // one default per currency; drives receipt-currency auto-select
  display_order: number;
  created_at: string;
}

interface Budget {
  id: number;
  workspace_id: number;
  name: string;
  cadence: 'monthly' | 'weeks' | 'custom';
  cadence_weeks: number | null;
  cadence_anchor: string | null;
  is_active: boolean;
  currency_codes: string[];  // ordered set; first = default view
  // …description/color/icon/display_order
}

interface Transaction {
  id: number;
  account_id: number | null;  // null on account-less rows
  account_name: string | null;
  currency_code: string;     // the stored own currency (== the account's when set)
  date: string;
  description: string;
  note: string | null;      // free-text remarks, informational like description; never read by aggregates
  category_id: number | null;
  amount: string;
  type: 'income' | 'expense' | 'adjustment';
  original_amount: string | null;         // "paid in another currency" facet
  original_currency_code: string | null;
}

interface Transfer {
  id: number;
  from_account_id: number; to_account_id: number;
  from_amount: string; to_amount: string;
  from_currency_code: string; to_currency_code: string;
  rate: string | null;       // implied rate for cross-currency
  date: string; description: string;
}
```

See `src/types/index.ts` for the full set (Period, Category, CategoryBudget,
PlannedTransaction, TransactionItem, TransactionAttachment, ExtractionResult, …).

## Running

### Development

```bash
cd frontend
npm install
npm run dev                    # Runs at http://localhost:5173 (or VITE_PORT)
npm run dev -- --port 3000    # Override port via CLI
```

Application runs at `http://localhost:{VITE_PORT}` (default: 5173)

### Build

```bash
npm run build
npm run preview  # Preview production build
```

### Translation Tooling (i18n)

```bash
npm run i18n:check                              # Catalog gate: key parity vs en, untranslated/empty values (CI runs this)
npm run i18n:extract                            # i18next-cli: extract keys into the catalogs (i18next.config.ts)
npm run lang:list                               # Print the language registry + locale directories
npm run lang:add <code> <englishName> <nativeName> <dateFnsLocale>  # Scaffold a new language
npm run lang:rm <code>                          # Remove a language (locale dir + registry + i18next.config.ts locales)
npm run key:find <ns.key.path>                  # Find code references to a translation key
npm run key:rm <ns.key.path>                    # Remove a key from every catalog (refuses while still referenced)
```

The full workflow (adding, editing, and removing languages; backend gettext
catalogs) is in [docs/i18n.md](../docs/i18n.md).

### Docker

```bash
# The `ui` service is the nginx production build. The API URL is runtime
# config (API_URL -> /config.js); only VITE_APP_VERSION is baked at build time.
# For frontend work run the dev server on the host instead:
./dev.sh frontend   # Vite + hot reload on UI_PORT, VITE_* from .env
```

The UI imports the shared registries from `backend/common/languages.json` and
`backend/common/fonts.json` via relative paths that escape `frontend/` (the same
reason `vite.config.ts` lets the dev server serve from the repo root). The
production image build therefore needs those files at their repo-relative paths:
compose passes the backend tree as a named build context
(`additional_contexts: backend: ./backend`) and the Dockerfile copies each
registry to `/backend/common/<name>.json`. A hand-rolled `docker build` from
`frontend/` needs the same context (`--build-context backend=../backend`). The
`node` tools container gets the files via a read-only `./backend:/backend` bind
mount instead, so imports that escape `frontend/` resolve there too.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_URL` | Backend API base URL in Docker: the `ui` container writes it into `/config.js` at startup | `http://localhost:8000/api` |
| `DEMO_MODE` | Disable registration in Docker (optional; in `prod/` the same variable the backend reads) | `false` |
| `VITE_API_URL` | Backend API base URL for the Vite dev server (root `.env`); the dev compose also maps it into the `ui` container's `API_URL` | `http://localhost:8000/api` |
| `VITE_DEMO_MODE` | Disable registration on the Vite dev server (optional; root `.env`); the dev compose also maps it into the `ui` container's `DEMO_MODE` | `false` |
| `VITE_PORT` | Dev server port (optional) | `5173` (Vite default) |
| `VITE_APP_VERSION` | App version shown in Settings (baked at image build time) | `dev` |

## Development Notes

### React Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 minutes
      retry: 1,
    },
  },
});
```

The client lives in `src/api/queryClient.ts` (its own module, so `main.tsx` and the
contexts can both import it without a cycle). On workspace switch/create/delete the
whole cache is removed except a keep-set of user-scoped keys (`user-preferences`,
`2fa-status`, `extraction-config`) - mounted queries refetch immediately, so nothing
from the previous workspace survives the switch.

The domain list hooks in `hooks/useDomain.ts` set `refetchOnWindowFocus: 'always'`:
each browser tab keeps its own cache (a mutation in another tab can't invalidate this
one) and the app-wide 5-minute `staleTime` would otherwise mark a list fresh and skip
the default stale-only focus refetch - so these cheap list GETs converge whenever the
user looks at the tab again.

### Query Keys

```typescript
// Consistent query key patterns
['accounts', includeArchived]
['budgets', includeInactive]
['budget-summary', budgetId, periodId]
['transactions', page, filters]
['transaction-attachments', transactionId]
['attachment-blob', transactionId, attachmentId]  // immutable files: staleTime/gcTime Infinity; the cache owns the object URL
['current-balances', includeArchived]
['workspace-members', workspaceId]
['workspace-settings']  // personal page-defaults blob - workspace-scoped (purged on switch), never in the user keep-set
```

### Mutations

```typescript
const mutation = useMutation({
  mutationFn: api.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['resource'] });
    toast.success('Created successfully');
  },
  onError: (error) => {
    toast.error(error.response?.data?.detail || 'Failed');
  },
});
```

## Styling

### Design System

The app uses an **Architectural Ledger** design system with CSS custom properties in `src/index.css` mapped to Tailwind utility classes via a CSS-first `@theme inline` block (Tailwind CSS 4; no `tailwind.config.js`).

Visual separation uses flat surfaces with borders (`border border-border`) - no gradients or box shadows.

### Tailwind Theme

- **Colors**: 20 CSS custom property tokens (brand, surfaces, borders, text, semantic/financial, budget ledger columns, overlays)
- **Font families**: Geist (`font-sans`) and JetBrains Mono (`font-mono`)
- **Border radius**: `rounded-sm` (4px) and `rounded-none` (0px)
- **Z-index**: Named scale from 100 (dropdowns) to 700 (tooltips)

### Color Tokens

| Use | Token | Tailwind Class |
|-----|-------|----------------|
| Brand / CTAs | `--color-primary` | `bg-primary`, `text-primary` |
| Page background | `--color-background` | `bg-background` |
| Cards, panels | `--color-surface` | `bg-surface` |
| Surface hover | `--color-surface-hover` | `bg-surface-hover` |
| Muted surface | `--color-surface-muted` | `bg-surface-muted` |
| Default borders | `--color-border` | `border-border` |
| Focus rings | `--color-border-focus` | `ring-border-focus` |
| Primary text | `--color-text` | `text-text` |
| Secondary text | `--color-text-muted` | `text-text-muted` |
| Success / income | `--color-positive` | `text-positive`, `bg-positive` |
| Error / expense | `--color-negative` | `text-negative`, `bg-negative` |
| Warnings | `--color-warning` | `text-warning`, `bg-warning` |

> **Dark mode:** a `.dark` block in `src/index.css` overrides all 20 tokens above - see [`design/dark-mode.md`](../design/dark-mode.md) §1. Because `--color-primary` inverts to a light value, a centralized `.dark .bg-primary.text-white { color: var(--color-background); }` rule keeps primary buttons legible.

### Icons

All icons use **Lucide React** exclusively:

```tsx
import { Plus, Pencil, Trash2, X, ChevronDown } from 'lucide-react'
<Plus size={14} />
```

### Fonts

Geist (sans) and JetBrains Mono (monospace) are self-hosted: the woff2 files live in `public/fonts/`, declared by the `@font-face` block at the top of `src/index.css`, and served same-origin from `/fonts/` (nginx, 1-year immutable cache). No icon fonts.
