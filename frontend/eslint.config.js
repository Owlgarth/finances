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
      // are the sanctioned escape. The migration streams have landed, so the rule
      // now sits at its documented false-positive floor of 12 warnings, none of
      // them UI text:
      //   - className strings and class fragments built inside JSX expression
      //     containers (CommandPalette list(...) rows, BudgetDetailPage
      //     numberClass template)
      //   - DOM-id templates (TransactionItemsList item-{index}-form/name)
      //   - internal key arrays whose rendered labels already go through t()
      //     (BudgetInsights ['planned','actual'], TransactionFormModal
      //     ['items','receipts'])
      //   - a semantic enum default (SegmentedControl opt.tone ?? 'primary')
      // Excluding these by word pattern would also silence the same words in
      // genuine UI positions, so they stay as the documented floor. Never add a
      // new warning.
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
