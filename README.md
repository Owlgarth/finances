# Monie

A modern, full-stack personal finance tracking application with multi-currency support, period-based budgeting, multi-account workspaces, and collaborative team features.

![Tech Stack](https://img.shields.io/badge/Django-092E20?style=flat&logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white)

## ⚠️ Important Notices

### AI-Assisted Development

**This codebase contains code generated with the help of AI tools.** The application was developed using AI-assisted coding tools to accelerate development and explore modern development workflows.

### Developer's Note

This project started as a personal pet project to replace Excel spreadsheets for my personal budgeting needs. I wanted to test the capabilities of AI development tools while solving a real problem I had. The result exceeded my expectations, so I've decided to continue developing Monie as an open-source application.

In the next development phase, I plan to conduct deeper code reviews and refactoring to ensure code quality, maintainability, and adherence to best practices.

---

## Overview

Monie is a comprehensive financial management tool designed for individuals and teams:

- **Multi-Account Architecture** - Workspaces, budget accounts, and time-based periods
- **Role-Based Access Control** - Owner, Admin, Member, and Viewer roles
- **Multi-Currency Support** - PLN, USD, EUR, UAH with exchange tracking
- **Budget Management** - Category budgets with actual vs planned tracking
- **Planned Transactions** - Schedule and execute future transactions
- **Offline Support** - Queue changes offline and sync when reconnected

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.13+ (for local development)

### Installation

```bash
# Clone and start
git clone <repository-url>
cd budget-tracker
docker-compose up -d
```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

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
| Auth | JWT with bcrypt                                          |

## Project Structure

```
budget-tracker/
├── backend/           # Django Ninja REST API
├── frontend/          # React SPA with offline support
├── docs/              # Architecture and specifications
└── docker-compose.yml
```

## Documentation

| Document | Description |
|----------|-------------|
| **[Backend README](backend/README.md)** | API endpoints, setup, testing, Django apps structure |
| **[Frontend README](frontend/README.md)** | Components, contexts, hooks, offline support, API client |
| [Architecture](docs/architecture.md) | System architecture and data hierarchy |
| [Workflow](docs/workflow.md) | Application workflows and user flows |
| [Permissions](docs/permissions.md) | Role-based permissions matrix |
| [Users & Roles](docs/users-and-roles.md) | User hierarchy and role descriptions |

## Development

### With Docker

```bash
docker-compose up -d
```

### Without Docker

**Backend:**
```bash
cd backend
uv venv && source .venv/bin/activate
uv sync
cp example.env .env  # Configure database
python manage.py migrate
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
