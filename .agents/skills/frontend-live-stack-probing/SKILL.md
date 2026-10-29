---
name: frontend-live-stack-probing
description: Interactive verification of the Owlgarth Finances frontend against a live dev stack - browser probe harnesses (Playwright/puppeteer-core + system Chrome), API-driven auth and scenario seeding, port-shifted stacks, probing by bug class (environmental failure injection, stale dev-container module caches, backend-container migration drift, router startTransition races, expected dev-noise console errors), static-fallback discipline when no stack is available. Use when a task's mandate includes interactive or manual verification of frontend behavior, when reproducing or accepting a UI/state bug live, or when assembling a throwaway browser-automation harness against the dev stack.
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
- Scenario data via endpoints, not clicks: PR #84 materialized 36 periods by looping the lazy
  current-period endpoint instead of clicking chevrons 35 times. UI-driven setup couples the
  probe to the very behavior under test.
- API-driven row assertions read `items` - the Django Ninja `PaginatedResponse` field - not
  `results`.
- Clean up with `DELETE /api/users/me` - removes the seeded user and its workspace data.
  The call requires a `{ password }` body carrying the seeded user's password; an empty
  body 422s (the first teardown attempt fails exactly this way).

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
- react-router v7 wraps route commits in `startTransition`: `page.waitForURL()` resolving does NOT
  mean the route rendered - URL change and DOM swap are separate commits, and an instant
  `innerText` read catches the PREVIOUS page's h1. Poll for the expected heading (locator
  `filter({ hasText })` + `waitFor`), never read the heading the moment the URL settles.
- Cascade and sizing claims are settled against the COMPILED stylesheet, never the source
  className string. A static headless-Chrome harness (`--headless=new --dump-dom`, page
  script writes measured element rects into the DOM) linked against `dist/assets/index-*.css`
  with the real class strings needs no dev stack and settles the claim in minutes - canonical
  instance: Tailwind v4's alphabetical utility emission made a shared base `w-full` silently
  void caller width classes (trap detail under Responsive Breakpoints in `frontend-react`).
- Layout claims get MEASURED post-fix evidence, not eyeballing: overflow is a number
  (`scrollWidth - clientWidth`, probed as a width matrix - e.g. 320/360/390/768/1024 across
  en/uk/pl - closing at 0px everywhere), and pixel-diff of before/after screenshots is the
  visual-verification fallback when image viewing is unavailable - it is STRONGER evidence
  than eyeballing for "desktop unchanged" claims (0 differing pixels of 691200 is a count,
  not an impression). Lint, build, and i18n gates are structurally blind to rendered pixels;
  only a width-matrix probe or the user's visual test catches this bug class.
- Environmental defects (error-gate bugs): a clean run on a healthy stack proves nothing -
  "cannot reproduce" means the trigger is environmental (a failed request), not absent.
  Intercept and force-fail the dependency (request interception blocking the endpoint the
  code under test consumes) before concluding already-fixed: an `isSuccess`-only gate fed by
  a `retry: false` query only shows its failure mode under induced failure - the dead
  period-picker on budget open passed every naive probe and surfaced only when
  `GET /api/budgets/{id}/periods/current` was blocked.
- Served-code staleness in long-lived dev containers: a dev container that outlives the
  implementer's edits can serve a stale Vite transform - the module-graph cache frozen at a
  mid-edit intermediate save (bind-mount HMR missing the final write) - so the page renders
  HEAD-minus-the-feature while the URL/state machinery around it works, and the served
  sourcemap's line numbers match the older revision. Before trusting any "missing UI"
  verdict, verify a distinctive marker of the LANDED diff (an import, a handler name) in
  the SERVED transform; if stale, an mtime bust (`touch` the file, no content change)
  invalidates the cache. Exemplar: PR #146's first stepper probe.
- Backend env drift is the api-container twin of served-code staleness: a container started
  before the branch serves the new code but has never run the branch's MIGRATIONS, so a
  brand-new endpoint 500s with `UndefinedTable` on its first hit - it reads like a product
  bug and is purely environmental. Migrate in-container (`./dev.sh migrate`) before probing
  new-endpoint surfaces, and classify a 500 whose traceback names a missing relation as env
  drift, not a finding.
- Dependency-only changes have no source-file marker to grep for: bust `node_modules/.vite`,
  restart the dev server, then prove `.vite/deps/*` mtimes postdate the bust + server start AND
  `_metadata.json` lists the updated package - only then does the served transform derive from
  the new install.
- Real-hardware dynamics: headless emulation has no soft keyboard, so visualViewport/OSK
  behavior (an on-screen keyboard re-render racing a tap, click suppression on
  element-move) is out of emulation reach. A clean headless non-repro of a mobile-only bug
  is evidence the trigger needs real hardware, not evidence of absence - and when a mandated
  live diagnosis refutes its pre-registered hypotheses, record each refutation with its log
  signatures (which handlers ran, what committed), never silently claim a reproduction the
  logs do not show, and route acceptance to an explicit on-device manual gate riding the PR.
- Console-error gating is path-precise, never blanket: `/config.js` 404s on dev-server full page
  loads are documented pre-existing noise (the file is generated only in the deployed ui
  container; on Vite dev that 404 is expected). Exclude it by an exact pattern
  (`Failed to load resource` + 404 + `/config\.js`) while still recording and counting every
  excluded error in step notes - a blanket console-error pass or a silently dropped error hides
  real regressions. Capture `msg.location().url` from the first run to identify unexplained
  noise before judging it.

## Trust the driver less than the product

- In PR #84's pass, 3 of 17 driver failures were bugs in the probe script itself (wrong
  expectation order, a hover auto-scroll invalidating a later centering check, asserting a
  chip the spec says is absent). A failing assertion is a hypothesis - re-derive the
  expectation from the spec before blaming the product.
- `elementHandle.click()` on options inside a height-capped scrollable panel auto-scrolls
  the container and can click THROUGH to whatever sits underneath the intended option -
  coordinates and scroll state are the driver's, not the page's truth. Prefer a DOM
  `el.click()` dispatch (no coordinate dependency) for listbox options inside scrollables.
- That `el.click()` dispatch fires NO `mousedown` - a mousedown-driven close path (the
  listbox outside-click close listens for `mousedown`) can never be exercised by it; driving
  an outside-click close needs real mouse events (`page.mouse`), inheriting the
  coordinate/scroll caveats above.
- Media features are emulator settings, not CSS edits: reduced motion goes through
  Playwright's `page.emulateMedia({ reducedMotion: 'reduce' })` / CDP media emulation.
