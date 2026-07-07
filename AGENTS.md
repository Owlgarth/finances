# AGENTS.md

Coding guidelines and commands for agentic coding agents working on the Denarly codebase.

## Project Overview

Denarly is a personal finance tracking application built with Django 6, Django Ninja, React 19, and PostgreSQL. It features multi-currency support, period-based budgeting, and collaborative team features.

## Build/Lint/Test Commands

### Backend (Django)

When running Python commands, always use the virtual environment: `backend/.venv/bin/python`

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
pytest budget_accounts/tests/test_api.py::TestClass::test_method  # Single test
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
```

Always run `npm run lint` after making changes.

## Data Hierarchy

All data operations follow this hierarchy:

```
Workspace → BudgetAccount → BudgetPeriod → [Category, Transaction, Budget, ...]
```

Every endpoint must verify resources belong to the user's workspace. Four security layers: JWT auth (`JWTAuth`/`WorkspaceJWTAuth`), workspace membership, role permissions (`require_role`), and workspace-scoped queries (`Model.objects.for_workspace(workspace_id)`).

## Detailed Conventions (Skills)

Detailed conventions are split into skills under `.agents/skills/`. Load the relevant skill(s) before working on the corresponding area:

| Skill | Load when working on |
|-------|----------------------|
| `django-backend` | Any backend code — endpoints, services, models, schemas, exceptions, queries |
| `backend-testing` | Backend tests — factories, AuthMixin, on_commit, token expiry, Celery testing |
| `celery-tasks` | Celery tasks — retry semantics, idempotency, dispatch patterns |
| `auth-security` | Auth, tokens, 2FA, rate limiting, anti-enumeration, security-sensitive endpoints |
| `email-sending` | Sending emails, email templates, EmailService |
| `frontend-react` | Any frontend code — design tokens, components, modals, API client, auth flows |
| `data-deletion-gdpr` | Adding/removing models, FK/on_delete changes, delete_account, export/import, legal docs |
| `docker-infra` | docker-compose, Dockerfiles, entrypoints, nginx, S3 storage |
