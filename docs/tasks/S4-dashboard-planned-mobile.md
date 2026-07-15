# S4 — Dashboard + Planned mobile pass

Size **S/M** · Deps: M4, M7 · Plan: `IMPLEMENTATION_PLAN.md`

## Objective
First screen after mobile login fully informative with zero horizontal page scroll; Planned
operable one-handed. Both pages were already close (single-column grids, M7 row sheets on
Planned) — this pass is layout hardening.

## Changes
- **`SegmentedControl.tsx`** (primitive): segment buttons get `max-sm:min-h-[44px]` — fixes
  the Planned status filter and the transaction type control everywhere at once.
- **`Dashboard.tsx`**: `p-6 max-sm:p-0`; "View all →" links get `touch-hit`; account/amount
  rows get left-`truncate` + right-`whitespace-nowrap` so long account names and multi-currency
  amounts can't collide. (`BudgetInsights` already scrolls its table in its own
  `overflow-x-auto` container.)
- **`Planned.tsx`**: `p-6 max-sm:p-0`; "New planned" header button hidden `max-sm:` (FAB
  quick-add has Planned, decision 6); row amount block `flex-shrink-0` + nowrap.

## Done
375px: Dashboard renders budget insights, balances, and recent activity with no horizontal
page scroll; Planned filter segments are 44px; pending-row actions via tap sheet (M7). Desktop
unchanged. Lint + build clean.
