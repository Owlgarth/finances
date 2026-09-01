---
name: i18n-tooling
description: i18n toolchain conventions for Owlgarth Finances - the frontend/scripts/ i18n tools (i18n:check, lang:add/lang:rm, key:find/key:rm, i18n:extract), byte-preserving writers for backend/common/languages.json and frontend/.i18rc, catalog \uXXXX escape preservation, and the i18next ESLint rule config. Use when adding or removing languages, removing translation keys, editing the frontend/scripts/ i18n tools or i18n-lib.mjs, touching frontend/.i18rc or the language registry, or changing the i18next/no-literal-string ESLint configuration.
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

`JSON.stringify` de-escapes non-ASCII: catalog glyphs stored as `\u2014`/`\u2026` escapes (en values stay ASCII-clean by convention, docs/i18n.md Key conventions) come back as literal bytes. `i18n:check` parses both forms identically, so nothing functional fails - only diff/grep byte gates catch it. `key:rm` and `lang:add` currently serialize catalogs with plain `JSON.stringify` and de-escape every escape-carrying file they touch; after any such run, restore the escapes before committing - enumerable per file via `git show HEAD:<file> | grep -o '\\u[0-9a-f]\{4\}'`. The known fix (backlogged) is an ASCII-escaping serializer in `i18n-lib.mjs` shared by both tools.

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
- The warning count is a moving ceiling documented in `eslint.config.js` that only goes DOWN as literals become `t()` keys (baseline discipline in the `frontend-react` skill).
