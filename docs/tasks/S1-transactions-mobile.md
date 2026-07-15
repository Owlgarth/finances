# S1 — Transactions mobile pass

Size **M** · Deps: M3, M4, M7 · Plan: `IMPLEMENTATION_PLAN.md` · Design:
`design/responsive.md` (mobile layout), `design/data-formatting.md` (truncation)

## Objective
The highest-traffic screen reads and operates like a native list at 375px. Row action sheets
(M7), adaptive Selects (M3), and the FAB (M4) already exist — this pass fixes layout and flow.

## Changes
- **Page padding**: wrapper `p-6` → `p-6 max-sm:p-0`. `MainLayout`'s mobile `<main>` already
  provides `px-4`; without this the page double-pads to 40px per side.
- **Header actions**: "From receipt" / "New transaction" buttons hidden `max-sm:` — the FAB
  quick-add owns creation on mobile (decision 6); a second pair of buttons is duplicate chrome.
- **Filters**: account/type Selects go full-width side-by-side on mobile
  (`max-sm:flex-1`); "Clear filters" gets a 44px target.
- **Row robustness at 375px**: meta line (date · category · account) becomes a single
  `truncate` string (`join(' · ')`) instead of a flex row that could wrap and grow the row;
  the amount block gets `flex-shrink-0` + `whitespace-nowrap` so multi-currency amounts
  (`−51.20 · $12.99 USD` secondary line) never collide with the description.
- **`TransactionFormModal`**: `inputMode="decimal"` on amount + original-amount inputs
  (mobile numeric keypad). Everything else already adapts via M2/M3/M6 primitives.

## Deviations from the plan summary
- "Active-filter chips dismissible" — skipped: the two Selects already display the active
  filter values on the same line; a chip row would duplicate them. Revisit if a third filter
  ever appears.
- Keyboard-safe submit is N2 (visualViewport work), not repeated here.

## Done
At 375px: no horizontal scroll; filters usable full-width; long description + original-amount
row stays one row tall (truncates, never wraps); amount keypad is numeric; add-expense =
FAB → New transaction → form (one-handed). Desktop unchanged. Lint + build clean.
