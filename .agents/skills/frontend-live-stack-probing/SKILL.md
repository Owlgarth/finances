---
name: frontend-live-stack-probing
description: Verifying frontend or backend-stack behavior against a live dev stack - probe harnesses (Playwright or puppeteer-core driving system Chrome), API-driven auth and seeding, port-shifted stacks, teardown, plus reference files for probing by bug class, backend container probes, and driver pitfalls. Use when a change needs in-browser or live-stack evidence, or when no stack is available and a static fallback must be budgeted.
---

# Frontend Live-Stack Probing

The frontend has no test runner - lint and build are the only automated gates - so interactive verification is a first-class activity, not a fallback. Build the probe harness once and reuse it for both diagnosis and acceptance in the same session.

This file is the stack discipline every probe needs. Read the reference files (`.agents/skills/frontend-live-stack-probing/references/`) as the task calls for them:

| When | Read |
|---|---|
| choosing how to reproduce or verify a specific bug class (failure injection, CORS stubs, stale dev-container modules, migration drift, router races, layout and cascade measurement, gestures, console-error gating) | `references/bug-classes.md` |
| checking versions, beat schedules or runtime state inside backend containers | `references/backend-container-probes.md` |
| a probe result looks wrong or contradicts the code | `references/driver-pitfalls.md` |

**Expected dev noise:** on the Vite dev server `/config.js` answers 404 on every full page load (the file only exists in the deployed ui container). Exclude it by an exact pattern and still count every excluded error; never gate on a blanket console-error pass (details in `references/bug-classes.md`).

## Drive system Chrome, not a downloaded browser

- puppeteer-core or Playwright with the system Chrome binary - no browser
  download step, no extra network dependency. puppeteer-core ships no browser at all (that is
  the point of `-core`); Playwright reaches system Chrome via `channel: 'chrome'` or an
  explicit `executablePath`.
- The probe is a throwaway script, not test infra: seed, assert, screenshot, exit. Nothing
  lands in `frontend/src/`. The harness shell is zsh: a lowercase `path` loop variable
  clobbers `$PATH` (zsh ties the array to the env var), so name shell loop variables
  anything else.
## Authenticate and seed through the API, never the UI

- Registration requires the CURRENT legal acceptance versions - fetch them from `/api/legal/*`
  and send them with the register call, or registration fails. (`DEMO_MODE=true` on the
  backend disables registration entirely with a 403.)
- Currency codes in seed payloads must be UPPERCASE ISO (backend pattern `^[A-Z]{3,8}$`), and
  `GET /api/currencies` is auth-gated - fetch the catalog only after authenticating.
- Fast path when a token already exists: seed `localStorage` directly (`owlgarth_token`,
  `owlgarth_refresh_token` - see Token Storage in `frontend-react`) instead of driving the
  login form.
- The UI language follows the SERVER preference, not localStorage: `LanguageContext`
  applies `preferences.language` over any stored seed, so switch languages in a probe via
  `PATCH /users/me/preferences` (`{"language": "uk"}`) - writing `owlgarth_language` to
  localStorage changes nothing the page renders. Multi-language verification (overflow,
  wrapping, translated chrome) switches all three locales through that one call.
- A probe that PATCHes server-side state (the language switch above) must reset it at pass
  START, not only at teardown: a crashed run leaks the preference and every subsequent boot
  renders the poisoned state - PR #177's probe inherited a leaked `uk` preference and it
  initially read as a product bug. Reset-at-start keeps the probe idempotently re-runnable.
- Scenario isolation spans localStorage, not just server state: an app feature that persists
  a "last used" default (the transfer form's last account pair under its localStorage key) is
  silently rewritten by earlier scenarios in the same run, so a later scenario's assumed
  default is stale - and the resulting silent, no-request refusal was CORRECT product
  behavior (a same-account pair on a host that toasts nothing), not a bug. Set
  persisted-default-backed values explicitly in every scenario, and treat "no request fired"
  as validation-refusal evidence on no-toast hosts.
- A directly-added viewer member has no recorded consents and lands on `/reconsent` -
  seed `POST /users/me/consents` (`terms_of_service`/`privacy_policy`) before driving
  member-role scenarios. Registration auto-creates BOTH a "General" budget and a "Main"
  account: a seeded workspace with two test budgets holds THREE, not two, and
  budget/accounts EMPTY STATES are unreachable on a fresh registration until those
  entities are deleted via API - derive count and empty-state expectations from `GET`
  truth, never from what the seed script believes it created.
- Scenario data via endpoints, not clicks: PR #84 materialized 36 periods by looping the lazy
  current-period endpoint instead of clicking chevrons 35 times. UI-driven setup couples the
  probe to the very behavior under test.
- Expected UI row order derives from the API's returned `items` order, never from the seed
  sequence - list endpoints return neither creation nor name order (the categories API is the
  pinned example), and a probe asserting seeding order fails against correct product behavior.
- API-driven row assertions read `items` - the Django Ninja `PaginatedResponse` field - not
  `results`.
- Clean up with `DELETE /api/users/me` - removes the seeded user and its workspace data.
  The call requires a `{ password }` body carrying the seeded user's password; an empty
  body 422s (the first teardown attempt fails exactly this way). It returns 200 with an
  `AccountDeleteOut` body, not 204 - do not assert or gate teardown on a no-content status.
## The stack: check ports before you build on it

- Another checkout may already hold the default ports - `docker ps` first, shift
  `API_PORT`/`UI_PORT` rather than stopping someone's containers.
- The shift is a triple: `VITE_API_URL` (root `.env`; the ui container gets it as runtime
  `API_URL`, written into `/config.js` at startup - a change is a ui recreate, not a
  rebuild), `CORS_ALLOWED_ORIGINS`, and `FRONTEND_URL` do NOT derive from
  `API_PORT`/`UI_PORT` (rule detail in `docker-infra`). Missing one silently splits
  frontend/backend across checkouts - confirm the UI actually reaches YOUR api before
  debugging the product.
- One-off `docker compose run` containers OUTLIVE their invoker: a leftover
  `<project>-<svc>-run-*` container from a prior session can still hold your UI_PORT and
  answer HTTP 200 on it - a false-positive generator for any readiness poll, not just a
  future "port is already allocated" failure. Before any port-publishing smoke: capture
  `docker ps` (the shared-host before/after baseline), remove this project's own one-offs
  with the DOUBLE label filter - `docker ps -aq --filter
  label=com.docker.compose.project=<name> --filter
  label=com.docker.compose.service=<svc>` + `docker rm -f` (the filter pair can only match
  this workspace's own containers, so the never-touch-sibling-checkouts rule holds by
  construction) - then prove the port dead (curl fails + `ss` shows no listener) before
  booting, and diff the before/after captures to confirm nothing else changed.
- Readiness is polled on the PUBLISHED port; under `--service-ports` remapping the vite
  banner's `Local:` URL prints the container-internal port (5173) - that mismatch is
  expected, never misread it as a failure.
## Teardown: kill the listener, not the wrapper

- `pkill -f '<pattern>'` kills the invoking shell too when the shell's own command line
  matches the pattern - two consecutive PR #177 tasks lost their harness this way
  (`pkill -f 'docker compose logs -f'` from a shell whose own invocation carried that
  string). Never pkill a pattern your own command line can match; target PIDs.
- `npm run dev` wraps vite: killing the npm wrapper's PID leaves the vite child alive and
  holding the port, so the next boot fails on an in-use port. Kill by LISTENER pid (from
  `ss`/`lsof`), never the wrapper pid.
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
