# Probing by Bug Class

Part of the `frontend-live-stack-probing` skill. Read when choosing how to reproduce or verify a specific bug class: failure injection, CORS stubs, stale dev-container modules, migration drift, router races, layout and cascade measurement, gestures, cross-tab staleness, console-error gating.

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
- Mid-cell RAW-API mutations leave the page's TanStack cache stale: the list queries'
  5-minute staleTime keeps serving the pre-mutation rows, so after an API-side delete or
  edit made between in-page steps, a row assertion either hangs waiting for a row the
  server no longer returns or passes against rows the server no longer has - reload the
  page before the next in-page row assertion instead of polling for the new truth.
  Normalize world state at the START of a cell (the seed discipline above); mid-cell, the
  reload IS the normalization.
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
- Server-response timing from `performance.getEntriesByType('resource')` needs the buffer
  RAISED first: the dev server serves hundreds of unbundled per-module requests and the
  default resource-timing buffer (250 entries) overflows before the late API calls fire,
  so their entries are silently dropped - a timing assertion then compares against an
  empty list and passes vacuously (a `maxResponseEnd=-Infinity` read as a pass). Call
  `performance.setResourceTimingBufferSize(20000)` in an init script, or take timestamps
  at a point you control (the interception `continue()` call converted to the page clock
  via `performance.timeOrigin`) instead of trusting the buffer's completeness.
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
- A toast that fires under the resting pointer swallows the NEXT coordinate click: a
  bottom-center toast can appear exactly where the previous action left the mouse,
  pause-on-hover freezes its dismiss timer, and the still-visible overlay eats the click -
  the probe then misreads a swallowed click as a product failure (no submit, no navigation,
  no console error), and an in-place drain times out invisibly, leaving the overlay armed
  for the next step. After any toast-firing action, park the mouse off the toast's
  footprint (e.g. (1,1)), wait for it to dismiss, then capture and click the next target.
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
