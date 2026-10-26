---
name: i18n-tooling
description: i18n toolchain conventions for Owlgarth Finances - the frontend/scripts/ i18n tools (i18n:check, lang:add/lang:rm, key:find/key:rm, i18n:extract), byte-preserving writers for backend/common/languages.json and frontend/.i18rc, catalog \uXXXX escape preservation, landed-key dedup before catalog appends, and the i18next ESLint rule config. Use when adding or removing languages, adding or editing catalog keys by hand (hand-edit vs tool-run decision, escape fences, cross-task key dedup), removing translation keys, editing the frontend/scripts/ i18n tools or i18n-lib.mjs, touching frontend/.i18rc or the language registry, changing the i18next/no-literal-string ESLint configuration, or fixing a newly flagged no-literal-string warning (the zero-warning floor and hoist recipe).
---

# i18n Tooling

The user-facing procedures (language lifecycle walkthroughs, the command table, each script's output) live in `docs/i18n.md` (Language lifecycle, Tooling reference sections) - this skill carries the engineering rules for the tools themselves and the machine-written files. All scripts are zero-dependency Node ESM under `frontend/scripts/`, sharing `i18n-lib.mjs`.

## Single Registry

`backend/common/languages.json` is the only language/number-format list: the backend validates through `common/languages.py` constants, the frontend imports the JSON cross-tree, and the tools read it. Never add a second hardcoded list (no model `choices=`, no frontend constant) - a duplicate drifts from the registry silently, and `lang:list` (which enumerates locale directories from the filesystem) is where the drift surfaces.

## Byte-Preserving Writers

Both machine-written files have a hand-maintained byte shape that plain `JSON.stringify` does NOT round-trip. A writer that loses the shape dirties the whole file on every run, burying the real one-entry change in reformat noise.

- **`backend/common/languages.json`**: `writeRegistry` in `i18n-lib.mjs` preserves the compact one-line-per-entry style (2-space structure indent); `JSON.stringify(registry, null, 2)` would reformat every entry.
- **`frontend/.i18rc`**: the file mixes inline arrays (`locales`) with expanded ones (`input`, `lexers`), so stringify reshapes both. `syncI18rcLocale(code, add)` does a surgical text splice of the single-line `locales` array only. When its regex finds no single-line locales array (someone hand-reformatted the file), it throws loudly instead of silently skipping - keep that behavior; a silent skip is the original bug class (a language `i18n:extract` never sees).
- **Insert at the code-sorted position** (splice at the first greater code), never a full array sort - the shipped order [en, uk, pl] is deliberate and not code-sorted.
- New languages are seeded with copies of the en VALUES, not `{}` - `i18n:check` fails on untranslated copies, forcing translation in the same change instead of shipping English placeholders.

## Catalog Escapes (\uXXXX)

`JSON.stringify` de-escapes non-ASCII: catalog glyphs stored as `\u2014`/`\u2026` escapes (en values stay ASCII-clean by convention, docs/i18n.md Key conventions) come back as literal bytes. `i18n:check` parses both forms identically, so nothing functional fails - only diff/grep byte gates catch it. `key:rm` and `lang:add` currently serialize catalogs with plain `JSON.stringify` and de-escape every escape-carrying file they touch; after any such run, restore the escapes before committing - enumerable per file via `git show HEAD:<file> | grep -io '\\u[0-9a-f]\{4\}'` (case-INSENSITIVE: the lowercase-only recipe silently misses uppercase-hex escapes like `\u201C`/`\u201D` smart quotes, undercounting the inventory). The known fix (backlogged) is an ASCII-escaping serializer in `i18n-lib.mjs` shared by both tools.

Make the restoration structural, not transcriptional: after a tool run, revert the tool-touched catalogs to HEAD (`git checkout HEAD -- src/i18n/locales/...`) and re-apply only the intended line-level change via content-anchored exact-match edits - hand-restoring escapes one by one is error-prone, while revert-then-reapply makes the final diff exactly the intended lines and a case-insensitive occurrence-level diff against HEAD proves the escape inventory unchanged. When `key:rm` runs AFTER hand-edits already landed in the working tree, revert and re-apply ALL intended changes (the addition and the removal), not just escape restoration.

A content edit - one new key across locales, a translation fix - is a content-anchored hand edit, never an `i18n:extract`/`key:rm` run. All three tools reserialize every catalog they touch (key sort + de-escaping, see docs/i18n.md), so a one-key change dirties whole files and buys the full restore-then-reapply cycle above for nothing; the machinery is for changes that genuinely need a tool (structural key sweeps, language lifecycle). When a hand edit itself adds or removes escape-carrying values, fence the escape inventory before/after with the case-insensitive grep above.

Placement keeps insertion-only diffs satisfiable: a hand edit under a no-deletion diff gate inserts the new key BEFORE the section's comma-less final key, never after it - appending after the last key forces a trailing comma onto that line, producing a `-` line the gate rejects, and key order within a section is semantically irrelevant anyway.
Anchor the edit on the key PLUS its verified neighbor line, never on an assumed ordering: the neighbor you expect may not be the one that ships (`planned.json` orders `emptyFiltered`/`empty`/`emptyWithStatus`/`noAccount`, so `emptyWithStatus` is followed by `noAccount`, not `empty`), and pairing the anchor with the wrong neighbor makes the edit miss while the anchor line alone risks ambiguity. When a content-anchored edit unexpectedly misses, byte-dump the region (`od -c`) to see the actual bytes - line endings, typographic quotes - before re-anchoring.

Cross-task catalog appends dedupe against the LANDED keys before inserting: a later task re-appending an outline's key block against a catalog an earlier task on the same branch already extended creates a duplicate JSON key, and `JSON.parse` accepts duplicates silently (last wins) with nothing failing at `i18n:check` parity time - a pre-existing key satisfies the consuming `t()` call either way, so only reading the landed file catches it. Never trust the append block over the file (instance: `updateFailed` already shipped by an earlier task's modal, re-added by a later page task).

## Key Removal Gates

- `key:rm` refuses while `key:find` still sees references; `--force` is only sane when the remaining hits are dead comments. Never force past a live reference - delete the referencing code (the dead component) in the same change.
- `key:find` matches static literals only: dynamic key variables and the `t('key', { ns })` option-object form are invisible to it, and bare-string matches count only in files that call `useTranslation` of that namespace. Pre-check the target namespace's `useTranslation` files when predicting gate outcomes.
- A section key (`key:rm common.errorMessage`) deletes the whole subtree in one call - prefer it over listing leaves.

## Round-Trip Gate

After any change to a writer: `npm run lang:add <code> ... && npm run lang:rm <code>` must leave `git diff backend/common/languages.json frontend/.i18rc` empty (covers push insert, middle splice insert, filter removal, and both no-ops). This is the only gate that proves byte preservation end to end.

## i18next ESLint Rule Config

`i18next/no-literal-string` (warn) is configured in `frontend/eslint.config.js`:

- String patterns are full-match anchored (the plugin appends `^pattern$`), so a prefix exclusion needs `^Owlgarth.*`, not `Owlgarth`.
- `words.exclude` REPLACES the plugin defaults, never extends them: restate digits, punctuation, and ALL-CAPS words when adding to it.
- The floor is ZERO: the historical 12-warning false-positive baseline was eliminated by hoisting, and `eslint.config.js` documents that any new warning is a regression. Fix a new finding by hoisting the literal out of the JSX expression container into a module-level const/helper, or by routing genuinely rendered text through `t()` - never by `eslint-disable`, and never by widening `words.exclude`, which would also silence those same words in genuine UI positions.
- Why hoisting is the sanctioned silence: in jsx-only mode the rule flags only literals lexically inside a JSX expression container, skips `t(...)` callees (ONLY the unaliased `t` - an aliased `tBookmarks('key')` is flagged in every JSX position; authoring rule in `frontend-react`), and skips non-`+` binary comparisons - a module-level const is structurally invisible while the rule stays fully armed inside JSX. UPPER_SNAKE authored literal consts (`DETAIL_TABS`) are VariableDeclarator-skipped in any position.
- The re-fire trap: a string literal passed as an argument of a non-excluded callee INSIDE JSX re-fires the rule (the `list('item-', i)` shape) - hoist an object-returning helper (`itemDomIds(i)`) instead of a string-suffix helper. Before converting a flagged site, verify what it renders: labels already resolved through `t()` are pure hoists with zero catalog edits.
- The plugin's TypeScript contextual-literal-union escape is dead under this config - linting runs non-type-checked, so a string-literal-typed argument stays flagged. Do not reach for it.
