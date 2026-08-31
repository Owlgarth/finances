#!/usr/bin/env node
// Remove a UI language: deletes its locale directory and registry entry.
// usage: node scripts/lang-rm.mjs <code>
import { existsSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { LOCALES_DIR, readRegistry, writeRegistry } from './i18n-lib.mjs'

function usage() {
  console.error('usage: node scripts/lang-rm.mjs <code>')
  process.exit(1)
}

const args = process.argv.slice(2)
if (args.length !== 1) usage()
const [code] = args

const registry = readRegistry()

if (code === registry.defaultLanguage) {
  console.error(`lang-rm: '${code}' is the default language; the default language cannot be removed - change defaultLanguage first`)
  process.exit(1)
}
if (registry.languages.length <= 1) {
  console.error('lang-rm: cannot remove the last language')
  process.exit(1)
}
const entry = registry.languages.find((l) => l.code === code)
if (!entry) {
  console.error(`lang-rm: language '${code}' is not in the registry`)
  process.exit(1)
}

const langDir = path.join(LOCALES_DIR, code)
let nsCount = 0
if (existsSync(langDir)) {
  nsCount = readdirSync(langDir).filter((f) => f.endsWith('.json')).length
  rmSync(langDir, { recursive: true, force: false })
}

registry.languages = registry.languages.filter((l) => l.code !== code)
writeRegistry(registry)

console.log(`Removed language '${code}' (${entry.nativeName}): ${nsCount} namespace file(s) deleted, registry entry removed.`)
