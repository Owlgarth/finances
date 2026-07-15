# M4 — Mobile navigation shell

Size **L** · Deps: M2 · Plan: `IMPLEMENTATION_PLAN.md` · Design: `design/components.md` §19
(Bottom Navigation), `design/responsive.md` (mobile layout)

## Objective
Replace the mobile hamburger + drawer with the spec'd bottom navigation: 4 tabs + center FAB,
a "More" sheet for overflow destinations and workspace/user controls, and a quick-add action
sheet on the FAB (plan decisions 5–6). The fixed mobile top bar is removed entirely — pages
already carry their own `h1` headers, and `responsive.md`'s mobile spec has no top bar.

## Read first
- `design/components.md` §19 (exact bar/FAB anatomy — 20px icons, 10px uppercase labels,
  `z-bottom-nav`, safe-area padding)
- `frontend/src/components/layout/MainLayout.tsx` (mobile branch being replaced)
- `frontend/src/components/layout/WorkspaceSelector.tsx` + `UserMenu.tsx` (logic to re-house
  as sheet rows — the dropdown components themselves stay desktop-only)
- `frontend/src/hooks/usePermissions.ts` (`canWrite` gates the FAB),
  `useDomain.ts` (`useExtractionEnabled` gates the receipt action)

## Spec resolutions (flagged for D1)
- `components.md` §19's example shows labels on **all** tabs; `responsive.md`'s nav-state table
  says inactive = icon only. Follow §19 (labels always) — native tab bars keep labels, and it
  avoids layout shift on tab change.
- Active tab color: §19 `text-primary` (identical to `text-text` in light theme; correct
  inversion in dark).

## Create: `frontend/src/components/layout/BottomNav.tsx`
Self-contained (MainLayout's mobile branch renders `<main>` + `<BottomNav />`, nothing else):

- **Bar**: fixed bottom, `z-bottom-nav bg-surface border-t border-border pb-safe`; slots
  Dashboard "HOME" (`Home`) · Transactions "TXNS" (`Receipt`) · FAB · Budgets "BUDGETS"
  (`PieChart`) · More "MORE" (`MoreHorizontal`). Tabs are `NavLink`s, 44px targets, 20px icons,
  10px uppercase labels. "More" shows active when the current route is one of its destinations.
- **FAB**: 48px `bg-primary rounded-sm border border-border`, `Plus` 20px, raised `-mt-5`,
  `active:scale-95`. Rendered only when `canWrite` and a workspace exists (viewers get an
  empty center slot — bar geometry stays stable). Opens the quick-add `ActionSheet`:
  New transaction · Transfer · From receipt (only when extraction enabled) · Planned —
  wired to the existing `TransactionFormModal` / `TransferModal` / `NewFromReceiptModal` /
  `PlannedFormModal` (all take `{ open, onClose }`), owned here so quick-add works on any route.
- **More sheet** (`BottomSheet`): 44px rows —
  1. Destinations: Accounts (`Wallet`), Planned (`Calendar`), Members (`Users`), Settings
     (`Settings`); active row highlighted; closes on navigate (and on any route change).
  2. Workspace section: row per workspace (check = current, spinner while switching, role
     badge) using `useWorkspace().switchWorkspace`; "Create workspace" swaps the sheet body to
     the existing `CreateWorkspaceForm compact`; "Workspace settings" opens
     `WorkspaceSettingsPanel` (rendered by BottomNav on mobile since the Sidebar isn't mounted).
  3. User section: email (muted, non-interactive), Dark mode row (`Switch`,
     `useTheme().toggleTheme`), Logout (`useAuth().logout`).

## Modify: `MainLayout.tsx`
Mobile branch: delete the fixed top bar, `mobileOpen` state, drawer overlay, its Escape and
route-change effects. Render `<main>` with `px-4`, top padding `calc(1rem +
env(safe-area-inset-top))` (standalone-PWA status bar), bottom padding `calc(4.5rem +
env(safe-area-inset-bottom))` (72px clears bar + raised FAB per `responsive.md`), then
`<BottomNav />`. Tablet/desktop branch untouched.

## Out of scope
Page-level header/content adjustments (S-track); drag gestures (N2); `WorkspaceSettingsPanel`'s
own mobile layout (S-track pass touching it).

## Done
- No hamburger/drawer code remains; every destination reachable in ≤2 taps from anywhere.
- FAB → New transaction works from all 7 routes; viewer accounts see no FAB and an
  evenly-spaced 4-tab bar.
- Workspace switch, create, dark-mode toggle, and logout all work from the More sheet.
- Bar respects the home-indicator inset; open sheets/modals cover the bar (z-order).
- Desktop/tablet pixel-identical; `npm run lint` + `npm run build` clean.
