# Application Workflow

The main user flows in Owlgarth Finances' account-based model. For the data model and
permissions see [architecture.md](architecture.md) and [permissions.md](permissions.md).

## Registration & Authentication

**Registration** (`POST /api/auth/register`): the user provides email, password,
workspace name, a **currency set** (ordered multi-select; the first becomes the
workspace primary), and consents to the current Terms/Privacy versions.
An optional "Start with sample data" checkbox seeds demo records. The system creates
the user, a workspace (the chosen set enabled verbatim, first = primary and the
Main account's currency), a default **Main** account, a **General** budget with starter
categories and the current period, and the owner membership - then returns access + refresh JWTs.
The create is synchronous and takes a few seconds; while it runs, the Register form is
replaced by a client-timed "Setting up your workspace" checklist panel (stages identical
on every path, including errors, so their count and timing never leak backend state).
An already-registered email fails with a generic error that never reveals the
account's existence; the existing address owner gets an email notice instead
(anti-enumeration).

**Login** (`POST /api/auth/login`): validates credentials; if 2FA is enabled, returns
a temporary token that must be exchanged via `POST /api/auth/verify-2fa`. Access
tokens are short-lived and refreshed through `POST /api/auth/refresh`; refresh tokens
issued before the user's last password change are rejected. Login and 2FA
verification are rate-limited per IP and per account/user (`429` when exceeded), and
each TOTP code is single-use. Every workspace-scoped request carries
`Authorization: Bearer <token>` and is validated by `WorkspaceJWTAuth`
(identity → membership → role → workspace-scoped query).

## Accounts & Balances

- **Dashboard** shows each account's **computed** balance (opening balance +
  transactions ± transfers) and recent activity. Nothing is stored - balances are
  always derived.
- **Accounts page** (admin+): create/edit/archive accounts. **"Set balance…"** records
  an *adjustment* transaction for the delta between the current and target balance -
  the app never overwrites a balance directly. A record-free archived account can be
  deleted; one with records is PROTECT-blocked (surfaced as a clear error).
- Each currency may have one **default account** (set with "Set as default for
  {currency}" in the account form; archiving a current default clears its flag). At
  most one per currency - flagging a new default clears the previous one.
- Single-account, single-currency workspaces hide the account/currency chrome.

## Transfers

Move money between two accounts (member+). The last-used account pair is remembered;
with exactly two accounts they auto-fill. **Cross-currency** transfers take both the
sent and received amounts and display the implied rate. "Repeat" prefills a past
transfer. Transfers replace the old currency-exchange records.

## Budgets & Planning

- A **Budget** has a cadence (monthly / every-N-weeks / custom). **Periods** are
  derived from the cadence and materialized on demand - the current period is created
  the first time it's needed. **Custom** budgets opt out of derivation: their periods
  are explicit, non-overlapping date ranges the user creates and manages.
- Creating a custom-cadence budget asks for the first period's start/end dates
  (defaulting to today through today + 29 days) and prefills a period name from
  the range ("04 Sep - 03 Oct 2026") that keeps re-deriving until edited; saving
  chains the budget create with the first period create.
- The budget create/edit modal also carries an **ordered currency set** (max 10,
  from the workspace's enabled currencies; first = default view). An untouched
  empty selection submits the workspace's primary; currencies the budget's data
  carries but the set omits stay visible after the configured ones.
- The **Budget detail** page shows a category table of **planned vs actual vs
  remaining** for the selected period, with a period switcher capped at seven rows
  centered on the viewed period plus a "View all periods" row that opens the
  periods page (the selection is carried in the `?period=` URL param, so reloads
  and shared links land on the chosen period; an invalid id falls back to the
  default pick). Opening a budget without the param lands on the current period -
  or, when none can be derived (custom cadence, a failed fetch), the period
  nearest today. Categories are created inline; planned amounts are edited inline
  (current period). Past periods render as read-only snapshots. Custom-cadence
  budgets get add/edit/delete period controls beside the switcher (admin+;
  deleting a period removes its planned amounts but never transactions), and a
  custom budget with no periods yet shows an "Add period" empty state instead of
  the table.
- Multi-currency budgets show one currency at a time, selected through a
  **per-currency totals strip** above the table (a chip per currency showing that
  currency's own planned total and a spend meter - amounts are never summed
  across currencies). The last-viewed currency is remembered per budget, and
  arrow keys cycle the strip; single-currency budgets show a plain code chip.
- The **budget periods page** (`/budgets/:id/periods`) lists every period of a
  budget as year-sectioned cards, newest first - a CURRENT chip on the active
  period, past periods muted. A card opens the budget detail page on that period
  via the same `?period=` param. It is reachable from the switcher's "View all
  periods" row and from the view-periods icon on a budget card (all roles);
  add-period (the budget card icon and the page button) is custom-cadence and
  admin-only, and the card edit/delete icons appear only on custom periods
  (admin).
- Categories and planned amounts are member+; creating budgets/periods is admin+.

## Transactions

- Create/edit via a modal (member+): type (income/expense/adjustment), amount, date,
  description, an optional account ("No account" records money without one - cash
  exchanged while traveling, a closed account's history; adjustments still require
  an account), a currency that locks to the account's when one is set and is freely
  chosen from the enabled set when not, optional budget→category, and an
  optional "paid in another currency" facet (which must differ from the own currency).
- The list supports account/type filters and pagination (plus a currency filter
  matching each transaction's stored own currency, hidden in single-currency
  workspaces); bulk account reassignment is available.
- **Line items** and **receipt attachments** are managed from the Items/Receipts tabs
  on an existing transaction. Items are informational (a mismatch hint appears when
  their sum differs from the amount); the transaction amount stays authoritative.
- Attached receipts are served through the authenticated API, never direct storage
  links: image receipts open in a lightbox with a download button; PDFs and HEICs
  download on click.

## Receipts & Extraction (optional)

When a parser is configured (`PARSER_URL`):
- **Extract items** on an attachment queues a background job; the UI polls, then opens
  a **review screen** with parsed fields, low-confidence flags, and warnings. The user
  edits and confirms **replace** or **append** into line items.
- **New from receipt** parses an upload *without persisting anything*, pre-fills a new
  transaction (total, date, merchant, items), and only creates the transaction +
  attachment + items on confirm. Cancel leaves no residue.
- **Account auto-select**: whenever a receipt is parsed (inline upload or receipt-first
  create), the account is auto-selected to match the parsed `currency` - preferring the
  per-currency **default account**, else the first account in that currency by ordering.
  An account whose currency already matches is left untouched (a deliberate pick is
  respected). If no account matches the currency, the selection is unchanged.

With no parser configured, every extraction affordance is hidden.

## Planned Transactions

Create scheduled transactions, optionally on an account and always in their own
currency (locked to the account's whenever one is set) (member+). **Execute** creates
a real transaction carrying the plan's account and currency (via a Celery task,
idempotent) and marks the planned item done. The list shares the Transactions
search/filters pattern, including the own-currency filter (URL-synced).

## Currencies

- **Enablement**: each workspace enables a subset of the global ISO 4217 catalog.
  Registration, account reset, and the in-app create-workspace modal all send an
  explicit `currency_codes` list (max 20, first = primary and Main-account
  currency) that is used verbatim; a service-level create without a list falls
  back to the primary currency plus silent EUR/USD extras.
- **Enabled-list order**: the backend returns enabled currencies in the
  workspace's stored order (`WorkspaceCurrency.position`, the primary first);
  new enablements append at the end, and account grids and other totals
  surfaces order by it.
- **Management** (admin+, Workspace Settings → Currencies): enable catalog
  currencies, create custom ones (always 2 decimals - storage and display are
  2dp everywhere), reorder the enabled set (per-row arrows; position 0 becomes
  the primary that leads every currency dropdown), and disable. A currency in
  use cannot be disabled: the guard counts per-type references (accounts,
  planned amounts, budget currency sets, planned transactions, transactions
  storing it as their own currency) and the error names them; the
  original-amount facet never blocks (a custom row it references stays in the
  catalog, re-enablable). The budget modal and the account form link here
  through "Manage currencies..." bridges.
- **Budget currency sets**: budgets carry an ordered set (max 10) from the
  enabled subset; the first entry is the default view in the budget table and
  the dashboard insights, which share one derivation.

## Workspaces & Members

Create/switch workspaces; the owner can rename or delete a workspace (deletion removes
all financial records in PROTECT-safe order, including stored receipt files).
Owners/admins add members and manage lower-role members' roles and passwords.
When adding a brand-new member the password is optional: with one it becomes their
initial password (shared out-of-band); without one the invitee receives an invitation
email with a set-password link (the standard reset flow). The response is the same
whether the invitee already had an account (anti-enumeration).

## Reports

- **Budget summary** (`/reports/budget-summary?budget_id&period_id`): planned vs
  actual vs remaining per category.
- **Current balances** (`/reports/current-balances`): per-account balances plus
  per-currency totals.

## Data Export / Import

- **Export** (`GET /users/me/export`): a v3.0 JSON of all workspaces, including line
  items and base64 receipt attachments.
- **Import** (`POST /users/me/import`): restores a v3.0 export (same-system);
  `rename`/`skip` conflict strategies.
- **Legacy import** (`POST /users/import-legacy`): converts a pre-redesign export to
  the account-based model and returns a per-account balance verification report.

## Releasing

Releases are cut from `main` with `./dev.sh release 0.1.0` (a bare version - the
script adds the `v` prefix). Pre-flight checks fail closed before anything is
written: the version must be strict `X.Y.Z` (digits only, no pre-release
suffix), the current branch must be `main`, the working tree clean, and the tag
must not exist yet. `--dry-run` prints every step without executing anything.
The command then:

- **Local gate** - runs `./dev.sh lint` and `./dev.sh test`. The gate is on by
  default; `--skip-tests` opts out - CI re-runs the tests as the authoritative
  gate.
- **Version files** - writes the version into `VERSION` and syncs it into
  `backend/pyproject.toml` and `frontend/package.json`.
- **Changelog** - prepends a section to `CHANGELOG.md` (the file is created by
  the first release): git-cliff groups conventional commits under Features /
  Bug Fixes / Documentation / Miscellaneous headings per `cliff.toml`; without
  git-cliff installed, a plain `git log` section is written instead.
- **Tag and push** - commits `chore(release): vX.Y.Z` (explicit file list
  only), creates the annotated tag, and pushes `main` and the tag. The local
  command stops there: the GitHub Release is created by CI, from the tag push.

**CI.** Pull requests and pushes to `main` run `ci.yml`, which calls the
reusable `ci-test.yml` workflow: backend `ruff check`, `ruff format --check`,
and `pytest` against a Postgres 17 service; frontend `npm ci`, `i18n:check`,
`lint`, `build`. Pushing a `v*` tag (or dispatching `release.yml` manually)
re-runs the same `ci-test.yml` as a gate, then builds
`ghcr.io/owlgarth/finances-backend` and `ghcr.io/owlgarth/finances-ui`
natively for amd64 and arm64 (one native runner per arch, no QEMU emulation),
merges the per-arch manifests into `vX.Y.Z` and `latest` tags, and - on a tag
push - creates the GitHub Release with git-cliff-generated notes. A dispatch
rebuild of an existing tag rebuilds the images but skips the Release.

**git-cliff.** CI self-installs the pinned v2.13.1 binary on the runner to
render the Release notes. Local runs need nothing: without git-cliff
installed, the changelog falls back to a plain `git log` section. Install
git-cliff v2.13.1 to `~/.local/bin` only if you want the grouped
`CHANGELOG.md` sections from local runs.

**One-time GitHub setup.** Set the `VITE_API_URL` repository variable
(Settings > Secrets and variables > Actions > Variables); release images fall
back to `https://finances.owlgarth.com/api` when it is unset. After the first
successful release, flip both GHCR packages (`finances-backend`,
`finances-ui`) to public - packages pushed by a workflow default to private.
And install the Renovate app on the org: `renovate.json` schedules weekly
update PRs for the Docker images (digest-pinned in the compose files), GitHub
Actions, npm, and Python dependencies.
