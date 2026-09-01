# Frontend Application

React 19 SPA (Vite, TypeScript, TanStack Query) for the account-based Owlgarth Finances model.

The detailed, authoritative frontend documentation lives next to the code:

- **[frontend/README.md](../frontend/README.md)** - project structure, pages &
  routes (Dashboard · Accounts · Budgets · Transactions · Planned · Transfers ·
  Members · Settings), components, contexts, hooks (`useDomain`, `usePermissions`), the typed
  `api/client.ts` modules, core TypeScript types, query-key and mutation conventions,
  and styling.
- **[docs/architecture.md](architecture.md)** - how the frontend maps onto the
  account-based data model and the backend API.
- **[design/](../design/)** - the "Architectural Ledger" design system: `tokens.md`,
  `components.md` (incl. the primitive audit), `patterns.md` (incl. canonical
  CRUD/feedback patterns), `dark-mode.md`, `responsive.md`.

There is no global account or period context - data is read through
`hooks/useDomain.ts`, and period selection is local to the Budget detail page
(periods are per-budget; the selection is deep-linkable via the `?period=` URL
param on `/budgets/:id`, and a per-budget periods overview lives at
`/budgets/:id/periods`). Receipt extraction UI is gated on `useExtractionEnabled()`
and hidden entirely when no parser is configured.

## Internationalization (i18n)

The UI ships in English, Ukrainian, and Polish; language and number-format are
per-user preferences with localStorage + browser detection for anonymous visitors.
Catalogs live in `src/i18n/locales/<lang>/<ns>.json` (12 domain namespaces);
`src/i18n/index.ts` initializes i18next synchronously before render (no flash), and
`LanguageContext` exposes `useLanguage()` for switching (optimistic local switch +
fire-and-forget preferences PATCH). Number/date formatting goes through the
`configureFormatting` singleton in `src/utils/format.ts` - `formatAmount` call sites
never pass a locale; changing the preference reconfigures the module.
`formatPeriodName` is the deliberate exception: its output is persisted as data and
never localizes. The full reference (registry, adding a language, key conventions,
tooling, backend gettext) is in **[docs/i18n.md](i18n.md)**.
