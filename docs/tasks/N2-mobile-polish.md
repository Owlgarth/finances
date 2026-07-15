# N2 — Mobile polish pass

Size **M** · Deps: M2, M4 · Plan: `IMPLEMENTATION_PLAN.md`

## Delivered
- **Overscroll containment**: `overscroll-contain` on the BottomSheet panel — reaching the
  end of a sheet's scroll never chains into scrolling the page behind it (the scrim/scroll
  lock handles wheel; this handles touch momentum).
- **Keyboard avoidance** (`useKeyboardInset` in `BottomSheet.tsx`): iOS doesn't shrink the
  layout viewport for the on-screen keyboard, so bottom-fixed sheets would hide their submit
  row behind it. The hook reads `visualViewport` (resize + scroll) and lifts the sheet by the
  overlap, capping panel `max-height` to the remaining visible space. No-op where
  `visualViewport` is unavailable or the keyboard is closed.
- **Per-tab scroll memory** (`useMobileScrollRestoration` in `MainLayout.tsx`, mobile only):
  scroll position saved per pathname (passive scroll listener), restored on route change with
  `useLayoutEffect` — switching bottom-nav tabs behaves like native tab stacks instead of
  inheriting the previous page's offset.
- **Reduced motion**: global `prefers-reduced-motion` rule collapsing all transition/animation
  durations to 1ms (preserving `forwards` end states), complementing M2's per-class opt-outs.

## Deliberately skipped
- `-webkit-overflow-scrolling: touch` — obsolete; all overflow scrolling has momentum since
  iOS 13.
- Disabling body pull-to-refresh — no destructive in-flight state exists on these pages, and
  standalone PWA launches have no refresh gesture anyway.
- Drag-to-dismiss gesture on sheets — still deferred; the handle remains a visual affordance
  (tracked as a possible follow-up, not required for v1).

## Done
On a real device: a sheet form with the keyboard open keeps its inputs and submit button
visible; sheet overscroll doesn't move the page; tab switching restores each page's scroll;
OS reduced-motion renders sheets/nav without animation. Lint + build clean.
