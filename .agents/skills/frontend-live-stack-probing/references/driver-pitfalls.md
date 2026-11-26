# Trust the Driver Less Than the Product

Part of the `frontend-live-stack-probing` skill. Read when a probe result looks wrong or contradicts the code: harness and driver artifacts to rule out before blaming the product.

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
- Scope every editor-state query, focus and click to the located component's SUBTREE,
  never the document: a page can carry a hidden twin with the same aria-label (a list
  page's filter Select behind an open record panel), and a document-wide `querySelector`
  resolves to that dead node - `focus()` silently lands nowhere (`activeElement` stays
  BODY), the keypress falls to the host's document listener, and the fault reads as a
  product bug (an editor Escape that "closes the whole panel"). Verify focus with an
  `activeElement` assertion carrying a marker, never an unverified `el.focus()`, and scope
  reads and clicks to the same subtree.
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
- Opening an IN-FLOW panel scrolls main with it: the panel and the page chrome live in
  main's scroll flow, so opening a low row's record can park the panel's own action row
  and page-level controls ABOVE the viewport, where `elementFromPoint` returns null - a
  failed hit-test at a negative-y point is the signature of this fault (the inverse of
  the below-fold case above: here the OPEN moved the targets, not the initial scroll).
  A probe click helper scrolls a failed hit-test target into view (block: center, settle)
  before retrying. Assert HISTORY by `history.state.idx`, never `history.length`: length
  never shrinks on Back, and the next push truncates the forward entry first, so literal
  length assertions fail on the second pass in one tab - idx advancing by exactly one
  (or returning to the list's own entry) is the push/back truth.
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
- A CLOSING sibling overlay can cover the dialog the same tap opened: an action row that
  runs `onClose()` before `onSelect()` re-renders the exiting sheet's full-viewport wrapper
  (its content already swapped or nulled) and it keeps hit-testing above the just-opened
  dialog for ~200ms at the same z-tier - a coordinate press on the new dialog dies
  invisibly and reads as a product bug (or blames the wrong component). Retry the
  `elementFromPoint` hit until the exiting overlay unmounts (a bounded retry, e.g. 8 x
  400ms), and dump the covering dialogs on final failure; a settle beat before every
  `history.back()` closes the same gap.
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
- A quoted STRING predicate passed to `page.waitForFunction` resolves before the page
  renders: the string is evaluated as an expression, a quoted `() => ...` arrow evaluates
  to a function object, and a function object is truthy - every wait passes ~50ms after
  domcontentloaded with React unmounted, the asserts then read a splash or empty DOM, and
  a whole probe matrix fails uniformly with skeleton screenshots that look like a product
  regression. Pass real function objects (arguments through the call's args tail), and
  rule this fault out first when every cell fails pre-render.
- The browse tool's viewport change can report `applied` while the width never changed:
  cells then silently capture the wrong breakpoint and wrong-width evidence reads as
  approvals. Assert the width landed - read `window.innerWidth` in the page after every
  change - re-apply on mismatch (bounded retries), and reject and re-run any cell whose
  width never applied. Chrome also clamps emulated widths at 320 CSS px: a narrower
  request reads 320 and reports the difference as document overflow, an artefact, not the
  product.
- A trusted focus on a password field can pop the user's own password-manager extension
  over the page, blocking the tool mid-cell. Do not hand off or force it: close the
  probe's tab, open a fresh one on the same session, and arm the control with a synthetic
  input event that never focuses the field - one dummy character, never a real secret,
  never submitted, cleared after every read.
- Background agent tabs produce animation frames on demand, so a layout read taken right
  after a class or style change can return the PRE-transition value (a fill's old width)
  while a painted capture at the same moment shows the settled state - budget a settle
  beat (or a forced frame) before layout reads in a background tab, and blame a
  mid-transition mismatch on the page's own width transition, not the product.
