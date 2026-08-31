#!/usr/bin/env node
// Add a UI language: registry entry + locale files.
// usage: node scripts/lang-add.mjs <code> <englishName> <nativeName> <dateFnsLocale>
//   code           ISO 639 code, ^[a-z]{2,3}$ (validated)
//   englishName    e.g. "German"
//   nativeName     e.g. "Deutsch"
//   dateFnsLocale  date-fns export name, e.g. "de"
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { LOCALES_DIR, NAMESPACES, readRegistry, writeRegistry } from './i18n-lib.mjs'

function usage() {
  console.error('usage: node scripts/lang-add.mjs <code> <englishName> <nativeName> <dateFnsLocale>')
  console.error('  code           ISO 639 code, ^[a-z]{2,3}$ (validated)')
  console.error('  englishName    e.g. "German"')
  console.error('  nativeName     e.g. "Deutsch"')
  console.error('  dateFnsLocale  date-fns export name, e.g. "de"')
  process.exit(1)
}

const args = process.argv.slice(2)
if (args.length !== 4) usage()
const [code, englishName, nativeName, dateFnsLocale] = args
if (!/^[a-z]{2,3}$/.test(code)) {
  console.error(`lang-add: invalid code '${code}' - must match ^[a-z]{2,3}$`)
  process.exit(1)
}

const registry = readRegistry()
// The default language is always a member of the list, so this also refuses
// "re-adding" en; adding any brand-new code is fine.
if (registry.languages.some((l) => l.code === code)) {
  console.error(`lang-add: language '${code}' already exists in the registry`)
  process.exit(1)
}

// Insert at the code-sorted position WITHOUT reordering the existing
// entries: re-sorting the whole array would rewrite unrelated registry lines
// and break the add/remove round trip's byte-identity (the shipped registry
// is in insertion order, not code order).
const entry = { code, englishName, nativeName, dateFnsLocale }
const index = registry.languages.findIndex((l) => l.code > code)
if (index === -1) registry.languages.push(entry)
else registry.languages.splice(index, 0, entry)
writeRegistry(registry)

const langDir = path.join(LOCALES_DIR, code)
mkdirSync(langDir, { recursive: true })
for (const ns of NAMESPACES) {
  // Copy the CURRENT en values, not empty catalogs: i18n:check then reports
  // every key as untranslated, so the language cannot merge with English
  // placeholders still in place.
  const enJson = JSON.parse(readFileSync(path.join(LOCALES_DIR, 'en', `${ns}.json`), 'utf8'))
  writeFileSync(path.join(langDir, `${ns}.json`), JSON.stringify(enJson, null, 2) + '\n')
}

console.log(`Added language '${code}' (${nativeName}) with ${NAMESPACES.length} namespace files copied from en.`)
console.log('REMEMBER: add the date-fns import in frontend/src/i18n/dateLocales.ts')
console.log(`  import { ${dateFnsLocale} } from 'date-fns/locale'  (export name: ${dateFnsLocale})`)
console.log("REMEMBER: update the hardcoded mini-list in frontend/index.html's FOUC script.")
console.log(`i18n:check will fail for '${code}' until the copied English values are translated.`)
