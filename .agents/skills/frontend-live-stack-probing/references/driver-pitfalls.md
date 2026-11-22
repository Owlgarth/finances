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
