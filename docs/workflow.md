# Application Workflow

The main user flows in Denarly's account-based model. For the data model and
permissions see [architecture.md](architecture.md) and [permissions.md](permissions.md).

## Registration & Authentication

**Registration** (`POST /api/auth/register`): the user provides email, password,
workspace name, a **currency**, and consents to the current Terms/Privacy versions.
An optional "Start with sample data" checkbox seeds demo records. The system creates
the user, a workspace (with that currency enabled), a default **Main** account, a
**General** budget with starter categories and the current period, and the owner
membership - then returns access + refresh JWTs. An already-registered email fails
with a generic error that never reveals the account's existence; the existing address
owner gets an email notice instead (anti-enumeration).

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
  (defaulting to today through today + 29 days) and prefills a period name from the
  range ("04 Sep - 03 Oct 2026") that keeps re-deriving until edited; saving chains
  the budget create with the first period create.
- The **Budget detail** page shows a category table of **planned vs actual vs
  remaining** for the selected period, with a period switcher. Categories are created
  inline; planned amounts are edited inline (current period). Past periods render as
  read-only snapshots. Custom-cadence budgets get add/edit/delete period controls
  beside the switcher (admin+; deleting a period removes its planned amounts but never
  transactions), and a custom budget with no periods yet shows an "Add period" empty
  state instead of the table.
- Categories and planned amounts are member+; creating budgets/periods is admin+.

## Transactions

- Create/edit via a modal (member+): type (income/expense/adjustment), amount, date,
  description, account (hidden at one account), optional budget→category, and an
  optional "paid in another currency" facet.
- The list supports account/type filters and pagination; bulk account reassignment is
  available.
- **Line items** and **receipt attachments** are managed from the Items/Receipts tabs
  on an existing transaction. Items are informational (a mismatch hint appears when
  their sum differs from the amount); the transaction amount stays authoritative.

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

Create scheduled transactions on an account (member+). **Execute** creates a real
transaction on the planned account (via a Celery task, idempotent) and marks the
planned item done.

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
