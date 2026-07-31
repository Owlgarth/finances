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

In the next development phase, I plan to conduct deeper code reviews and refactoring to ensure code quality, maintainability, and adherence to best practices.

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

```bash
# Clone and start
git clone <repository-url>
cd denarly
cp example.env .env        # every setting, including the published ports, lives here
./dev.sh up --full         # the whole stack in Docker
```

For day-to-day work, run the services in Docker and the app on your machine —
three terminals, hot reload on both sides:

```bash
./dev.sh up            # db, redis, storage
./dev.sh backend       # migrate + seed, then uvicorn --reload and a Celery worker
./dev.sh frontend      # Vite dev server
```

Services: `db`, `redis`, `storage`, plus `api`, `ui`, `worker` and `beat` for the
full-Docker run, and the optional `parser` (`./dev.sh up parser`).

**Docker or your machine?** By default `./dev.sh` runs the backend and frontend
inside their containers, so Python, uv and Node only have to exist in the images —
handy for a remote interpreter in PyCharm, or any machine without the right
versions installed. Set `DEV_TARGET=host` in `.env` to use your own uv and npm
instead (faster), or switch per command: `DEV_TARGET=host ./dev.sh test`.

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs
- Storage console: http://localhost:9001

Ports already taken on your machine? Change `*_PORT` in `.env` — nothing is hardcoded.

**Demo credentials:** `demo@example.com` / `password123`

### Demo Mode

Disable registration for public demos by setting environment variables:

```bash
# Backend
DEMO_MODE=true

# Frontend
VITE_DEMO_MODE=true
```

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

See the [parser README](services/receipt-parser/README.md) and its
[quality harness](services/receipt-parser/harness/README.md).

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

## Migrating from a pre-redesign version (cutover guide)

The current model is account-based. If you have a JSON export from an older
(period/exchange-based) version of Denarly, import it through the **legacy** path,
which converts it to the new model and reports a per-account balance check:

1. Register (or log in) and open **Settings → Account**.
2. Under **"Import from an older Denarly version"**, choose your old export JSON.
   The importer converts the old shape to the new one:
   - per-workspace currencies → enabled catalog currencies;
   - one `Main <CODE>` account is created per currency, seeded with a solved
     opening balance so computed balances match the old closing balances;
   - currency exchanges → transfers, with the two legacy sides deduplicated so
     amounts are not double-counted;
   - categories, budgets, transactions, and planned transactions are recreated.
3. Review the **verification report**: each account shows its computed balance and,
   where the old export recorded a closing balance, whether they match. Reconcile any
   ⚠️ warnings with **Accounts → "Set balance…"** (which records an adjustment).

The regular **"Import Data"** button is for current-format (v3) exports only
(same-system restore); the legacy path is specifically for the older format.

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
| **[Backend README](backend/README.md)** | API endpoints, setup, testing, Django apps structure |
| **[Frontend README](frontend/README.md)** | Components, contexts, hooks, API client |
| [Architecture](docs/architecture.md) | System architecture and account-based data model |
| [Receipt Parser](services/receipt-parser/README.md) | Optional extraction service + contract |
| [Workflow](docs/workflow.md) | Application workflows and user flows |
| [Permissions](docs/permissions.md) | Role-based permissions matrix |
| [Users & Roles](docs/users-and-roles.md) | User hierarchy and role descriptions |

## Development

### Everyday commands

`./dev.sh` is the only script: `docker compose` for the services, `uv`/`npm` on
the host for the app. Run it with no arguments for the full list.

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
