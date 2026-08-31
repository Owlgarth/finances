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
      // eslint-plugin-react-hooks v7 added this React-Compiler-era rule. 19 pre-existing
      // set-state-in-effect violations across the codebase are tracked in the backlog
      // (Option A cleanup), plus 1 exhaustive-deps warning (AuthContext's
      // checkConsentStatus) in the same backlog - 20 warnings total. Kept as 'warn' so
      // the debt stays visible without failing lint; flip to 'off' for silent output,
      // or remove this line once the cleanup task lands.
      'react-hooks/set-state-in-effect': 'warn',
      // i18next/no-literal-string flags UI-facing string literals: JSX text and the
      // placeholder/title/alt/aria-label attributes. It is the guard against NEW
      // hardcoded English; t('key') calls (and template literals routed through t())
      // are the sanctioned escape. Added while the UI-migration streams are still
      // landing, so the baseline is a moving ceiling, not a frozen count: it captured
      // 24 warnings at add time across still-unmigrated pages, only goes DOWN as
      // literals become t() keys, and settles at the documented allowlist floor
      // (brand words, AttributionFooter LICENSE text). Never add a new warning.
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
            // middle-dot separators, U+2212 minus). Patterns are full-match
            // anchored by the plugin, hence the .* on the brand wordmark.
            '[0-9!-/:-@[-`{-~\\u00B7\\u2013\\u2014\\u2212]+',
            '[A-Z_-]+',
            '^Owlgarth.*',
            '^(en|uk|pl|eu)$',
          ],
        },
      }],
    },
  },
])
