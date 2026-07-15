# M7 — Touch interaction sweep

Size **M** · Deps: M2 · Plan: `IMPLEMENTATION_PLAN.md` · Design: `design/responsive.md`
(touch targets, row actions), plan decision 7

## Objective
No action in the app requires hover; interactive elements meet 44px targets on touch devices.
Keyed on `useIsTouch()` (`pointer: coarse`) rather than viewport width — a narrow desktop
window keeps hover affordances; a landscape tablet gets touch behavior.

## Audit (repo-wide `opacity-0` / `group-hover` grep)
| Site | Verdict |
|---|---|
| `Transactions.tsx:144` edit/delete revealed on row hover | Fix: row tap → `ActionSheet` on touch |
| `Planned.tsx:114` execute/edit/delete on row hover | Fix: same (pending rows only) |
| `TransactionAttachments.tsx:109,125` tile delete/extract on hover | Fix: always visible on coarse pointers |
| `SortableTh.tsx:44` sort-direction icon hidden until active | Leave — state indicator, tap-to-sort works |
| `BudgetInsights.tsx:161` hover row highlight | Leave — cosmetic |

## Changes
- **CSS (`index.css`)**: `-webkit-tap-highlight-color: transparent` (we provide `active:`
  feedback instead); `.touch-hit` utility (`::after inset -8px`, the `responsive.md` hit-area
  expansion recipe); `@media (pointer: coarse) { .touch-reveal { opacity: 1 } }` to neutralize
  hover reveals that should stay put on touch (declared after `@tailwind utilities`, so it wins
  the tie against `.opacity-0`).
- **`Transactions.tsx` / `Planned.tsx`**: on touch + `canWrite`, rows open an `ActionSheet`
  (Edit / Delete; Planned pending rows add Execute; delete destructive-styled, chains into the
  existing `ConfirmDialog`); hover icon-buttons are **not rendered** on touch (invisible
  `opacity-0` buttons would still intercept taps); rows get `active:bg-surface-hover`.
- **`TransactionAttachments.tsx`**: add `touch-reveal` to the two overlay buttons.
- **`formStyles.ts`**: `primaryButtonClass`/`secondaryButtonClass` get `max-sm:min-h-[44px]`
  (Select trigger already has its 44px).
- **`Modal.tsx`** X button + **`Pagination.tsx`** prev/next buttons: `touch-hit`. The numbered
  page buttons stay 32px — they sit adjacent with 4px gaps, so ±8px hit expansion would overlap
  and misroute taps.

## Done
With touch emulation (or a phone): every row action in Transactions/Planned reachable via row
tap; attachment delete/extract visible without hover; no invisible tap targets; buttons ≥44px
on mobile. Desktop hover behavior unchanged. Lint + build clean.
