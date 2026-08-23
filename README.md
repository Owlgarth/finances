# Denarly

A modern, full-stack personal finance tracking application built on money-holding accounts with computed balances, budgets that plan money over derived periods, transfers between accounts, multi-currency support, receipt attachments with optional automated line-item extraction, and collaborative team features.

[![CI](https://github.com/erikmoroz/denarly/actions/workflows/ci.yml/badge.svg)](https://github.com/erikmoroz/denarly/actions/workflows/ci.yml)
![Tech Stack](https://img.shields.io/badge/Django-092E20?style=flat&logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white)

## ⚠️ Important Notices

### AI-Assisted Development

**This codebase contains code generated with the help of AI tools.** The application was developed using AI-assisted coding tools to accelerate development and explore modern development workflows.

### Developer's Note

This project started as a personal pet project to replace Excel spreadsheets for my personal budgeting needs. I wanted to test the capabilities of AI development tools while solving a real problem I had. The result exceeded my expectations, so I've decided to continue developing Denarly as an open-source application.

---

## Overview

Denarly is a comprehensive financial management tool designed for individuals and teams:

- **Accounts with computed balances** - Cash, bank, and other accounts; every balance is derived from opening balance + transactions ± transfers, never stored
- **Budgets & derived periods** - Budgets plan money with a cadence (monthly / every-N-weeks / custom); periods materialize on demand; per-category planned-vs-actual
- **Transfers** - Move money between accounts, including cross-currency with an implied rate
- **Multi-Currency Support** - A global ISO 4217 catalog; each workspace enables a subset
- **Receipts** - Attach receipt images/PDFs; optionally extract line items and totals via a configurable model, then review and confirm
- **Planned Transactions** - Schedule and execute future transactions on an account
- **Role-Based Access Control** - Owner, Admin, Member, and Viewer roles
- **GDPR** - Export/import, account deletion, and a legacy-import path for migrating older data
- **Light & Dark Mode** - Theme toggle that follows the OS preference until you choose, with no flash on load

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.13+ (for local development)

### Installation

1. **Clone and configure:**

   ```bash
   git clone <repository-url>
   cd denarly
   cp example.env .env
   ```

   Every setting lives in `.env`: database credentials, secrets, and every
   published port (`DB_PORT`, `API_PORT`, `UI_PORT`, ...). Nothing is
   hardcoded - if a port is already taken on your machine, change it there and
   everything follows.

2. **Start the stack.** Two ways to run it, both driven by the same `.env`:

   ```bash
   ./dev.sh up --full    # one command: the whole stack in Docker, app included
   ```

   ```bash
   ./dev.sh up           # day to day: db, redis, storage in Docker
   ./dev.sh backend      # migrate + seed, then uvicorn --reload and a Celery worker
   ./dev.sh frontend     # Vite dev server (one terminal each, hot reload)
   ```

   `--full` is the shortest path to a running app. The three-terminal variant
   is the day-to-day setup: services stay in Docker while the backend and
   frontend run with hot reload. Services: `db`, `redis`, `storage` by
   default; the full run adds `api`, `ui`, `worker` and `beat`; the optional
   `parser` starts with `./dev.sh up parser`.

   **Docker or your machine?** By default `./dev.sh` runs the backend and
   frontend inside their containers, so Python, uv and Node only have to exist
   in the images - handy for a remote interpreter in PyCharm, or any machine
   without the right versions installed. Set `DEV_TARGET=host` in `.env` to use
   your own uv and npm instead (faster), or switch per command:
   `DEV_TARGET=host ./dev.sh test`.

3. **Open the app** - the URLs use the `example.env` defaults and follow
   `*_PORT` from `.env`:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/api/docs
   - Storage console: http://localhost:9001

4. **Log in** with the demo credentials: `demo@example.com` / `password123`

From here, [Development](#development) covers everyday commands, tests, lint,
and running without Docker.

### Demo Mode

Demo Mode is for running a publicly accessible demo instance: anyone can
explore the app by logging in with the shared demo account, but nobody can
create a new account of their own. Everything else - login and every feature -
works normally.

Enable it on both sides:

```bash
# Backend
DEMO_MODE=true

# Frontend
VITE_DEMO_MODE=true
```

Behavior:

- **Backend** (`DEMO_MODE=true`): `POST /api/auth/register` returns
  `403 "Registration is disabled in demo mode"`. Takes effect after a backend
  restart.
- **Frontend** (`VITE_DEMO_MODE=true`): `/register` redirects to `/login`, and
  the login page hides its register link. `VITE_*` variables are baked in at
  build time, so flipping this flag requires a frontend rebuild - or a
  dev-server restart during development.

## Tech Stack

| Layer | Technology                                               |
|-------|----------------------------------------------------------|
| Frontend | React 19, TypeScript, Vite, TanStack Query, Tailwind CSS |
| Backend | Django 6, Django Ninja, Python 3.13+                     |
| Database | PostgreSQL 17                                            |
| Task Queue | Celery with Redis broker                               |
| Storage | S3-compatible object storage (receipt attachments)     |
| Receipt parser | FastAPI service (optional), any OpenAI-compatible vision model |
| Auth | JWT with bcrypt                                          |

## Receipt Extraction (optional)

Denarly can read receipts to pre-fill line items and totals. This is powered by a
separate, stateless service in [`services/receipt-parser/`](services/receipt-parser/)
that talks to any OpenAI-compatible vision model (local via Ollama/vLLM, or hosted).

- It is wired into `docker-compose.yml` as `parser` (port 8100), started with
  `./dev.sh up parser` and enabled for the backend via `PARSER_URL` /
  `PARSER_API_TOKEN`.
- **It is entirely optional.** With `PARSER_URL` unset, the backend reports extraction
  as disabled and the UI hides every extraction affordance — no dead buttons.
- Point it at your model with `PARSER_MODEL_BASE_URL` / `PARSER_MODEL_NAME`
  (see `services/receipt-parser/.env.example`). `qwen2.5-vl` via Ollama is a good
  self-hosted default.

See the [parser README](services/receipt-parser/README.md).

## GDPR Compliance

Denarly includes built-in GDPR compliance features:

- **Consent Management** — Track user consent for Terms of Service and Privacy Policy
- **Right to Erasure** — Users can delete their account and all associated data
- **Data Export** — Complete data portability in JSON format
- **Legal Document Templates** — Customizable privacy policy and terms of service

**Self-Hosting Configuration:**

Legal documents support both companies and individuals as data controllers. Configure via environment variables:

```bash
LEGAL_OPERATOR_NAME="Your Company"     # or individual name
LEGAL_OPERATOR_TYPE=company            # or 'individual'
LEGAL_CONTACT_EMAIL=legal@example.com
LEGAL_JURISDICTION="Your Jurisdiction"
```

See [GDPR Documentation](docs/gdpr/README.md) for details.

## Project Structure

```
denarly/
├── backend/                    # Django Ninja REST API
├── frontend/                   # React SPA
├── services/receipt-parser/    # Optional receipt extraction service (FastAPI)
├── docs/                       # Architecture and specifications
├── dev.sh                      # The dev entry point: start, compose, manage.py, tests, lint
└── docker-compose.yml
```

## Documentation

| Document | Description |
|----------|-------------|
| **[Backend README](backend/README.md)** | Reference for the Django API: a purpose table for every Django app, the shared `common/` module (JWT auth, email, storage), a complete endpoint reference covering every route with its method and purpose, the JWT auth and token lifecycle, the service-layer convention, testing instructions, and the environment variables. Answers "which API endpoints exist, and how do I call or test them?" |
| **[Frontend README](frontend/README.md)** | Reference for the React app: the tech-stack table, a map of `src/` (components, contexts, hooks, pages), the pages-and-routes table, context and hook APIs (`AuthContext`, `useDomain`, `usePermissions`), the typed API client modules, the design-system tokens, and the env vars including the build-time `VITE_*` flags. Answers "where does a piece of the UI live, and how is it wired?" |
| [Architecture](docs/architecture.md) | The system-level design: a component diagram, the account-based data model with its key-principles table (balances are computed and never stored, periods derive from a budget's cadence, transfers replace the old exchanges, the original-amount facet, adjustments), directory maps for both sides, the async Celery flows, the four auth layers with rate limiting, env configuration, and deployment topology. Answers "how is the system designed, and why?" |
| [Receipt Parser](services/receipt-parser/README.md) | The optional stateless FastAPI service that turns receipt images and PDFs into structured JSON: its endpoints, upload/page/timeout limits, every `PARSER_*` variable, and the hybrid pipeline where a machine-read transcript fact-checks the vision model's numbers to ground the confidence scores, plus local and Docker run instructions and offline tests. Answers "how does receipt extraction work, and how do I point it at my own model?" |
| [Workflow](docs/workflow.md) | The end-to-end user flows: registration with its anti-enumeration behavior, accounts and Set-balance adjustments, transfers, budget cadences and derived periods, transactions with line items, the receipt-extraction review flow, planned transactions, members and invites, reports, and export/import. Answers "what actually happens, step by step, when a user does X?" |
| [Permissions](docs/permissions.md) | The authorization model: the four-layer security diagram, the role hierarchy, complete per-feature permission matrices (owner/admin/member/viewer × action) across accounts, currencies, budgets, categories, transactions, receipts, transfers, planned transactions, members, and settings, plus the backend enforcement code (`WorkspaceJWTAuth`, `require_role`, `for_workspace`), the frontend visibility hooks, and the error codes. Answers "who is allowed to do what, and where is it enforced?" |
| [Users & Roles](docs/users-and-roles.md) | The user model and the people around it: user fields, per-role capability, restriction, and use-case write-ups for owner, admin, member, and viewer, the membership rules, member-management operations (adding, role changes, removal, password resets, leaving), the auth flow, and multi-workspace scenarios. Answers "what does each role mean in practice, and how are members managed?" |

## Development

### Everyday commands

`./dev.sh` is the single entry point for working on the repo: it wraps
`docker compose` for the backing services and runs the backend and frontend
tooling - server, worker, pytest, ruff, npm - either inside their containers
or on your machine. It sources `.env` on every run, honors `DEV_TARGET`
(`docker` or `host`) to decide where app commands run, and executes everything
as the invoking user, so files written into the checkout (new migrations,
caches) belong to you and not to root.

Run `./dev.sh <command> [args]`, or `./dev.sh` with no arguments to print the
full command list (excerpt):

```text
Usage: ./dev.sh <command> [args]

Start (one terminal each)
  up [svc...]           Services in Docker (default: db redis storage)
  up --full             Everything in Docker, app included
  backend               API + Celery worker, after migrate/seed
  frontend              Vite dev server
```

After `./dev.sh up` brings the services up, it prints where they landed (the
ports below are the `example.env` defaults; they come from `.env`):

```text
  Postgres  localhost:5432   Redis  localhost:6379
  Storage   http://localhost:9000   console  http://localhost:9001
  Receipt parser (optional): ./dev.sh up parser

Next: ./dev.sh backend and ./dev.sh frontend (one terminal each).
```

Commands that need a backing service check for it first and fail fast with a
one-line hint naming the command that starts it - with the database down,
`./dev.sh test` stops immediately and points you at `./dev.sh up` instead of
hanging on a connection timeout.

```bash
./dev.sh up parser       # start individual services
./dev.sh logs storage    # follow logs
./dev.sh migrate         # manage.py migrate
./dev.sh seed            # currencies + legal documents
./dev.sh manage <args>   # any other manage.py command
./dev.sh test -k budgets # pytest
./dev.sh lint            # ruff check --fix + ruff format + eslint
./dev.sh psql            # psql on the dev database
./dev.sh down            # stop (./dev.sh reset also drops the volumes)
```

These run in the `api` and `node` containers by default (`DEV_TARGET`), as the
user who invoked them, so anything they write — new migrations, caches — belongs
to you and not to root. With `DEV_TARGET=host` they run through `uv` in
`backend/` and `npm` in `frontend/`, and the script rewrites the service
hostnames to the published ports for you.

### The Python environment (`DEV_TARGET=host`)

`uv run` creates `backend/.venv` and syncs it to `uv.lock` by itself, so
`./dev.sh backend` works from a clean checkout. Doing it up front is still worth
it — your editor gets an interpreter to point at, and the install isn't running
while you wait for the server to come up:

```bash
cd backend
uv venv     # creates backend/.venv
uv sync     # installs the locked dependencies
```

There is nothing to activate. `uv` locates that environment by walking up for
`pyproject.toml`, so it works from anywhere under `backend/`, and an environment
you activated from another checkout is ignored (with a warning).

Containers use `/venv` instead, via `UV_PROJECT_ENVIRONMENT` in
`backend/Dockerfile` — which is why the container's packages never land in your
checkout. Keep that variable out of `.env`: `./dev.sh` sources it, and host
commands would then go looking for a `/venv` that doesn't exist on your machine.

### Without Docker

**Backend:**
```bash
cd backend
uv venv && source .venv/bin/activate
uv sync
cp example.env .env  # Configure database
python manage.py migrate
python manage.py seed_legal_documents  # Seed privacy policy and terms
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

See [Backend README](backend/README.md) and [Frontend README](frontend/README.md) for detailed setup and development instructions.

## Testing

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

## Contributing

This is a personal open-source project. Contributions, suggestions, and feedback are welcome!

**Planned improvements:**
- Deeper code reviews and refactoring
- Enhanced test coverage
- Improved documentation
- Additional features based on feedback

Feel free to open issues for bugs, feature requests, or questions.

## License

Copyright 2025

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

---

**Feel free to use this project for any purpose while maintaining a reference to the original source.**
