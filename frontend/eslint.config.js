import js from '@eslint/js'
import globals from 'globals'
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
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-refresh/only-export-components': 'off',
      // eslint-plugin-react-hooks v7 added this React-Compiler-era rule. 19 pre-existing
      // set-state-in-effect violations across the codebase are tracked in the backlog
      // (Option A cleanup), plus 1 exhaustive-deps warning (AuthContext's
      // checkConsentStatus) in the same backlog — 20 warnings total. Kept as 'warn' so
      // the debt stays visible without failing lint; flip to 'off' for silent output,
      // or remove this line once the cleanup task lands.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
