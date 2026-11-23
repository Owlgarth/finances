# AGENTS.md

Coding guidelines and commands for agentic coding agents working on the Owlgarth Finances codebase.

## Project Overview

Owlgarth Finances is a personal finance tracking application built with Django 6, Django Ninja, React 19, and PostgreSQL. It uses an account-based model: money-holding accounts (with computed balances), budgets that plan money over derived periods, transfers between accounts, and multi-currency support via a global ISO 4217 catalog. It also supports receipt attachments with optional automated line-item extraction, and collaborative team features. See `docs/architecture.md`.

## Build/Lint/Test Commands

### Agent verification commands

With the default `DEV_TARGET=docker`, run every check through `./dev.sh`: `frontend/node_modules` is installed by the node container, so host `npm` commands fail on its native binaries. The host forms in the sections below apply with `DEV_TARGET=host`; the one exception is read-only backend lint, which works on the host in either mode because `uv run` keeps its own `backend/.venv`.

```bash
./dev.sh npm run build         # tsc + Vite build
./dev.sh npm run lint
./dev.sh npm run i18n:check    # CI runs it
./dev.sh test [pytest args]    # needs ./dev.sh up (db)
./dev.sh lint                  # WRITES fixes: ruff check --fix + ruff format + eslint (implementers)
cd backend && uv run ruff check . && uv run ruff format --check .   # read-only backend lint (gates, reviewers)
```

### Backend (Django)

The commands below are the host workflow (`DEV_TARGET=host`). When running Python directly on the host, always use the virtual environment: `backend/.venv/bin/python`. The default `./dev.sh` route (`./dev.sh test`, `./dev.sh lint`, `./dev.sh manage ...`) runs the same commands in the containers - see Full Stack below.

```bash
cd backend

# Setup
uv venv && source .venv/bin/activate
uv sync
python manage.py migrate

# Development
python manage.py runserver

# Testing
pytest                                    # Run all tests
pytest transactions/tests.py::TestClass::test_method  # Single test
pytest -k "test_create"                   # Run tests matching pattern
pytest --create-db -v                     # Fresh test DB (stale cross-branch migration issues)

# Linting & Formatting
uv run ruff check --fix .                 # Check + auto-fix lint issues
uv run ruff format .                      # Format code
```

Always run `uv run ruff check` and `uv run ruff format` after making changes.

### Frontend (React + Vite)

```bash
cd frontend

npm install                               # Setup
npm run dev                               # Runs at http://localhost:5173 (or VITE_PORT)
npm run build                             # TypeScript check + Vite build
npm run lint                              # ESLint check
npm run i18n:check                        # Translation catalog parity (CI runs this too)
```

Always run `npm run lint` after making changes; run `npm run i18n:check` after changing translation catalogs.

There is no frontend test suite - verification is `npm run lint` + `npm run build`.

### Full Stack (Docker)

Default workflow (`DEV_TARGET=docker`): everything runs in containers, driven through `./dev.sh`.

```bash
cp example.env .env    # every setting, including published ports
./dev.sh up            # db, redis, storage
./dev.sh backend       # api + Celery worker (host mode: migrate, seed, uvicorn --reload, worker)
./dev.sh frontend      # Vite dev server
./dev.sh up --full     # everything in Docker instead (adds api, ui, worker, beat)
./dev.sh release 0.1.0 # cut a release: checks, changelog, commit, tag, push
```

`./dev.sh` is the single entry point and covers everything else too -
`down`/`logs`/`ps`, plus `manage`, `migrate`, `seed`, `shell`, `psql`, `test`,
`lint`, `npm`; run it with no arguments for the list.

Backend and frontend commands run **inside the `api` and `node` containers** by
default (`DEV_TARGET=docker` in `.env`), as the invoking user so nothing lands in
the checkout owned by root. `DEV_TARGET=host` runs them through `uv` in
`backend/` and `npm` in `frontend/` instead, with the service hostnames rewritten
to the published ports; it can also be set per command
(`DEV_TARGET=host ./dev.sh test`).

## Working Rules

- Never stage or commit personal data exports (`*_data_export_*.json`); stage explicit paths only - no `git add -A` / `git add .`.
- Every published port comes from `.env` (`DB_PORT`, `REDIS_PORT`, `API_PORT`, `UI_PORT`, `STORAGE_PORT`, `STORAGE_CONSOLE_PORT`). Check `docker ps` before starting the stack and shift those values rather than stopping someone else's containers - a shared Postgres/Redis and other checkouts of this repo may already hold the defaults. Backend pytest against a running Postgres is safe (Django creates an isolated `test_*` database).

## Data Model

Money-holding accounts are the centre of gravity; balances and periods are computed/derived, not stored:

```
Workspace → { WorkspaceMember, WorkspaceCurrency, Bookmark, UserWorkspaceSettings,
              Account → [Transaction → (TransactionItem, TransactionAttachment), Transfer,
                         PlannedTransaction, RecurringTransaction],
              Budget → [BudgetCurrency, Category, Period → CategoryBudget] }
```

Currencies come from a global ISO 4217 catalog that each workspace enables a subset of. See `docs/architecture.md`.

Every endpoint must verify resources belong to the user's workspace. Four security layers: JWT auth (`JWTAuth`/`WorkspaceJWTAuth`), workspace membership, role permissions (`require_role`), and workspace-scoped queries (`Model.objects.for_workspace(workspace_id)`).

## Documentation Map

- `docs/architecture.md`: system architecture and data model
- `docs/frontend.md`: frontend structure
- `docs/i18n.md`: internationalization - languages, namespaces, translation tooling, backend gettext workflow
- `docs/mobile-ux.md`: mobile interaction spec
- `docs/permissions.md`, `docs/users-and-roles.md`: roles and access
- `docs/workflow.md`: development workflow
- `docs/parser-contract.md`: receipt parser HTTP contract (external service)
- `docs/self-hosting.md`: running published release images (the prod/ compose)
- `design/`: design tokens, components, patterns, responsive rules

## Detailed Conventions (Skills)

Detailed conventions live in skills under `.agents/skills/`. Load every skill that covers your area before writing code. Each `SKILL.md` holds the core rules plus a "Read Before You Edit" table; the larger skills keep their detailed patterns in a `references/` folder beside it - read the reference files that table names for your change.

| Skill | Load when working on |
|-------|----------------------|
| `django-backend` | Any backend code except tests: endpoints, services, models, migrations, schemas, exceptions, queries |
| `backend-testing` | Backend tests |
| `celery-tasks` | Celery tasks and dispatching background work from services |
| `auth-security` | Auth, tokens, 2FA, rate limiting, anti-enumeration, any security-sensitive endpoint |
| `email-sending` | Sending emails, email templates, `EmailService` |
| `data-deletion-gdpr` | Adding or removing models, FK/on_delete changes, delete_account, export/import, legal documents |
| `frontend-react` | Any frontend code |
| `frontend-live-stack-probing` | Verifying behavior against a live dev stack (browser probes, container probes), or budgeting a static fallback when no stack is available |
| `i18n-tooling` | Languages, catalog keys, the i18n scripts and extractor config, no-literal-string lint config |
| `npm-dependency-refresh` | Frontend dependency bumps, npm audit triage, `package-lock.json` regeneration |
| `docker-infra` | Compose files, Dockerfiles, entrypoints, nginx, S3 storage, `dev.sh`, backend dependency and Python-version upgrades |
| `ci-releases` | GitHub Actions workflows, Dependabot config, release tooling (VERSION, cliff.toml, GHCR publishing) |
| `docs-accuracy` | Editing README, `docs/` or `design/` markdown, documentation audits |
