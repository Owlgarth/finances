# Contributing to Owlgarth Finances

Thank you for your interest in contributing to Owlgarth Finances! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Docker and Docker Compose - enough on their own for Option 1 and 2 below
- For running the app outside the containers (`DEV_TARGET=host`): Python 3.13+,
  Node.js 22+, and [uv](https://github.com/astral-sh/uv)

```bash
# Clone the repository
git clone https://github.com/Owlgarth/finances.git
cd finances

# Copy environment file (all settings, including the published ports)
cp example.env .env
```

> **History note:** this repository's git history was rewritten on 2026-08-23.
> If your clone predates that date, re-clone it - pulling the rewritten history
> into an old clone will conflict.

### Option 1: Services in Docker, app on your machine (recommended)

One terminal each - both sides reload on save:

```bash
./dev.sh up            # db, redis, storage
./dev.sh backend       # migrate + seed, then uvicorn --reload and a Celery worker
./dev.sh frontend      # Vite dev server
```

`backend` and `frontend` - and `migrate`, `test`, `lint`, `npm` - run inside the
`api` and `node` containers, so only Docker has to be installed. Set
`DEV_TARGET=host` in `.env` to run them with your own uv and npm instead.

### Option 2: Everything in Docker

```bash
./dev.sh up --full     # + api, ui, worker, beat
```

Access (ports come from `.env` - change them there if they clash):
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api
- API Docs: http://localhost:8000/api/docs

`./dev.sh` covers the rest: `migrate`, `seed`, `manage <args>`, `test`, `lint`,
`psql`, `logs`, `up`/`down`. Run it with no arguments for the list.

### Pre-commit Hooks

We use pre-commit hooks to ensure code quality. Install them with:

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install
```

The hooks will automatically run ruff (lint and format) on staged Python files before each commit.

## Code Style

### Backend (Python)

We use [Ruff](https://github.com/astral-sh/ruff) for linting and formatting. Configuration is in `backend/pyproject.toml`.

Key settings:
- Line length: 120 characters
- Quote style: Single quotes
- Import sorting: isort-compatible

Run manually:

```bash
cd backend
uv run ruff check .          # Lint
uv run ruff check --fix .    # Lint with auto-fix
uv run ruff format .         # Format
```

### Frontend (TypeScript/React)

We use ESLint for linting. Configuration is in `frontend/eslint.config.js`.

Run manually:

```bash
cd frontend
npm run lint
```

## Running Tests

### Backend

```bash
cd backend
pytest                    # Run all tests
pytest -v                 # Verbose output
pytest path/to/test.py   # Run specific file
pytest -k "test_name"    # Run tests matching pattern
```

### Frontend

Frontend testing with Vitest is planned for a future release.

## Pull Request Process

1. **Create a branch** from `main` with a descriptive name:
   - `feature/add-export-csv` for new features
   - `fix/login-validation` for bug fixes
   - `refactor/simplify-auth` for refactoring

2. **Make your changes** following the code style guidelines

3. **Write/update tests** for your changes

4. **Run linting and tests** before committing:
   ```bash
   # Backend
   cd backend && uv run ruff check . && uv run ruff format --check .

   # Frontend
   cd frontend && npm run lint && npm run build
   ```

5. **Commit with clear messages** describing what and why

6. **Open a Pull Request** using the [PR template](.github/pull_request_template.md):
   - Fill out all relevant sections
   - Link related issues
   - Request review from maintainers

7. **Address review feedback** and update your PR as needed

## Issue Reporting

### Bug Reports

When reporting bugs, please include:

- **Description**: Clear description of the bug
- **Steps to reproduce**: Detailed steps to reproduce the issue
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Environment**: Browser, OS, Python/Node versions
- **Screenshots**: If applicable

### Feature Requests

When requesting features, please include:

- **Problem**: What problem does this solve?
- **Proposed solution**: How should it work?
- **Alternatives considered**: Other approaches you've thought about
- **Additional context**: Mockups, examples, or references

## Project Structure

```
finances/
├── backend/           # Django API
│   ├── config/        # Django settings
│   ├── common/        # Shared utilities (auth, permissions)
│   ├── core/          # Auth endpoints, schemas
│   └── [app]/         # Feature apps (transactions, budgets, etc.)
├── frontend/          # React SPA
│   ├── src/
│   │   ├── api/       # API client
│   │   ├── components/
│   │   ├── contexts/  # React contexts
│   │   ├── hooks/
│   │   └── pages/
├── docs/              # Documentation
├── dev.sh             # The dev entry point: start, compose, manage.py, tests, lint
└── docker-compose.yml
```

## Questions?

Feel free to open an issue for any questions about contributing.
