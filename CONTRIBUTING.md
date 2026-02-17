# Contributing to Monie

Thank you for your interest in contributing to Monie! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Python 3.13+
- Node.js 22+
- PostgreSQL 17+
- Redis (for rate limiting cache)
- [uv](https://github.com/astral-sh/uv) - Fast Python package manager

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/erikmoroz/monie.git
cd monie

# Copy environment file
cp backend/example.env .env

# Start all services
docker-compose up -d
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api
- API Docs: http://localhost:8000/api/docs

### Option 2: Local Development

**Backend:**

```bash
cd backend

# Create virtual environment and install dependencies
uv venv && source .venv/bin/activate
uv sync

# Configure environment
cp example.env .env
# Edit .env with your database credentials

# Run migrations
python manage.py migrate

# Start development server (uvicorn with auto-reload)
uvicorn config.asgi:application --reload
```

**Frontend:**

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

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
monie/
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
└── docker-compose.yml
```

## Questions?

Feel free to open an issue for any questions about contributing.
