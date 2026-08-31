// Shared constants and path helpers for the i18n tooling scripts. Plain Node
// ESM with no dependencies; requires Node >= 20.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
export const FRONTEND_DIR = path.resolve(SCRIPTS_DIR, '..')
export const LOCALES_DIR = path.join(FRONTEND_DIR, 'src/i18n/locales')
export const DTS_PATH = path.join(FRONTEND_DIR, 'src/i18n/i18n.d.ts')
export const ALLOWLIST_PATH = path.join(SCRIPTS_DIR, 'i18n-allowlist.json')
export const REGISTRY_PATH = path.resolve(FRONTEND_DIR, '../backend/common/languages.json')

// Mirror of NAMESPACES in frontend/src/i18n/index.ts: the Vite module cannot
// be imported from plain Node scripts, so the list is duplicated here. When a
// namespace is added or renamed, update both lists in the same change.
export const NAMESPACES = [
  'auth', 'nav', 'accounts', 'transfers', 'budgets', 'transactions',
  'planned', 'dashboard', 'members', 'settings', 'common', 'numbers',
]

export function readRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
}

// Serializes in the registry's established byte style: 2-space indent for the
// top-level structure, one flat entry per line inside arrays, trailing
// newline. A plain JSON.stringify(registry, null, 2) would expand the array
// entries to multi-line objects and dirty the file after an add/remove round
// trip; this serializer keeps such round trips byte-identical.
export function writeRegistry(registry) {
  const inline = (obj) =>
    '{' + Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ') + '}'

  const lines = ['{']
  const entries = Object.entries(registry)
  entries.forEach(([key, value], index) => {
    const isLast = index === entries.length - 1
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`  ${JSON.stringify(key)}: []${isLast ? '' : ','}`)
        return
      }
      lines.push(`  ${JSON.stringify(key)}: [`)
      value.forEach((item, i) => {
        lines.push(`    ${inline(item)}${i === value.length - 1 ? '' : ','}`)
      })
      lines.push(`  ]${isLast ? '' : ','}`)
    } else {
      lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${isLast ? '' : ','}`)
    }
  })
  lines.push('}')
  writeFileSync(REGISTRY_PATH, lines.join('\n') + '\n')
}
