#!/usr/bin/env node
// Prints the language registry as a table plus every locale directory with
// its namespace file count.
// usage: node scripts/lang-list.mjs
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { LOCALES_DIR, readRegistry } from './i18n-lib.mjs'

const registry = readRegistry()

console.log(`Languages (default: ${registry.defaultLanguage})`)
const codeWidth = Math.max(...registry.languages.map((l) => l.code.length)) + 2
const nameWidth = Math.max(...registry.languages.map((l) => l.englishName.length)) + 1
const nativeWidth = Math.max(...registry.languages.map((l) => `(${l.nativeName})`.length)) + 3
for (const lang of registry.languages) {
  const native = `(${lang.nativeName})`
  console.log(
    `  ${lang.code.padEnd(codeWidth)}${lang.englishName.padEnd(nameWidth)}${native.padEnd(nativeWidth)}date-fns: ${lang.dateFnsLocale}`
  )
}

console.log('')
console.log(`Number formats (default: ${registry.defaultNumberFormat})`)
for (const format of registry.numberFormats) {
  console.log(`  ${format.code.padEnd(codeWidth)}${format.label}`)
}

console.log('')
console.log('Locale files:')
const dirs = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
for (const dir of dirs) {
  const count = readdirSync(path.join(LOCALES_DIR, dir)).filter((f) => f.endsWith('.json')).length
  console.log(`  src/i18n/locales/${dir}/*.json (${count} namespace${count === 1 ? '' : 's'})`)
}
