---
name: frontend-live-stack-probing
description: Interactive verification of the Owlgarth Finances frontend against a live dev stack - browser probe harnesses (Playwright/puppeteer-core + system Chrome), API-driven auth and scenario seeding, port-shifted stacks, probing by bug class, static-fallback discipline when no stack is available. Use when a task's mandate includes interactive or manual verification of frontend behavior, when reproducing or accepting a UI/state bug live, or when assembling a throwaway browser-automation harness against the dev stack.
---

# Frontend Live-Stack Probing

The frontend has no test runner - lint + build are the only automated gates - so interactive
verification is a first-class activity, not a fallback. This harness shape is validated across
sessions (custom-period PR #81 triage + acceptance; budget-period-picker PR #84 full
interactive pass): build the harness once, then reuse it for diagnosis AND acceptance in the
same session - in PR #81 it paid for itself twice.

## Drive system Chrome, not a downloaded browser

- puppeteer-core (PR #81) or Playwright (PR #84) with the system Chrome binary - no browser
  download step, no extra network dependency. puppeteer-core ships no browser at all (that is
  the point of `-core`); Playwright reaches system Chrome via `channel: 'chrome'` or an
  explicit `executablePath`.
- The probe is a throwaway script, not test infra: seed, assert, screenshot, exit. Nothing
  lands in `frontend/src/`.

## Authenticate and seed through the API, never the UI

- Registration requires the CURRENT legal acceptance versions - fetch them from `/api/legal/*`
  and send them with the register call, or registration fails. (`DEMO_MODE=true` on the
  backend disables registration entirely with a 403.)
- Fast path when a token already exists: seed `localStorage` directly (`owlgarth_token`,
  `owlgarth_refresh_token` - see Token Storage in `frontend-react`) instead of driving the
  login form.
- Scenario data via endpoints, not clicks: PR #84 materialized 36 periods by looping the lazy
  current-period endpoint instead of clicking chevrons 35 times. UI-driven setup couples the
  probe to the very behavior under test.
- Clean up with `DELETE /api/users/me` - removes the seeded user and its workspace data.

## The stack: check ports before you build on it

- Another checkout may already hold the default ports - `docker ps` first, shift
  `API_PORT`/`UI_PORT` rather than stopping someone's containers.
- The shift is a triple: `VITE_API_URL`, `CORS_ALLOWED_ORIGINS`, and `FRONTEND_URL` do NOT
  derive from `API_PORT`/`UI_PORT` (rule detail in `docker-infra`). Missing one silently
  splits frontend/backend across checkouts - confirm the UI actually reaches YOUR api before
  debugging the product.

## Budget the fallback before assembling

- Gate the live-vs-static mode choice on a CHEAP availability check (`docker ps`, port probe)
  written into the task spec BEFORE any assembly. PR #87's session spent ~25k tokens
  investigating stack assembly (another checkout held the default ports) before the
  >30k-before-first-probe guardrail forced a static fallback - the check itself costs ~0.
- When assembly would burn the probe budget before the first probe, stop assembling: bank the
  static verification (lint/grep/build gates, code-level checks), mark behavioral items
  `[deferred - manual]`, and hand them to the PR visual gate - paste the task report's
  visual-gate block into the PR body verbatim so every deferred item has an owner. A
  half-assembled stack risks mid-pass context overflow and proves nothing.

## Probe by bug class

- Same-tab invalidation: SPA-link navigation, no reload. Cross-tab staleness: two real tabs
  plus a focus event (`bringToFront()`). NEVER `page.goto()` between probe steps - a full
  load re-creates the JS heap and cold-resets the query cache, masking staleness probes AND
  every warm-path (remount) bug: a defect that needs a warm query cache (list -> detail ->
  back -> detail) reproduces only through chained in-page SPA navigations (`anchor.click()`,
  `history.pushState` + `popstate`, app events like `owlgarth:open-page-search`). Treat the
  reported viewport or classification as a hypothesis - "mobile-only" was a workflow artifact
  (bottom-nav flows warm-re-enter while desktop sessions cold-load). (Rule detail under State
  Refresh After Mutations in `frontend-react`.)
- Cascade and sizing claims are settled against the COMPILED stylesheet, never the source
  className string. A static headless-Chrome harness (`--headless=new --dump-dom`, page
  script writes measured element rects into the DOM) linked against `dist/assets/index-*.css`
  with the real class strings needs no dev stack and settles the claim in minutes - canonical
  instance: Tailwind v4's alphabetical utility emission made a shared base `w-full` silently
  void caller width classes (trap detail under Responsive Breakpoints in `frontend-react`).
- Environmental defects (error-gate bugs): a clean run on a healthy stack proves nothing -
  "cannot reproduce" means the trigger is environmental (a failed request), not absent.
  Intercept and force-fail the dependency (request interception blocking the endpoint the
  code under test consumes) before concluding already-fixed: an `isSuccess`-only gate fed by
  a `retry: false` query only shows its failure mode under induced failure - the dead
  period-picker on budget open passed every naive probe and surfaced only when
  `GET /api/budgets/{id}/periods/current` was blocked.

## Trust the driver less than the product

- In PR #84's pass, 3 of 17 driver failures were bugs in the probe script itself (wrong
  expectation order, a hover auto-scroll invalidating a later centering check, asserting a
  chip the spec says is absent). A failing assertion is a hypothesis - re-derive the
  expectation from the spec before blaming the product.
- `elementHandle.click()` on options inside a height-capped scrollable panel auto-scrolls
  the container and can click THROUGH to whatever sits underneath the intended option -
  coordinates and scroll state are the driver's, not the page's truth. Prefer a DOM
  `el.click()` dispatch (no coordinate dependency) for listbox options inside scrollables.
- Media features are emulator settings, not CSS edits: reduced motion goes through
  Playwright's `page.emulateMedia({ reducedMotion: 'reduce' })` / CDP media emulation.
