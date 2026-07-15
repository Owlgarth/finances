# M1 — Breakpoint + device foundation

Size **S** · Deps: — · Plan: `IMPLEMENTATION_PLAN.md` · Design: `design/responsive.md`
(breakpoints, touch targets), `design/tokens.md`

## Objective
One canonical definition of "mobile / tablet / desktop" shared by JS and CSS, plus the viewport
plumbing every later mobile task depends on: `viewport-fit=cover`, safe-area utilities, a real
favicon, and the iOS input-zoom fix. Pure foundation — no visible redesign yet.

## Read first
- `.agents/skills/frontend-react/SKILL.md`
- `design/responsive.md` (breakpoint table)
- `frontend/src/hooks/useMediaQuery.ts` (stays as the low-level primitive)
- `frontend/src/components/layout/MainLayout.tsx` (current ad-hoc 767px/1023px queries)

## Decision: breakpoint boundaries snap to Tailwind
`design/responsive.md` writes the ranges as ≤640 / 641–1024 / ≥1025. Tailwind's default screens
put `sm` at 640px and `lg` at 1024px, and existing code already uses `max-sm:` for mobile styling
(`Modal.tsx`). To guarantee the JS hook and CSS classes can never disagree at a boundary pixel,
the hook snaps to Tailwind's boundaries:

| Tier | JS query | Matching Tailwind prefix |
|---|---|---|
| Mobile | `(max-width: 639.98px)` | `max-sm:` |
| Tablet | `(min-width: 640px) and (max-width: 1023.98px)` | `sm:` … `max-lg:` |
| Desktop | `(min-width: 1024px)` | `lg:` |

This is a deliberate deviation from the doc's off-by-one prose numbers (decision 10 in the plan);
D1 updates `responsive.md` to state the Tailwind-aligned ranges.

## Create: `frontend/src/hooks/useBreakpoint.ts`
- `useBreakpoint(): { isMobile, isTablet, isDesktop }` — three `useMediaQuery` calls with the
  queries above (exported as constants so tests/other code reference one definition).
- `useIsTouch(): boolean` — `(pointer: coarse)`. For behavior that follows the input device
  rather than the viewport (hover reveals, hit areas). Not used yet; consumed by M7.

## Modify
- **`MainLayout.tsx`** — replace the inline `useMediaQuery('(max-width: 767px)')` /
  `(min-width: 768px) and (max-width: 1023px)` pair with `useBreakpoint()`. Behavior otherwise
  unchanged (drawer still exists until M4); the mobile layout now engages at <640px and tablet
  auto-collapse covers 640–1023px.
- **`index.html`** — viewport becomes
  `width=device-width, initial-scale=1.0, viewport-fit=cover` (required for
  `env(safe-area-inset-*)` to be non-zero on notched devices). Favicon: replace `/vite.svg` with
  `/favicon.svg` (new asset: monochrome "D" mark on `#171717`, `rounded` corners, works on light
  and dark tabs; full PWA icon set is N1's job).
- **`index.css`** — two additions:
  1. Safe-area utilities in `@layer utilities`: `.pb-safe`, `.pt-safe`, `.pl-safe`, `.pr-safe`
     (`padding-*: env(safe-area-inset-*)`) and `.pb-safe-offset-*` is NOT needed — fixed bars
     that want "own padding + inset" compose via `calc` at point of use or stack padding on a
     child. Keep it to the four plain utilities.
  2. iOS zoom fix in a plain media query after the layers: on `(max-width: 639.98px)`,
     `input:not([type='checkbox']):not([type='radio'])`, `select`, `textarea` get
     `font-size: 16px !important`. The `!important` is required to beat utility classes like
     `text-xs` (12px) on ~28 files of raw inputs; this single rule is the documented
     "primitive level" application of plan decision 9. Buttons excluded (no zoom on focus).

## Out of scope
Bottom nav (M4), input *height* / touch-target sizing (M7), PWA manifest + icon set (N1),
`responsive.md` doc update (D1).

## Done
- `grep -rn 'max-width: 7' frontend/src` → nothing; the only viewport queries outside
  `useBreakpoint.ts` are Tailwind classes and `useBreakpoint`'s own constants.
- iOS Safari (or simulator): focusing the transaction description input does not zoom.
- With `viewport-fit=cover` a notched simulator shows page background (not clipped content)
  behind the home indicator; `.pb-safe` pads when applied to a fixed bottom element.
- Browser tab shows the Denarly favicon in light and dark themes.
- `npm run lint` and `npm run build` clean; desktop layout pixel-identical.
