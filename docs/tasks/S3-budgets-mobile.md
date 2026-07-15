# S3 — Budgets + Budget detail mobile pass

Size **M** · Deps: M3, M7 · Plan: `IMPLEMENTATION_PLAN.md` · Design: `design/responsive.md`
(tables: horizontal scroll, 32px rows, never truncate amounts — plan decision 8)

## Objective
The monthly ritual (open budget → tweak planned amounts → check remaining) works one-handed
at 375px, without abandoning the ledger table density.

## Changes

### `BudgetsPage.tsx`
- `p-6 max-sm:p-0`; budget card links get `active:bg-surface-hover`; "Every N weeks" input
  `inputMode="numeric"`.

### `BudgetDetailPage.tsx`
- `p-6 max-sm:p-0`; back link gets a 44px-friendly hit area.
- **Header wraps** (responsive.md: title first line, actions below): the period switcher
  drops to its own full-width row on mobile — arrows flank a flex-1 period Select (which is a
  sheet on mobile via M3); arrows get `touch-hit`.
- **Table**: keeps 32px rows + horizontal scroll (decision 8). The Category column becomes
  `sticky left-0 bg-surface` (with `z-10` over the scrolling cells and a max-width + ellipsis
  on mobile) so the row identity never scrolls away while comparing amount columns.
- **Planned cell editing**: the tap target becomes the whole cell (`w-full text-right`
  button), not just the number glyphs; the editor input gets `inputMode="decimal"` and the
  confirm/cancel icon buttons get `touch-hit`.

## Done
At 375px: sticky category column while amount columns scroll; tapping any planned cell opens
the numeric keypad; period switching via arrows or sheet; header never overflows. Multi-
currency budgets get one column group per currency, scrollable, amounts untruncated. Desktop
unchanged. Lint + build clean.
