# Frontend Application

React 19 SPA (Vite, TypeScript, TanStack Query) for the account-based Denarly model.

The detailed, authoritative frontend documentation lives next to the code:

- **[frontend/README.md](../frontend/README.md)** — project structure, pages &
  routes (Dashboard · Accounts · Budgets · Transactions · Planned · Members ·
  Settings), components, contexts, hooks (`useDomain`, `usePermissions`), the typed
  `api/client.ts` modules, core TypeScript types, query-key and mutation conventions,
  and styling.
- **[docs/architecture.md](architecture.md)** — how the frontend maps onto the
  account-based data model and the backend API.
- **[design/](../design/)** — the "Architectural Ledger" design system: `tokens.md`,
  `components.md` (incl. the primitive audit), `patterns.md` (incl. canonical
  CRUD/feedback patterns), `dark-mode.md`, `responsive.md`.

There is no global account or period context — data is read through
`hooks/useDomain.ts`, and period selection is local to the Budget detail page
(periods are per-budget). Receipt extraction UI is gated on `useExtractionEnabled()`
and hidden entirely when no parser is configured.
