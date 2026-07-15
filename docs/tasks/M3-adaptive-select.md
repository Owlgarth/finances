# M3 — Adaptive Select

Size **M** · Deps: M2 · Plan: `IMPLEMENTATION_PLAN.md` · Design: `design/components.md`
(select), plan Part I (adaptive component pattern)

## Objective
`common/Select.tsx` becomes the first adaptive component: same exported API and props, desktop
keeps the current anchored dropdown verbatim, mobile presents the options as a bottom sheet of
full-width 44px rows (plan decision 4). Zero call-site changes.

## Read first
- `frontend/src/components/common/Select.tsx` (all of it — the keyboard/type-ahead logic stays)
- `frontend/src/components/common/BottomSheet.tsx` (M2)
- `.agents/skills/frontend-react/SKILL.md` (variant props: internal branch, not a sibling component)

## Shape
One file, one internal branch (skill guidance): `useBreakpoint().isMobile` selects the *panel*
presentation only — trigger button, `open` state, filtering, and `onChange` contract are shared,
so a resize across the breakpoint mid-open swaps presentation without losing anything (plan
decision 2).

- **Trigger**: unchanged (already `min-h-[44px]` on mobile). `aria-activedescendant` only
  applies on the desktop path (the sheet has no highlight concept / dangling ids otherwise).
- **Desktop panel**: byte-for-byte the current dropdown (keyboard nav, type-ahead, search).
- **Mobile panel**: `BottomSheet` (rendered whenever mobile so the exit animation can play;
  it no-ops when closed):
  - Option rows: full-width, `min-h-[44px] px-4 text-sm`, `Check` (16px) on the selected row,
    `active:bg-surface-hover` press feedback, `font-mono` rows when `mono`.
  - `searchable`: input pinned via `sticky` just below the drag handle (not auto-focused —
    popping the keyboard on open is hostile; the user taps it when needed). M1's global rule
    gives it 16px.
  - On open, the selected option scrolls into view (centered).
  - Scrim tap / Escape close and return focus to the trigger (via M2's `useOverlay`).
- `error`, `disabled`, `placeholder`, `mono`, `id` behave identically in both variants.

## Done
- Every existing `<Select>` call site (transaction filters, forms, pagination page-size)
  presents a sheet on mobile and the unchanged dropdown on desktop — no call-site diffs.
- Desktop keyboard behavior (arrows, Home/End, Enter/Space, Escape, Tab, type-ahead, search)
  unchanged.
- Selecting from the sheet fires `onChange` once and closes with the exit animation; reopening
  a long list shows the selected option without manual scrolling.
- Resize across 640px while open keeps the parent form's value intact.
- `npm run lint` + `npm run build` clean.
