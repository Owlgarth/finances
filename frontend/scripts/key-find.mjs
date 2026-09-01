#!/usr/bin/env node
// Find code references to a translation key.
//   node scripts/key-find.mjs accounts.form.title
//   node scripts/key-find.mjs accounts:form.title
// Matches static string literals only: t('path'), t(`path`), t('ns:path'), and
// bare 'path' strings (module-level labelKey arrays) in files that call
// useTranslation('<ns>'). Comments count as references: this errs toward
// over-reporting because key-rm refuses to delete while ANY hit remains.
// Always exits 0 unless the argument is wrong (exit 2).
//
// Known limitations, kept deliberately: t(key) calls with a dynamic variable
// are invisible (the module-level arrays that feed them are caught by the
// bare-string match); the t('key', { ns }) option-object form is not matched.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { FRONTEND_DIR } from './i18n-lib.mjs'

const SRC = path.join(FRONTEND_DIR, 'src')

function usage() {
  console.error('usage: node scripts/key-find.mjs <ns>.<path.to.key> | <ns>:<path.to.key>')
  process.exit(2)
}

function parseArg(raw) {
  const colon = raw.indexOf(':')
  if (colon !== -1) return { ns: raw.slice(0, colon), key: raw.slice(colon + 1) }
  const dot = raw.indexOf('.')
  if (dot === -1) {
    console.error(`key-find: cannot split namespace from key: ${raw}`)
    process.exit(2)
  }
  return { ns: raw.slice(0, dot), key: raw.slice(dot + 1) }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

const arg = process.argv[2]
if (!arg) usage()
const { ns, key } = parseArg(arg)
const explicit = [`'${ns}:${key}'`, `"${ns}:${key}"`, `\`${ns}:${key}\``]
const bare = [`'${key}'`, `"${key}"`, `\`${key}\``]
const nsHook = [`useTranslation('${ns}')`, `useTranslation("${ns}")`]

const hits = []
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8')
  const sameNsFile = nsHook.some((h) => text.includes(h))
  text.split('\n').forEach((line, i) => {
    const explicitHit = explicit.some((p) => line.includes(p))
    const bareHit = bare.some((p) => line.includes(p))
    if (explicitHit || (bareHit && sameNsFile)) {
      hits.push(`${path.relative(FRONTEND_DIR, file)}:${i + 1}: ${line.trim()}`)
    }
  })
}

console.log(hits.length === 0 ? 'no references' : hits.join('\n'))
