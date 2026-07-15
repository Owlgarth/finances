# N1 — PWA shell

Size **S** · Deps: M1 · Plan: `IMPLEMENTATION_PLAN.md`

## Objective
"Add to Home Screen" launches Denarly full-screen with correct icon, name, and status-bar
color in both themes. No service worker / offline — install shell only (a Capacitor or native
wrapper later reuses these assets).

## Delivered
- `public/manifest.webmanifest` — name/short_name, `display: standalone`, light theme/
  background colors, icon set.
- Icons generated from the favicon mark: `icon-192.png`, `icon-512.png` (transparent rounded
  rect, purpose `any`), `icon-maskable-512.png` + `apple-touch-icon.png` (180px) rendered from
  `icon-maskable.svg` — full-bleed ink with the mark in the central safe zone, since maskable/
  iOS icons get platform-applied corners.
- `index.html`: manifest link; `theme-color` pair (`#FAFAFA` light / `#0A0A0A` dark, media-
  queried); `apple-touch-icon`; `mobile-web-app-capable` + the three `apple-mobile-web-app-*`
  metas. (`viewport-fit=cover` + safe-area padding shipped in M1/M4 — standalone mode is where
  they actually engage.)

## Known limitation
`theme-color` follows the OS scheme, not the in-app `denarly_theme` override (a user forcing
dark in a light OS gets a light status bar). Fixable later by stamping `theme-color` from the
theme context; not worth JS in the install shell now.

## Done
Lighthouse "installable" checks pass (manifest + icons + viewport); Add to Home Screen on
iOS/Android shows the D icon and launches standalone without browser chrome; status-bar area
matches the page background in both OS themes.
