# M5 — Tablet sidebar spec alignment

Size **S** · Deps: M1 · Plan: `IMPLEMENTATION_PLAN.md` · Design: `design/responsive.md` (tablet)

## Objective
Make the 640–1023px collapsed sidebar match the `responsive.md` tablet spec item by item.

## Gaps found (audit of `Sidebar.tsx` / `MainLayout.tsx`)
| Spec | Code today |
|---|---|
| Sidebar width 56px | `w-16` (64px) collapsed |
| Context selector icon-only (no workspace text) | `WorkspaceSelector` hidden entirely when collapsed |
| Nav icons + tooltip on hover | ✓ (`title` attr) |
| Avatar shown, name hidden (user menu) | ✓ (`UserMenu collapsed`) |
| Auto-collapse on tablet | ✓ (M1 moved it to the canonical breakpoint) |

## Changes
- `Sidebar.tsx`: collapsed width `w-16` → `w-14` (56px). Applies to desktop manual collapse
  too — one collapsed geometry everywhere.
- `WorkspaceSelector.tsx`: new `collapsed` opt-in prop (skill variant-prop pattern) — trigger
  becomes an icon-only `Landmark` button (44px hit area, `title` = workspace name); the panel
  anchors `left-0 w-64` so it escapes the 56px rail instead of squeezing into it.
- `Sidebar.tsx`: render the collapsed selector in the rail (between logo and nav) instead of
  hiding it.

## Done
Tablet viewport (e.g. 800px): 56px rail with logo toggle, workspace icon (opens a usable
switcher panel), nav icons with tooltips, user avatar; no text labels anywhere in the rail.
Desktop expand/collapse still works and persists. Lint + build clean.
