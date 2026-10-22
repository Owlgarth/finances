import js from '@eslint/js'
import globals from 'globals'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['flat']['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: { i18next },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-refresh/only-export-components': 'off',
      // react-hooks v7's React-Compiler-era rule, kept explicitly at 'error' (the
      // recommended-latest preset default). The 16 pre-existing violations were
      // cleared by the 2026-09 react-hooks cleanup; set-state-in-effect and
      // exhaustive-deps both sit at 0 findings, so any new synchronous setState
      // inside an effect fails lint instead of accruing silent debt.
      'react-hooks/set-state-in-effect': 'error',
      // i18next/no-literal-string flags UI-facing string literals: JSX text and the
      // placeholder/title/alt/aria-label attributes. It is the guard against NEW
      // hardcoded English; t('key') calls (and template literals routed through t())
      // are the sanctioned escape. The rule sits at ZERO warnings: the historical
      // false-positive floor (class strings, DOM-id templates, internal key
      // arrays, and enum defaults built inside JSX expression containers) was
      // eliminated by hoisting those literals to module scope, so any warning
      // now is a regression. Fix new findings the same way - hoist the literal
      // out of the JSX container or route rendered text through t() - never by
      // widening words.exclude, which would also silence the same words in
      // genuine UI positions.
      'i18next/no-literal-string': ['warn', {
        framework: 'react',
        mode: 'jsx-only',
        'should-validate-template': true,
        'jsx-attributes': {
          include: ['^(placeholder|title|alt|aria-label)$'],
        },
        words: {
          exclude: [
            // Same shape as the plugin defaults (digits/punctuation-only, ALL-CAPS
            // like PLN or 2FA), widened with typographic separators and dashes that
            // the codebase keeps untranslated by convention (em-dash placeholders,
            // middle-dot separators, U+2212 minus, U+2190/U+2192 arrows between
            // data values, U+2026 ellipsis, U+00D7 quantity multiply). Patterns
            // are full-match anchored by the plugin, hence the .* on the brand
            // wordmark.
            '[0-9!-/:-@[-`{-~\\u00B7\\u00D7\\u2013\\u2014\\u2190\\u2192\\u2026\\u2212]+',
            // Keyboard-shortcut keycap labels (Sidebar search hint): key names
            // (Ctrl, Cmd glyph) are never translated.
            '(\\u2318K|Ctrl K)',
            '[A-Z_-]+',
            '^Owlgarth.*',
            '^(en|uk|pl|eu)$',
          ],
        },
      }],
    },
  },
])
