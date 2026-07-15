# Denarly — Mobile-Native UI Implementation Plan

**Status: approved.** Single source of truth for the mobile-native responsive UI
work. It supersedes the completed domain-redesign plan, archived verbatim at
`docs/plans/2026-06-domain-redesign-plan.md`. Authoritative design details live in
`design/responsive.md`, `design/components.md` (§19 Bottom Navigation), `design/patterns.md`,
and `design/tokens.md`. Tasks below are deliberately small; each is implementable in isolation
once its dependencies are done. Tasks specify behavior ("how it should work"), not code —
expand into a code-level spec when picking one up.

---

## Part I — Context (everything a task implementer needs to know)

### Goal
Make Denarly on a phone feel like a native application, not a shrunken website: bottom tab
navigation, bottom sheets instead of dropdowns and centered modals, 44px touch targets, no
hover-dependent affordances, safe-area awareness. The mobile web UX doubles as the **interaction
spec for future mobile clients** — every pattern shipped here (sheet anatomy, tab composition,
quick-add flow) is a decision a future native/Capacitor client inherits. Web and mobile may
diverge in *interaction* (dropdown vs. option-list sheet) but never in *capability* or data rules.

### The core architectural pattern: adaptive components
Callers never branch on device. A shared component decides its presentation internally:

```tsx
export default function Select<T>(props: SelectProps<T>) {
  const { isMobile } = useBreakpoint()
  if (isMobile) return <SelectSheet {...props} />   // bottom sheet, full-width option rows
  return <SelectDropdown {...props} />               // anchored dropdown panel (current)
}
```

Same props, same `onChange` contract, different presentation — every existing call site gets the
mobile behavior for free. Form/selection **state lives above the variant components**, so a
rotation or resize mid-interaction (variants swap live via media query) never loses user input.

Three levels of "different on mobile", used together, cheapest that suffices:
1. **CSS breakpoints** — same interaction, different layout (spacing, columns, wrapping).
2. **Adaptive rendering** (`useBreakpoint`) — different interaction pattern (dropdown → sheet,
   hover actions → action sheet, drawer → bottom nav).
3. **Capability detection** (`pointer: coarse`) — touch-specific behavior independent of width.

### Where we are vs. the design spec
`design/responsive.md` + `design/components.md` §19 already specify the target mobile system.
The implementation predates the spec and diverges:

| Area | Spec says | Code does today |
|---|---|---|
| Mobile breakpoint | ≤640px | `max-width: 767px` (`MainLayout.tsx`) |
| Mobile nav | Bottom nav, 5 slots, center FAB | Hamburger top bar + slide-in drawer |
| Tablet (641–1024) | 56px icon-only sidebar + tooltips | Auto-collapse at 768–1023 (close, unverified) |
| Modals on mobile | Bottom sheet, slide-up 120ms | Partially: `Modal.tsx` has `max-sm:` sheet styling, no animation/handle/scroll-lock |
| Select | (unspecified for mobile) | Anchored dropdown at all sizes |
| Row actions | Never hover-only on touch | `Transactions.tsx` uses `opacity-0 group-hover:opacity-100` |
| Touch targets | 44×44px minimum | Icon buttons ~26px (`p-1` + 13–14px icon) |
| Safe areas | `env(safe-area-inset-bottom)` on fixed bars | Not used; `viewport-fit=cover` missing from `index.html` |

Existing assets to build on: `useMediaQuery` hook, `Modal.tsx` scrim/panel structure, the
`z-bottom-nav`/`z-modal` z-index tokens in `tailwind.config.js`, `Transactions.tsx` already
renders a row list (not a table), Accounts/Budgets already render cards.

### Decisions already made (do not re-litigate)
| # | Decision |
|---|---|
| 1 | Canonical breakpoints per `design/responsive.md`: **mobile ≤640px, tablet 641–1024px, desktop ≥1025px**. One `useBreakpoint()` hook is the single definition; `MainLayout`'s 767px and the `frontend-react` skill's "md-first" rule are updated to match (skill update in D1, code in M1). |
| 2 | Adaptive components share one API; the variant switch lives inside the component; callers are device-agnostic; state lives above the variants (rotation-safe). |
| 3 | The **bottom sheet is the universal mobile container**: modals, selects, action menus, date picker, "More" navigation all use one `BottomSheet` primitive (drag handle, scrim dismiss, ≤92dvh, safe-area padding, body scroll-lock). |
| 4 | `Select` on mobile = sheet with full-width 44px option rows (check mark on selected); `searchable` keeps a pinned search input at the sheet top. |
| 5 | Mobile nav = bottom bar per `components.md` §19: **Dashboard · Transactions · [FAB] · Budgets · More**. The More sheet holds Accounts, Planned, Members, Settings, workspace switcher, user menu. Final tab composition may be revisited once in the task spec (M4), then frozen. |
| 6 | The center **FAB opens a quick-add action sheet**: New transaction, Transfer, From receipt (only when extraction enabled), Planned — available from every page. |
| 7 | Touch row actions: **tap the row → action sheet** (or detail). No hover reveals, no swipe/long-press for v1 — this *revises* `responsive.md`'s "swipe or long-press" line (doc updated in D1); swipe is a possible later enhancement. |
| 8 | Density is kept: 32px rows, 11–16px type. True tables (Budget detail, Members) horizontally scroll on mobile per spec — no table→card conversions; list-style rows (Transactions) stay lists. |
| 9 | Text inputs get **≥16px font-size on mobile** (iOS auto-zoom prevention) — a deliberate, documented exception to the type scale, applied at the primitive level. |
| 10 | Design docs in `design/` remain authoritative. Where implementation must deviate, the doc is updated in the same PR — never silently. |
| 11 | PWA-ready shell (manifest, standalone display, safe areas) ships in this plan; an actual store-distributed client (Capacitor/native) is **out of scope**, only enabled by it. |

### Verification standard (every task)
Follow the `frontend-react` skill; `npm run lint` clean. Verify in browser devtools at
**390×844** and **375×667** (portrait) plus a desktop width for regression; anything with fixed
bars or sheets also checked in landscape. Real-device (or simulator) check for tasks touching
safe areas, keyboard, or scroll behavior (M2, M4, S1, N2). Dark mode checked on every screen pass.

---

## Part II — Tasks

Sizing: **S** ≈ half a day, **M** ≈ a day, **L** ≈ 2–3 days of focused work.
**Detailed task specs** live in `docs/tasks/` (e.g. `docs/tasks/M1-breakpoint-foundation.md`) —
when a spec exists, it overrides the summary below. Specs are written in waves, only for tasks
whose dependencies are done or in flight. Wave 1: M1–M4.

**Branching:** tasks are individually mergeable to `main` — the desktop experience must never
regress mid-track. The only ordering constraint is the dependency graph.

### Track M — Mobile foundation (primitives; sequential unless noted)

**M1 — Breakpoint + device foundation (S)** · deps: —
Single `useBreakpoint()` hook (`{ isMobile, isTablet, isDesktop }`, decision 1 ranges, built on
`useMediaQuery`) + `useIsTouch()` (`pointer: coarse`). Migrate `MainLayout` off its ad-hoc
767px/1023px queries. `index.html`: `viewport-fit=cover`; app icon replaces the Vite favicon.
Safe-area utilities (e.g. `pb-safe`) in the Tailwind layer. Mobile input font-size ≥16px at the
form-primitive level (decision 9). *Done:* grep finds no ad-hoc mobile max-width queries outside
the hook; a notched-phone simulator shows no content under the home indicator; focusing an input
on iOS does not zoom.

**M2 — BottomSheet primitive + Modal unification (M)** · deps: M1
`common/BottomSheet.tsx`: scrim (tap to dismiss), drag-handle bar, slide-up 120ms
`cubic-bezier(0.32,0.72,0,1)` / slide-down 80ms exit, `max-h-[92dvh]` with internal scroll,
safe-area bottom padding, **body scroll-lock while open**, Escape + focus return. `Modal.tsx`
delegates to it on mobile (replacing the current static `max-sm:` classes) — all existing modals
become animated sheets with zero call-site changes. Plus `common/ActionSheet.tsx` on top of it:
a titled list of 44px action rows + destructive styling + cancel. *Done:* every existing modal
opens as a sheet on mobile with the spec'd motion; background never scrolls behind an open sheet;
desktop modals pixel-identical to before.

**M3 — Adaptive Select (M)** · deps: M2
Split `common/Select.tsx` per the Part I pattern: desktop keeps the current anchored dropdown
verbatim; mobile renders a `BottomSheet` — options as full-width 44px rows, `Check` on the
selected row, `searchable` pins the search input at the top, `error`/`disabled`/`mono` behave
identically. Same exported API, zero call-site changes. *Done:* every Select in the app (filters,
forms, pagination page-size) opens as a sheet on mobile; keyboard/type-ahead behavior on desktop
unchanged; a resize across 640px mid-open doesn't lose the selection in the parent form.

**M4 — Mobile navigation shell (L)** · deps: M2
Implement `components.md` §19 in `MainLayout`/new `layout/BottomNav.tsx`: 5 slots per decision 5,
`z-bottom-nav`, safe-area padding, 44px targets, active = `text-primary`. **More** opens a sheet
listing the remaining destinations + workspace switcher + user menu (reusing `WorkspaceSelector`/
`UserMenu` logic). **FAB** opens the quick-add sheet (decision 6) wired to the existing
transaction/transfer/receipt/planned modals from any route. Remove the hamburger drawer; the
mobile top bar slims to page context. Content gets `padding-bottom` clearing the bar. *Done:*
drawer code deleted; all 7 destinations reachable in ≤2 taps; recording an expense from the
Dashboard = FAB → New transaction → form; no layout shift on route change; tablet/desktop
untouched.

**M5 — Tablet sidebar spec alignment (S)** · deps: M1
Verify/align 641–1024px against `responsive.md`: 56px icon-only sidebar, tooltips on nav icons,
workspace selector and user menu icon-only. Fix drift found. *Done:* the `responsive.md` tablet
table matches reality item by item.

**M6 — Adaptive DatePicker (S/M)** · deps: M2
`DatePicker.tsx` mobile variant: inline calendar inside a `BottomSheet`, ≥44px day cells
(react-day-picker theming per the `frontend-react` third-party rules), today/clear affordances.
Desktop popover unchanged. *Done:* picking a date in the transaction form is comfortable
one-handed on 375px; no `rdp` style leaks to the desktop popover.

**M7 — Touch interaction sweep (M)** · deps: M2, and pairs with S-track
Repo-wide sweep: no `opacity-0 group-hover:` action reveals on touch — list rows get tap → 
`ActionSheet` (Edit / Delete / row-specific actions); interactive icons get ≥44px hit areas
(padding or `::after` expansion per `responsive.md`); pressed feedback via `active:` states;
UA tap-highlight replaced by ours. *Done:* auditing every screen with a mouse unplugged
(touch-emulation) reaches every action; no dead hover affordances remain on mobile.

### Track S — Screen passes (after M-track lands; S1–S6 parallelizable)

**S1 — Transactions mobile pass (M)** · deps: M3, M4, M7
Filters compact into a mobile filter row (account/type via adaptive Select or a filter sheet);
active-filter chips dismissible; row tap → action sheet (Edit / Delete); amount/description
layout tightened for 375px (truncation rules per `data-formatting.md`); form + receipt modals as
sheets with keyboard-safe submit; pagination controls 44px. *Done:* add-expense flow is
one-handed; long descriptions and multi-currency amounts never collide or wrap rows taller
than spec.

**S2 — Accounts + Transfers mobile pass (S/M)** · deps: M3, M7
Account cards full-width, tap → action sheet (Edit / Set balance / Transfer / Archive);
transfer + set-balance forms verified as sheets (amount inputs `inputmode="decimal"`); archived
toggle reachable. *Done:* full account lifecycle + a cross-currency transfer completed on 375px
without zooming or horizontal scroll.

**S3 — Budgets + Budget detail mobile pass (M/L)** · deps: M3, M7
Budget cards full-width. Detail page: category table keeps 32px rows with horizontal scroll
(decision 8) — category name column sticky, amount columns never truncated; planned-cell editing
on touch = tap → numeric editor (`inputmode="decimal"`); period switcher + budget settings +
category management as sheets. *Done:* the monthly ritual (open budget, tweak 5 planned amounts,
check remaining) is comfortable on a phone; sticky column scrolls correctly in both themes.

**S4 — Dashboard + Planned mobile pass (M)** · deps: M4, M7
Dashboard: balance cards 1-per-row, budget progress readable at 375px, recent records tappable;
`BudgetInsights` table scrolls horizontally within its container (page body never scrolls
sideways). Planned: rows + execute/edit/cancel via action sheet. *Done:* first screen after
mobile login is fully informative with zero horizontal page scroll.

**S5 — Members mobile pass (M)** · deps: M3, M7
`WorkspaceMembersPage` (largest page, desktop table): mobile = member rows (name, role badge,
status) with tap → action sheet (change role / remove / resend invite); invite flow as sheet;
desktop table unchanged. *Done:* an owner can invite and change a role entirely from a phone.

**S6 — Settings/Profile + auth + legal mobile pass (M)** · deps: M2
`ProfilePage` sections stack single-column; 2FA setup, recovery codes (copy targets 44px),
legacy import, delete/reset flows verified as sheets; Login/Register single-column with ≥16px
inputs; legal/consent pages readable. *Done:* register → 2FA setup → legacy import all
completable on a phone.

### Track N — Native shell readiness (N1 anytime after M1)

**N1 — PWA shell (S)** · deps: M1
Web app manifest (name, short_name, icons incl. maskable, `display: standalone`, theme/background
colors for both themes), iOS meta tags (`apple-mobile-web-app-*`, apple-touch-icon), Vite asset
wiring. No service worker / offline in this task. *Done:* Add to Home Screen on iOS + Android
launches full-screen with correct icon, name, and status-bar color in both themes.

**N2 — Mobile polish pass (M)** · deps: M2, M4
`overscroll-behavior` so sheet/list scrolling never chains to the page; momentum scrolling inside
sheets; keyboard avoidance for sheet forms (visualViewport — submit button never hidden behind
the keyboard); scroll position restoration per tab; `prefers-reduced-motion` disables sheet/nav
animations. *Done:* a form in a sheet with the keyboard open keeps its submit button visible on a
real device; no rubber-band scroll leaks; reduced-motion verified.

### Docs

**D1 — Design docs + skill alignment (S/M)** · deps: M1–M7 (start after M-track, finalize last)
Update `design/responsive.md` (breakpoint hook as canonical source, bottom nav shipped, row
actions = tap → action sheet per decision 7, 16px mobile input exception), `design/components.md`
(BottomSheet, ActionSheet, adaptive Select/DatePicker anatomy), `design/patterns.md` (adaptive
component pattern, quick-add flow), and the `frontend-react` skill (breakpoint rule replacing
"md-first", adaptive-component pattern, BottomSheet usage, input font-size rule). Add a short
`docs/mobile-ux.md` capturing the interaction spec for future mobile clients (decision framing
from Part I). *Done:* docs match shipped behavior; grep for "hamburger", "drawer", "swipe or
long-press" in design docs returns nothing stale.

---

## Progress Tracker
- [x] M1 Breakpoint + device foundation
- [x] M2 BottomSheet primitive + Modal unification
- [x] M3 Adaptive Select
- [x] M4 Mobile navigation shell
- [x] M5 Tablet sidebar spec alignment
- [x] M6 Adaptive DatePicker
- [x] M7 Touch interaction sweep
- [x] S1 Transactions mobile pass
- [x] S2 Accounts + Transfers mobile pass
- [x] S3 Budgets + Budget detail mobile pass
- [x] S4 Dashboard + Planned mobile pass
- [x] S5 Members mobile pass
- [x] S6 Settings/Profile + auth + legal mobile pass
- [x] N1 PWA shell
- [x] N2 Mobile polish pass
- [x] D1 Design docs + skill alignment

## Dependency Graph
```
M1 ─► M2 ─► M3 ─► S1, S2, S3, S5        M1 ─► N1
M1 ─► M4 ─► S1, S4                      M2, M4 ─► N2
M1 ─► M5                                M2 ─► M6, M7, S6
M7 ─► S1, S2, S3, S4, S5                M1–M7 ─► D1 (finalize after S/N)
```

## Suggested execution order
1. M1 → M2 (the two everything depends on)
2. M3 + M4 in parallel → M5, M6, M7
3. S1 (highest-traffic screen first) → S3 → S2, S4, S5, S6 in any order / parallel
4. N1 anytime after M1; N2 after the shell settles; D1 closes the plan
