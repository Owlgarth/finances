#!/usr/bin/env node
// i18n:check - locale catalog gate. locales/en is the source of truth.
// Checks per non-en language and namespace:
//   1. missing keys (in en, absent in lang)
//   2. extra keys (in lang, absent in en)
//   3. empty string values ("" in en or lang)
//   4. untranslated values (lang value === en value) for non-plural keys,
//      unless allowlisted in scripts/i18n-allowlist.json
//   5. plural families: every en plural base key has exactly the category
//      set the language requires (derived from Intl.PluralRules)
//   6. i18n.d.ts lists every namespace present in locales/en
// Exit 0 = clean; exit 1 = problems (all of them printed, never only the
// first - CI gates on the exit code).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ALLOWLIST_PATH, DTS_PATH, LOCALES_DIR } from './i18n-lib.mjs'

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other']
// Probe counts whose combined Intl.PluralRules categories cover every
// distinction the shipped languages make: en -> one, other; uk/pl ->
// one, few, many, other. Categories are always derived from the platform's
// CLDR data, never hardcoded per language, so languages added by lang-add
// are checked without editing this script; supporting a language with rarer
// categories (e.g. Arabic zero/two) means deliberately extending this list.
const PLURAL_PROBE_COUNTS = [0, 1, 2, 3, 5, 11, 21, 22, 25, 101]

const failures = []
const fail = (msg) => failures.push(msg)

// { "a": { "b": "x" } } -> { "a.b": "x" } - dotted paths mirror i18next
// lookup keys.
function flatten(obj, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') Object.assign(out, flatten(v, key))
    else out[key] = v
  }
  return out
}

const isPluralKey = (key) => PLURAL_SUFFIXES.some((s) => key.endsWith(`_${s}`))
const pluralBase = (key) => key.replace(/_(zero|one|two|few|many|other)$/, '')

function requiredPluralCategories(lang) {
  const rules = new Intl.PluralRules(lang)
  const cats = new Set(PLURAL_PROBE_COUNTS.map((n) => rules.select(n)))
  cats.add('other') // 'other' is always required by i18next
  return cats
}

// Parse a JSON file; a parse failure is collected as a check failure and the
// caller skips the file (null return) instead of crashing mid-report.
function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    fail(`${label}: unreadable or invalid JSON (${err.message})`)
    return null
  }
}

const rel = (lang, ns) => `src/i18n/locales/${lang}/${ns}.json`

// --- languages and en namespaces -------------------------------------------

const langs = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

if (!langs.includes('en')) {
  fail('src/i18n/locales/en/ is missing - en is the source of truth for every catalog')
}

const enNamespaces = langs.includes('en')
  ? readdirSync(path.join(LOCALES_DIR, 'en'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length))
      .sort()
  : []

// Check 6: the typegen resource list must cover every en namespace, or t()
// silently loses type checking for the missing one.
let dts = ''
try {
  dts = readFileSync(DTS_PATH, 'utf8')
} catch {
  fail('src/i18n/i18n.d.ts: file missing - namespace typegen coverage cannot be verified')
}
for (const ns of enNamespaces) {
  if (!dts.includes(`import('./locales/en/${ns}.json')`)) {
    fail(`src/i18n/i18n.d.ts: namespace '${ns}' is missing from the resources block`)
  }
}

// Allowlist shape: { "uk": ["<ns>.<key.path>"], ... } - flat, one entry per
// key, plural variants listed individually.
const allowlist = readJson(ALLOWLIST_PATH, 'scripts/i18n-allowlist.json') ?? {}

// Check 3 (en side): "" is never a valid value in any catalog, including en.
for (const ns of enNamespaces) {
  const enJson = readJson(path.join(LOCALES_DIR, 'en', `${ns}.json`), rel('en', ns))
  if (enJson === null) continue
  for (const [key, value] of Object.entries(flatten(enJson))) {
    if (value === '') fail(`${rel('en', ns)}: empty value for key '${key}' ("" is never a valid value)`)
  }
}

// --- per-language checks ----------------------------------------------------

for (const lang of langs) {
  if (lang === 'en') continue

  const langDir = path.join(LOCALES_DIR, lang)
  const langNamespaces = new Set(
    readdirSync(langDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length))
  )
  const required = requiredPluralCategories(lang)
  const requiredList = [...required].sort().join(', ')
  const allowed = new Set(allowlist[lang] ?? [])

  // A namespace file that exists only in this language loads as a lang-only
  // catalog at runtime; report once per file.
  for (const ns of [...langNamespaces].filter((ns) => !enNamespaces.includes(ns)).sort()) {
    fail(`${rel(lang, ns)}: namespace file is not present in en (extra namespace)`)
  }

  for (const ns of enNamespaces) {
    const enJson = readJson(path.join(LOCALES_DIR, 'en', `${ns}.json`), rel('en', ns))
    if (enJson === null) continue
    const enFlat = flatten(enJson)
    const enPluralBases = new Set(Object.keys(enFlat).filter(isPluralKey).map(pluralBase))
    // Keys under an en plural family are owned by the plural check below, so
    // the missing/extra key checks do not double-report them.
    const inEnPluralFamily = (key) => isPluralKey(key) && enPluralBases.has(pluralBase(key))

    if (!langNamespaces.has(ns)) {
      // An absent file with an empty en catalog is fine (nothing to
      // translate yet); otherwise report once per file, not per key.
      if (Object.keys(enFlat).length > 0) {
        fail(`${rel(lang, ns)}: file missing - all ${Object.keys(enFlat).length} en key(s) absent`)
      }
      continue
    }

    const langJson = readJson(path.join(langDir, `${ns}.json`), rel(lang, ns))
    if (langJson === null) continue
    const langFlat = flatten(langJson)

    // Checks 1 and 2: key parity with en.
    for (const key of Object.keys(enFlat)) {
      if (inEnPluralFamily(key)) continue
      if (!(key in langFlat)) fail(`${rel(lang, ns)}: missing key '${key}' (present in en)`)
    }
    for (const key of Object.keys(langFlat)) {
      if (inEnPluralFamily(key)) continue
      if (!(key in enFlat)) fail(`${rel(lang, ns)}: extra key '${key}' (not present in en)`)
    }

    // Check 3 (lang side).
    for (const [key, value] of Object.entries(langFlat)) {
      if (value === '') fail(`${rel(lang, ns)}: empty value for key '${key}' ("" is never a valid value)`)
    }

    // Check 4: untranslated copies of en. Plural-suffixed keys are skipped -
    // an untranslated plural twin is a plural-family problem reported by
    // check 5 with the whole family named.
    for (const [key, enValue] of Object.entries(enFlat)) {
      if (isPluralKey(key)) continue
      if (!(key in langFlat) || langFlat[key] === '' || enValue === '') continue
      if (langFlat[key] === enValue && !allowed.has(`${ns}.${key}`)) {
        fail(
          `${rel(lang, ns)}: untranslated value for key '${key}' (identical to en; ` +
            `add '${ns}.${key}' to scripts/i18n-allowlist.json if intentional)`
        )
      }
    }

    // Check 5: each en plural family must have exactly this language's
    // required categories - no missing category, no unexpected one. A base
    // key that is plain in en may not grow suffixes in another language;
    // check 2 already reports those as extra keys.
    for (const base of enPluralBases) {
      const missing = PLURAL_SUFFIXES.filter((s) => required.has(s) && !(`${base}_${s}` in langFlat))
      const unexpected = PLURAL_SUFFIXES.filter((s) => !required.has(s) && `${base}_${s}` in langFlat)
      if (missing.length > 0) {
        fail(`${rel(lang, ns)}: plural family '${base}': missing ${missing.map((s) => `_${s}`).join(', ')} for ${lang} (requires ${requiredList})`)
      }
      if (unexpected.length > 0) {
        fail(`${rel(lang, ns)}: plural family '${base}': unexpected ${unexpected.map((s) => `_${s}`).join(', ')} for ${lang} (requires ${requiredList})`)
      }
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`i18n:check: ${f}`)
  console.error(`i18n:check FAILED (${failures.length} problem(s))`)
  process.exit(1)
}
console.log(`i18n:check OK (${langs.length} languages, ${enNamespaces.length} namespaces)`)
