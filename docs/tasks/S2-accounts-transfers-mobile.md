# S2 — Accounts + Transfers mobile pass

Size **S/M** · Deps: M3, M7 · Plan: `IMPLEMENTATION_PLAN.md`

## Objective
Account lifecycle and transfers fully comfortable at 375px. Cards were already full-width
(`grid-cols-1 md:grid-cols-2`); this pass fixes action ergonomics and row layout.

## Changes (`AccountsPage.tsx` unless noted)
- Page padding `p-6` → `p-6 max-sm:p-0` (MainLayout provides mobile padding).
- Header: "Transfer" button hidden `max-sm:` (the FAB quick-add has Transfer); "New account"
  stays — it's the one creation the FAB doesn't cover (admin-gated, infrequent).
- **Card actions on touch**: card tap opens an `ActionSheet` (Set balance… / Edit /
  Archive|Unarchive / Delete when archived, destructive); the inline text-link row is not
  rendered on touch (small targets, decision 7 pattern). Desktop unchanged.
- "Show archived" checkbox label gets a 44px min-height on mobile.
- **Recent transfers rows**: left side becomes a truncating title line (route + description)
  over the date; amount block `flex-shrink-0`, and cross-currency renders the `→ to_amount`
  as a second small line instead of one long nowrap string that would overflow 375px.
  "Repeat" icon button gets `touch-hit`.
- `SetBalanceModal` / `TransferModal` (×2) / `AccountFormModal` amount inputs:
  `inputMode="decimal"`.

## Done
At 375px: create → set balance → archive → delete an account entirely via card taps and
sheets; cross-currency transfer row shows both amounts without horizontal overflow; amount
fields open the numeric keypad. Desktop unchanged. Lint + build clean.
