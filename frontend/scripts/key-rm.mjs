#!/usr/bin/env node
// Remove a translation key from every language catalog of its namespace.
//   node scripts/key-rm.mjs accounts.form.title
//   node scripts/key-rm.mjs accounts:form.title --force
// Refuses (exit 1, zero writes) while scripts/key-find.mjs still finds code
// references; --force overrides the refusal (discouraged - only sane for keys
// whose remaining hits are dead comments). The reference gate spawns
// key-find.mjs instead of duplicating its logic so the finder and the remover
// can never disagree about what counts as a reference.
// Languages are enumerated from src/i18n/locales so catalogs added by lang-add
// are covered without editing this script.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { LOCALES_DIR, SCRIPTS_DIR } from './i18n-lib.mjs'

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

function usage() {
  console.error('usage: node scripts/key-rm.mjs <ns>.<path.to.key> | <ns>:<path.to.key> [--force]')
  process.exit(2)
}

const args = process.argv.slice(2).filter((a) => a !== '--force')
const force = process.argv.includes('--force')
if (args.length !== 1) usage()
const arg = args[0]

const sep = arg.includes(':') ? ':' : '.'
const idx = arg.indexOf(sep)
const ns = arg.slice(0, idx)
const keyPath = arg.slice(idx + 1).split('.')
if (!ns || keyPath.some((seg) => seg === '')) usage()

// 1. Reference gate - same code path as key-find, by construction.
const found = execFileSync(process.execPath, [path.join(SCRIPTS_DIR, 'key-find.mjs'), arg], {
  encoding: 'utf8',
})
if (found.trim() !== 'no references' && !force) {
  console.log('refusing: code references remain (rerun with --force to override):')
  console.log(found)
  process.exit(1)
}

// 2. Resolve every language's catalog file up front so a missing file refuses
// with zero writes instead of aborting mid-way through partial deletions.
const langs = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const files = langs.map((lang) => ({ lang, file: path.join(LOCALES_DIR, lang, `${ns}.json`) }))
for (const { lang, file } of files) {
  if (!existsSync(file)) {
    console.error(`key-rm: missing namespace file: src/i18n/locales/${lang}/${ns}.json`)
    process.exit(1)
  }
}

// 3. Delete the leaf (and its plural siblings) from each language's catalog.
const removed = []
for (const { lang, file } of files) {
  const catalog = JSON.parse(readFileSync(file, 'utf8'))
  let parent = catalog
  for (const seg of keyPath.slice(0, -1)) parent = parent?.[seg]
  const leaf = keyPath[keyPath.length - 1]
  if (parent && (leaf in parent || PLURAL_SUFFIXES.some((s) => `${leaf}${s}` in parent))) {
    delete parent[leaf]
    for (const s of PLURAL_SUFFIXES) delete parent[`${leaf}${s}`]
    // Same serialization as lang-add: 2-space JSON with a trailing newline.
    writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`)
    removed.push(lang)
  }
}

console.log(
  removed.length === 0
    ? `key not found in any catalog: ${arg}`
    : `removed ${arg} from: ${removed.join(', ')}`,
)
