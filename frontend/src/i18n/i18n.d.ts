// The import makes this file a module so the declare block below AUGMENTS
// i18next's own types instead of shadowing them.
import 'i18next'

// Static typegen for i18next: key types derive from the en catalogs, so
// t('loginForm.title') is checked against locales/en/auth.json automatically.
// Kept in sync with the locales/en directory by `npm run i18n:check`; never
// hand-edit the resource list when adding keys - only when adding a whole new
// namespace.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: {
      auth: typeof import('./locales/en/auth.json')
      nav: typeof import('./locales/en/nav.json')
      accounts: typeof import('./locales/en/accounts.json')
      transfers: typeof import('./locales/en/transfers.json')
      budgets: typeof import('./locales/en/budgets.json')
      transactions: typeof import('./locales/en/transactions.json')
      planned: typeof import('./locales/en/planned.json')
      dashboard: typeof import('./locales/en/dashboard.json')
      members: typeof import('./locales/en/members.json')
      settings: typeof import('./locales/en/settings.json')
      common: typeof import('./locales/en/common.json')
      numbers: typeof import('./locales/en/numbers.json')
    }
  }
}
