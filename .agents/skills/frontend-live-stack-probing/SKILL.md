---
name: frontend-live-stack-probing
description: Interactive verification of the Owlgarth Finances frontend and backend stack paths against a live dev stack - browser probe harnesses (Playwright/puppeteer-core + system Chrome), API-driven auth and scenario seeding, port-shifted stacks, probing by bug class (environmental failure injection, interception-stub CORS preflight handling incl. OPTIONS + withCredentials echo, stale dev-container module caches incl. per-FILE served-transform verification after multi-write edits and esbuild-safe transform markers, backend-container migration drift, router startTransition races incl. commit supersession on chained navigations, CSS transition-timing on focus-ring reads, focus carryover on popup re-checks, CSS-hidden inputs in DOM-order field counting, expected dev-noise console errors, backgrounded-page rAF stalls, TanStack v5 focus refetches via synthetic visibilitychange, focus-call instrumentation for double-fire checks, negative-control stashed-pre-fix probe runs, localStorage cross-scenario contamination, shared-h1 sibling-route heading ambiguity, blur-insertion element-move click suppression reproducible headless, UTC-midnight pixel-baseline rollovers, react-day-picker v9 synthetic-keyboard blindness and popup focus order, viewport-emulation flag reloads, CDP return-by-value DOMRect stripping and pointer-emulation rejection incl. Chrome 157 silently ignoring Emulation.setEmulatedMedia pointer/hover overrides (setTouchEmulationEnabled as the working mechanism, re-armed after every setViewport) and headless hover:none, dispatched el.click() not reaching React handlers (real coordinate clicks, settle-before-click), fullPage-capture media-query perturbation (viewport-only captures for chrome-identity claims), overflow measurement inside inner scroll containers vs the document, in-page cell-hiding table min-content forensics, StrictMode 2x boot-query baselines for request-count gates, viewer-consent + General-budget/Main-account seeding facts incl. API-order-over-seed-order row expectations), backend container probes (in-container dependency version checks via uv pip --python /venv, lock-marker-derived expected-version tables, beat shelve-schedule reads, HTTP status capture incl. curl readiness-loop sentinels, Django RedisCache key makeup for redis-cli scans), touch-drag probing (velocity-sensitive tap synthesis after flings, inverted drag directions, phone-band window scrolling, entrance-animation stale rects with finally-scoped emulation resets, AX-tree role objects unusable for matching, mouse-under-touch-emulation for click-swallow legs), static-fallback discipline when no stack is available. Use when a task's mandate includes interactive or manual verification of frontend or backend-stack behavior, when reproducing or accepting a UI/state bug live, or when assembling a throwaway probe or browser-automation harness against the dev stack.
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
- React StrictMode double-mounts every boot query on the dev stack: request-count gates
  read 2x per deduped query set, and the duplicate discriminator is "no 4x" plus the
  expected 0->2 delta - re-derive a spec's "exactly 1 request" gate against that baseline
  before flagging duplicates.
- TanStack Query v5's focusManager listens to `visibilitychange` only:
  `window.dispatchEvent(new Event('focus'))` triggers nothing. To fire the
  `refetchOnWindowFocus: 'always'` refetch in a SINGLE tab (no second tab to focus), dispatch
  `document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))` while the
  document is visible.
- react-router v7 wraps route commits in `startTransition`: `page.waitForURL()` resolving does NOT
  mean the route rendered - URL change and DOM swap are separate commits, and an instant
  `innerText` read catches the PREVIOUS page's h1. Poll for the expected heading (locator
  `filter({ hasText })` + `waitFor`), never read the heading the moment the URL settles.
  The same commit race reads through `count()` at `domcontentloaded`: the load event fires
  before React boots, so a uniqueness `count()` returns 0 and faults as if the element were
  absent. `waitFor` the locator FIRST, then `count()` for uniqueness. Chained navigation has
  a supersession twin: after a `navigate(-1)`, waiting on the URL and immediately navigating
  again re-enters the STILL-MOUNTED page - the pending `startTransition` route commit is
  superseded by the new location before it renders, so the component never unmounts and its
  state survives. Poll the destination's rendered h1 before issuing the next navigation.
- Cold deep links to paginated state do not stick on a fresh mount: `/planned?page=2` resets
  to page 1 by design - the one-shot defaults materialization rewrites the search params on
  mount and drops `?page` (machinery under URL Search-Param State Sync in `frontend-react`).
  Do not misread the reset as a deep-link bug, and do not build the probe on the deep link:
  reach the target page by clicking its number chip.
- Focus-ring COLOR assertions race the color transition: Tailwind v4's `transition-colors`
  includes `outline-color` in its transition-property list, so a focus ring's color fades in
  over ~150 ms while `outlineWidth`/`outlineStyle`/`outlineOffset` read correct immediately -
  an instant `getComputedStyle().outlineColor` read after a Tab focus catches the
  pre-transition value and fails a correct ring as if it were missing (PR #197's probe hit
  this twice; both faults were probe-side). Settle ~400 ms after focusing before reading
  `outlineColor`, or assert width/style/offset, which `transition-colors` does not touch.
- Popup RE-CHECKS must blur before refocusing: Escape closes a popup but does NOT blur its
  trigger, so focus state silently carries across probe steps - a follow-up `.focus()` on
  the still-focused element fires no event, the popup never reopens, and the probe reports
  "no popup" against a working product (PR #6's date-popup re-check, where the preceding
  tab-walk had left focus on the input). Blur the element first, then focus. Diagnostic
  shape: when the fault follows the STEP ORDER rather than the viewport - the same check
  passed at 1024, where no tab-walk preceded it - the bug is in the harness sequence, not
  the product.
- Focus-ORDERING probes instrument `.focus()` CALLS, never focus events: patch
  `HTMLElement.prototype.focus` in `addInitScript` and count calls per element id - a
  `.focus()` on an already-focused element fires NO event, so event counters are blind to
  exactly the double-fire class being tested. Gate on RELATIVE per-action deltas (e.g. +1
  per submit), not absolute counts: unrelated autoFocus/overlay-restore machinery
  legitimately adds calls across close/reopen cycles without the effect under test
  misfiring.
- Date-picker (react-day-picker v9) keyboard probes need TRUSTED key presses: synthetic
  `dispatchEvent` keyboard events are ignored - only real CDP key input moves day focus. The
  first Tabs into an RDP popup land on the month-nav buttons, so keyboard scenarios tab-walk
  to a day button. And a popup seeded with a selected date opens on THAT date's month
  (`defaultMonth`), so day-button picks by number land in that month, not the current one -
  derive the expected ISO from the seeded date.
- Flipping puppeteer's `isMobile` emulation flag between `setViewport` calls makes Chromium
  RELOAD the page (viewport-meta re-evaluation), wiping all page state - state-preservation
  probes across widths use plain viewports when the app keys on width alone (`useBreakpoint`
  does).
- A BottomSheet editor's `autoFocus` input loses focus to `useOverlay`'s panel-focus effect
  moments after insertion - harnesses focus the input explicitly, and a coordinate-free
  `evaluate` focus also dodges clickable-point races on the still-animating sheet.
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
  only a width-matrix probe or the user's visual test catches this bug class. A "wrapper
  changes nothing visually" identity claim gates on the overflow DELTA between the two
  trees, never absolute overflow - synthetic probe content can overflow a narrow viewport
  identically in both trees (SplitView's identity gate: both trees overflowed 10px at 375px
  while all ten rect deltas read 0.000px).
- Overflow must be measured on the element that actually scrolls: this app scrolls inside
  `<main>`, not the document, so a document-level `document.documentElement.scrollWidth`
  reads clean while a card overflows its inner scroll context - measure the card/element
  (or the real scroll container), never the document, or the check is vacuously green.
  Scrolling BAND matters too: at phone widths the app scrolls the WINDOW (MainLayout's
  phone layout owns `window.scrollY`), not `<main>` - scroll-position assertions on phone
  read `window.scrollY`, and a `<main>`-scroll assumption fails there.
- puppeteer fullPage screenshots (`captureBeyondViewport`) are not viewport-neutral: the
  expanded capture surface momentarily perturbs the media-query environment, firing REAL
  breakpoint flips that race width-transitioning chrome mid-capture. Chrome-identity and
  pixel-diff claims pair VIEWPORT-ONLY captures with settled DOM geometry reads; never
  fullPage.
- Table min-content root-causing is done in-page: hide candidate cells/wrappers one by
  one (`el.style.display = 'none'`) and re-read the overflow after each to find which
  element sets the floor, then force explicit widths on the container to binary-search
  each claim's numeric floor. Faster and more decisive than stylesheet trial-and-error.
- With auto table layout and a truncating first column, a table NEVER overflows
  horizontally - the truncating column absorbs every spare pixel - so a criterion that
  must exercise the real `overflow-x-auto` + sticky-column mechanics pins
  `table.style.minWidth` first; without the pin the scroll machinery legitimately never
  engages and a "sticky column" probe proves nothing.
- Environmental defects (error-gate bugs): a clean run on a healthy stack proves nothing -
  "cannot reproduce" means the trigger is environmental (a failed request), not absent.
  Intercept and force-fail the dependency (request interception blocking the endpoint the
  code under test consumes) before concluding already-fixed: an `isSuccess`-only gate fed by
  a `retry: false` query only shows its failure mode under induced failure - the dead
  period-picker on budget open passed every naive probe and surfaced only when
  `GET /api/budgets/{id}/periods/current` was blocked.
- Request interception used to STUB an endpoint (enabling a flow whose backend dependency is
  env-disabled - an unset `PARSER_URL` hides the extraction endpoints) matches by URL
  pattern, so it also catches that URL's OPTIONS CORS preflight: a `req.respond()` that
  answers the preflight bodyless/CORS-less fails it, the real request never fires, and the
  affordance depending on the endpoint never renders - reading as a missing feature, not a
  probe bug (PR #6's extraction-config stub). Handle OPTIONS separately (204, no body), and
  give the stubbed response exact CORS headers: the axios client sends `withCredentials`, so
  a wildcard `Access-Control-Allow-Origin: *` is rejected by the browser - echo the request's
  Origin header and add `Access-Control-Allow-Credentials: true`, or the stub fails as
  unexplained CORS console noise.
- Timing-window verification STALLS instead of blocking: intercept only the method under
  test (a field-save PUT) and delay `continue()` by ~3s to widen a pending window
  (`isSaving`) for real coordinate clicks. The match must exclude the CORS preflight -
  the OPTIONS request passes through untouched, or the stalled request never fires at
  all.
- Fix-acceptance probes earn causality with a NEGATIVE CONTROL: run the same harness once
  against the pre-fix code (stash the fix, re-run, expect the repro) - a passing assertion
  that also passes pre-fix tests a probe artifact, not the change. A prior task's recorded
  failing probe state at the same HEAD (notes + screenshot of the failure) can serve as the
  negative-control leg without the stash, when re-stashing would re-risk the
  stale-served-transform class for no new information. Design the DISCRIMINATING check on a
  state where the bug manifests (an empty create form for show-all-errors leakage); a check
  that passes both pre-fix and post-fix (copying a valid transaction derives no errors
  either way) is a regression gate only, never proof of the fix.
- Served-code staleness in long-lived dev containers: a dev container that outlives the
  implementer's edits can serve a stale Vite transform - the module-graph cache frozen at a
  mid-edit intermediate save (bind-mount HMR missing the final write) - so the page renders
  HEAD-minus-the-feature while the URL/state machinery around it works, and the served
  sourcemap's line numbers match the older revision. Before trusting any "missing UI"
  verdict, verify a distinctive marker of the LANDED diff (an import, a handler name) in
  the SERVED transform; if stale, an mtime bust (`touch` the file, no content change)
  invalidates the cache - and when the bust does not cure it (a transform frozen across
  host-side multi-write edits can survive `touch`), restart the dev container: the frozen
  module graph lives in the container, and only the restart clears it. Choose markers
  that survive esbuild's output form: the transform double-quotes strings and strips JSX
  comments, so a single-quoted or comment-based marker reads "stale" against a fresh
  transform - a STALE verdict from such a marker is a probe bug until checked against
  the actual transform text. Type-position identifiers are erased along with the types
  (an imported name used only in annotations does not appear in the transform at all), so
  a type-only marker reads 0 occurrences against a CORRECT fresh transform - make
  freshness claims from a value-position marker (a runtime string, an export, a handler
  name), never a type-only one. Exemplar: PR #146's first stepper
  probe. Verify the served
  transform per FILE, never per subset: a multi-write edit session freezes the module
  graph per file - exactly the files whose edits landed as separate writes can sit at
  mid-edit states (the import write landed, the block write missing) while their siblings
  verify clean - so one file's clean transform proves nothing about the rest. Curl every
  touched module's transform before trusting any FAIL; the frozen-file symptom is a
  runtime `Link is not defined` plus false header assertions against a correct product.
  Exemplar: PR #10's header swaps, where three of six edited files were frozen mid-edit.
  The Tailwind SCAN can freeze the same way (twice in one session): the served sheet
  lagged the source until an mtime bust - same cure, same before-any-FAIL verification
  against a served-transform marker. Comment-only edits have NO marker at all (interface
  docblocks and JSX comments do not survive the Vite transform), so a comment-only change
  cannot be freshness-proven from the served transform - mtime-bust and verify through a
  runtime marker instead.
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
  behavior (an on-screen keyboard re-render racing a tap) is out of emulation reach.
  Element-move click suppression, though, is reproducible headless when the mover is
  LAYOUT, not the OSK: a freshly autofocused empty amount field blurs on mousedown, the
  blur-touch error row inserts ~20px, the footer shifts between mousedown and mouseup, and
  the click lands on the div now above the button - so probes blur freshly focused required
  fields before clicking a below-the-fields primary button. A clean headless non-repro of a
  mobile-only bug whose trigger is NOT layout-driven is evidence the trigger needs real
  hardware, not evidence of absence - and when a mandated
  live diagnosis refutes its pre-registered hypotheses, record each refutation with its log
  signatures (which handlers ran, what committed), never silently claim a reproduction the
  logs do not show, and route acceptance to an explicit on-device manual gate riding the PR.
- Backgrounded pages stall rAF polling: a page in a background tab stops advancing
  `requestAnimationFrame`, so a probe step that waits on a rAF-driven condition hangs while
  the same step passes with the page in front - the fault follows the harness's own tab
  switches, not the product. `bringToFront()` at page-switch boundaries keeps rAF time
  advancing (a different purpose from the cross-tab staleness focus event above).
- Pixel-diff baselines that span a UTC midnight rollover are date noise, not regression:
  date-sensitive rendering (a default month range, a "today" marker) re-derives at the
  rollover, so a before/after screenshot pair captured across midnight diffs on
  date-derived pixels and reads as a product regression. Re-baseline both trees on the
  same date before suspecting the product. Exemplar: PR #10's Dashboard pixel-diff
  investigation, cleared by a same-date re-baseline.
- Console-error gating is path-precise, never blanket: `/config.js` 404s on dev-server full page
  loads are documented pre-existing noise (the file is generated only in the deployed ui
  container; on Vite dev that 404 is expected). Exclude it by an exact pattern
  (`Failed to load resource` + 404 + `/config\.js`) while still recording and counting every
  excluded error in step notes - a blanket console-error pass or a silently dropped error hides
  real regressions. Capture `msg.location().url` from the first run to identify unexplained
  noise before judging it.

## Backend container probes

- Dependency version probes inside the api container must select the project venv explicitly:
  `docker compose exec api uv pip list --python /venv`. `uv run` honors `UV_PROJECT_ENVIRONMENT`
  but `uv pip` does NOT - bare `uv pip list` silently reports the container's /usr/local system
  env, so the probe succeeds while listing the wrong environment entirely.
- Expected-version tables for in-container probes derive from lock MARKERS, not lock rows: a
  package can move in `uv.lock` and still be absent from the Linux venv when every reference
  is `sys_platform == 'win32'`-gated (tzdata rides celery -> tzlocal -> tzdata, win32-only,
  so kombu 5.7's tzdata floor bump shows in the lock diff but never installs in the
  container). A table copied from raw lock rows fails a correct venv - re-derive the install
  set from the package's marker lines before calling a missing version drift.
- Reading beat's PersistentScheduler shelve file: a live read-only open is blind to the
  un-checkpointed sqlite WAL (`no such table: Dict`), and `docker compose exec` cannot target a
  stopped container. Working sequence: graceful `docker compose stop beat` (the close
  checkpoints and removes the -wal file) -> `docker cp` the file out -> start beat -> read on the
  host with the backend/.venv python (plain sqlite3 + pickle; raw shelve Dict keys are BYTES,
  not str). A beat-schedule gate asserts OUR entry (task + crontab), never the default-entry
  set: `celery.backend_cleanup` is not installed when the result backend is redis
  (`supports_autoexpire == True` skips it), so an assertion over the default entries is
  vacuously empty either way.
- celery 5.6's PersistentScheduler shelve layout is nested, not flat: top-level keys are
  scheduler metadata (`b'__version__'`, `b'tz'`, `b'utc_enabled'`) and all schedule entries
  nest under ONE `b'entries'` dict key whose inner keys are STR - reading top-level values as
  entries crashes the unpickle on the metadata. A beat-schedule PASS gate names the
  authoritative artifact, the shelve CONTENT, never a boot log line: celery 5.6's beat prints
  no "Scheduler: Writing entries..." INFO line at all, so a log-line gate fails on a healthy
  schedule.
- Django's RedisCache stores keys as `<KEY_PREFIX>:<VERSION>:<key>` - with the default empty
  prefix and version 1 every key carries a LEADING `:1:`, so a redis-cli scan pattern like
  `ratelimit:login*` (the throttle key is `ratelimit:<name>:<ip>`) matches nothing while the
  cache provably holds the entries. Lead the pattern with a wildcard (`*ratelimit:login:*`)
  or otherwise account for the makeup, and confirm by reading a matched key's full name.
- HTTP status capture: `curl -w '%{http_code}' | tee f | head -c N` silently loses the status
  line - head's early exit SIGPIPEs tee before the -w trailer is written. Capture to a file
  with no `head` in the pipeline, then read the file. The readiness-loop twin: on connection
  failure `curl -w '%{http_code}'` itself prints `000`, and an `|| echo 000` fallback appends
  a SECOND `000` - the sentinel check reads `000000 != 000` and the loop misfires on the very
  first connection failure. The fallback must ASSIGN the sentinel (`|| code=000`), never
  echo it.

## Trust the driver less than the product

- In PR #84's pass, 3 of 17 driver failures were bugs in the probe script itself (wrong
  expectation order, a hover auto-scroll invalidating a later centering check, asserting a
  chip the spec says is absent). A failing assertion is a hypothesis - re-derive the
  expectation from the spec before blaming the product. PR #179's DatePicker probe was the
  stronger instance: 6 fault cycles (role mappings, label DOM shapes, guessed strings,
  below-fold coordinates), ZERO product findings - the expected distribution for a
  dependency swap whose static gates already passed.
- Locator faults from role and DOM-shape assumptions (all harness faults, PR #179):
  Playwright does NOT map `button[aria-haspopup="listbox"]` to the `combobox` role - target
  the button itself or its attributes, not `getByRole('combobox')`; a SegmentedControl-style
  view switcher is a `radiogroup` with `radio` options, not `tab`/`tablist`; and label
  locators must match the real DOM shape (an InfoHint-wrapped label nests the text in a
  span; a flex-row label separates it from its control) - inspect the served DOM before
  writing `getByText`/`getByLabel`.
- `innerText` reflects applied `text-transform`: a section title styled `uppercase` reads
  "DETAILS" - assert case-insensitively against uppercase-styled chrome.
- DOM-order field counting must exclude CSS-hidden inputs: a receipt-scan block's
  `<input type="file" className="hidden">` is `type="file"`, not `type="hidden"`, so a type
  filter still counts it, inflating the field total and shifting every positional index
  (dateIdx 3 vs 2) against a correct product (PR #6's field-order check). Filter candidates
  to visible fields (`getClientRects().length > 0`) before asserting DOM-order positions.
- Scope modal-title assertions to `[role="dialog"] h2`, never `h2.first()` - pages carry
  their own h2s (the planned view's year header) that poison a page-level first match.
- Sibling routes can share one h1: the three Activity pages all render "Activity"
  (`hooks/useActivityScope.ts`), so a heading poll proves only that SOME sibling rendered -
  when the destination has same-titled siblings, wait on a marker unique to the destination
  route (its own differentiating h1, e.g. "New transaction", or a page-specific element).
- Localized expected strings come from the CATALOGS, never from guesses or
  sibling-namespace analogies - uk's quick-add button reads "Нова операція" while the
  transactions page's is "Нова транзакція"; a guessed string turns a harness fault into an
  apparent product bug.
- Accessible-name locators for controls that carry a count badge must make the badge
  OPTIONAL in the pattern: /planned's phone filter trigger (`components/filters/FiltersTrigger.tsx`)
  reads "Filters 1", not "Filters", on
  fresh entry - the one-shot default params materialize into the URL on mount and the badge
  counts them. Match with a catalog-derived regex (`^(Filters|Filtry|Фільтри)( \d+)?$`),
  never an exact name: the name comes from the catalogs, so the regex must too.
- `elementHandle.click()` on options inside a height-capped scrollable panel auto-scrolls
  the container and can click THROUGH to whatever sits underneath the intended option -
  coordinates and scroll state are the driver's, not the page's truth. Prefer a DOM
  `el.click()` dispatch (no coordinate dependency) for listbox options inside scrollables
  and for below-fold popup content (a calendar inside a tall modal at 1280x800, where
  coordinate-based clicks time out on cells the driver cannot bring into reach) - but
  verify the dispatch actually reaches the handler on the current stack first (see the
  el.click()-vs-React correction below).
- That `el.click()` dispatch fires NO `mousedown` - a mousedown-driven close path (the
  listbox outside-click close listens for `mousedown`) can never be exercised by it; driving
  an outside-click close needs real mouse events (`page.mouse`), inheriting the
  coordinate/scroll caveats above.
- On the current stack (Chrome 157 / React 19) a dispatched `el.click()` does NOT reach
  React handlers - observed twice in one session against plain `onClick` handlers: the
  dispatch fires, the handler never runs. Drive real coordinate clicks, or keyboard Enter
  on a focused element. This supersedes the `el.click()` preference above for anything
  React-handled; the dispatch remains usable only where the target's behavior is verified
  to fire under it.
- Real coordinate clicks need the layout SETTLED first: a click issued while the page is
  still moving (right after `scrollIntoView`, mid-commit on a busy tree) dies between
  pointerdown and mouseup and reads exactly like a product bug. Below-fold targets (a
  panel footer riding a tall list) get scrollIntoView + a settle beat before the
  coordinate click.
- `page.click` on a pre-filled input drops the caret mid-text (the click lands at a
  default offset and a following type splices into the middle) - replace-type instead:
  click, Ctrl+A, then type the full replacement value.
- `page.evaluate` cannot return a DOM element (the return value is serialized, a node is
  not): a keyboard Tab-walk focus helper asserts INSIDE the evaluate via a boolean hit-test
  on `document.activeElement` (selector/attribute match), or grabs the node itself with
  `evaluateHandle(() => document.activeElement)` and reads attributes through the handle.
  CDP return-by-value serialization also strips PROTOTYPE properties: a returned `DOMRect`
  serializes to `{}` because its numbers live on the prototype - extract the numbers into
  own properties inside the evaluate (`{ x: r.x, width: r.width }`) before returning them.
- Media features are emulator settings, not CSS edits: reduced motion goes through
  Playwright's `page.emulateMedia({ reducedMotion: 'reduce' })` / CDP media emulation.
  puppeteer's `page.emulateMediaFeatures` whitelists feature names and REJECTS `pointer`,
  and raw CDP `Emulation.setEmulatedMedia` with
  `features: [{ name: 'pointer', value: 'coarse' }]` is SILENTLY IGNORED for pointer/hover
  by Chrome 157 - the call succeeds and nothing changes. The working mechanism for
  `(pointer: coarse)` is `Emulation.setTouchEmulationEnabled({ enabled: true,
  maxTouchPoints: 5 })`, which drives the media query and survives navigation. Both are
  reset by `setViewport` (the device-metrics override rebuilds emulation state): re-arm
  after EVERY viewport change in a drive loop, or later steps run un-emulated while the
  harness believes otherwise. And headless Chrome reports `(hover: none)` natively
  regardless of emulation - hover-cascade claims (hover vs zebra specificity) are proven
  from served-sheet rule order, never from an emulated hover match.
- Stale rects while an ENTRANCE animation runs: an element rect captured while a sheet is
  still animating in reads a mid-flight position and poisons every coordinate derived from
  it - wait for the entrance to finish (or a settle beat) before reading coordinates (the
  measurement sibling of settle-before-click above). The same discipline closes the reverse
  leak: an emulated media feature (reduced motion) set for one scenario leaks into every
  later scenario after a failure - reset emulation in `finally`, not only on the success path.
- CDP `Input.dispatchTouchEvent` click synthesis is VELOCITY-sensitive: the tap AFTER a
  fast fling dies (~3000px/s drags poison the next tap; ~300px/s works; distance and
  off-viewport endings are not the cause) - drag gestures must be human-slow (~14+ steps x
  28ms+). The drags DO drive native scroll once the direction is right, and the direction
  is inverted from intuition: a finger-DOWN drag at scrollY 0 scrolls nothing (rubber-band
  edge), scrolling down needs finger UP (`dy: -300`), and strip scrollLeft forward needs
  finger LEFT (`dx: -200`). `Input.synthesizeScrollGesture` is the fallback when a
  drag-shaped gesture is not required.
- Click-swallow verification pipeline: under touch emulation, dispatch CDP MOUSE events -
  `(pointer: coarse)` matches so the gesture code arms, and pointer capture retargets the
  synthesized click to the drag host, the one pipeline where a stepped drag provably
  produces a click. Positive control: a 5px captured mouse drag fires the handler; a 300px
  drag must not.
- `Accessibility.getFullAXTree` / a raw accessibility snapshot returns roles as
  `{type:'role', value}` objects, unusable for string matching - keyboard-order claims are
  proven with a real Tab walk asserting `document.activeElement` inside evaluates, not by
  parsing the AX tree.
- Deep-link key normalization: the raw initial history state carries `key: undefined` -
  react-router normalizes it to `location.key = 'default'`. Probe assertions mirror the
  normalization (the row-tap-back discriminator is `location.key !== 'default'`); product
  code reads `location.key`, never the raw history state.
