# M6 — Adaptive DatePicker

Size **S/M** · Deps: M2 · Plan: `IMPLEMENTATION_PLAN.md` · Design: `design/responsive.md`
(touch targets), `.agents/skills/frontend-react` (third-party theming: scoped wrapper classes)

## Objective
`DatePicker`'s popup variant becomes adaptive: on mobile the calendar opens in a `BottomSheet`
with ≥44px day cells and a "Today" shortcut; desktop popup and the `inline` variant unchanged.

## Shape
- Mobile panel: `BottomSheet` wrapping a `DayPicker` themed by the existing `rdp-inline` class
  plus a new `rdp-sheet` scope that bumps the day/nav button size vars to 44px (`2.75rem`) —
  same CSS-variable override technique, scoped so desktop popup/inline keep their compact
  geometry. Footer: full-width "Today" button (44px).
- Trigger: the readOnly input opens the sheet **on click, not focus** on mobile — M2's
  `useOverlay` restores focus to the input when the sheet closes, and a focus-opened sheet
  would immediately reopen (focus loop). Desktop keeps focus-open.
- Selecting a day fires the same `onChange` (yyyy-MM-dd) and closes with the exit animation.

## Done
Mobile: tapping the date field in the transaction form opens a full-width calendar sheet with
comfortably tappable days; picking a day fills the input and closes; sheet does not reopen by
itself after closing. Desktop popup and inline calendar pixel-identical. Lint + build clean.
