---
name: frontend-live-stack-probing
description: Interactive verification of the Denarly frontend against a live dev stack - browser probe harnesses (Playwright/puppeteer-core + system Chrome), API-driven auth and scenario seeding, port-shifted stacks, probing by bug class, static-fallback discipline when no stack is available. Use when a task's mandate includes interactive or manual verification of frontend behavior, when reproducing or accepting a UI/state bug live, or when assembling a throwaway browser-automation harness against the dev stack.
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
- Fast path when a token already exists: seed `localStorage` directly (`denarly_token`,
  `denarly_refresh_token` - see Token Storage in `frontend-react`) instead of driving the
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
  plus a focus event (`bringToFront()`). NEVER `page.goto()` for staleness probes - a full
  load re-creates the query cache and masks both classes. (Rule detail under State Refresh
  After Mutations in `frontend-react`.)

## Trust the driver less than the product

- In PR #84's pass, 3 of 17 driver failures were bugs in the probe script itself (wrong
  expectation order, a hover auto-scroll invalidating a later centering check, asserting a
  chip the spec says is absent). A failing assertion is a hypothesis - re-derive the
  expectation from the spec before blaming the product.
- Media features are emulator settings, not CSS edits: reduced motion goes through
  Playwright's `page.emulateMedia({ reducedMotion: 'reduce' })` / CDP media emulation.
