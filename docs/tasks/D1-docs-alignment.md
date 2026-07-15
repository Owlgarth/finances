# D1 — Design docs + skill alignment

Size **S/M** · Deps: M1–M7 (finalized after S/N tracks) · Plan: `IMPLEMENTATION_PLAN.md`

## Delivered
- **`design/responsive.md`**: breakpoints restated as Tailwind-snapped (<640 / 640–1023 /
  ≥1024) with `useBreakpoint()`/`useIsTouch()` as the canonical source; mobile row actions =
  tap → ActionSheet (replaced "swipe or long-press"); bottom-nav state table aligned with
  `components.md` §19 (labels always, `text-primary` active, 20px icons); documented
  `.touch-hit`, the `max-sm:min-h-[44px]` button floor, and the 16px mobile input exception.
- **`design/components.md`**: new §21 — BottomSheet + ActionSheet anatomy and the adaptive
  Select/DatePicker note.
- **`design/patterns.md`**: new §13 — adaptive-component rules (one API, internal branch,
  state above variants, CSS → breakpoint → touch escalation) and the FAB quick-add flow.
- **`.agents/skills/frontend-react/SKILL.md`**: breakpoint section rewritten (replaces the
  old "md-first" rule); modal section now mandates `common/Modal` / `BottomSheet` /
  `ActionSheet` instead of hand-rolled overlays; mobile rules (16px inputs, `inputMode`,
  44px targets, no hover-gated actions on touch).
- **`docs/mobile-ux.md`** (new): platform-independent interaction spec for future mobile
  clients — principles, navigation model, per-screen patterns, platform mechanics, known gaps.

## Done
`grep -rni 'hamburger|swipe or long-press|drawer' design/ docs/mobile-ux.md` → nothing;
no ad-hoc width queries outside `useBreakpoint.ts`; docs match shipped behavior.
