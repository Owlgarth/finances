---
name: django-backend
description: Backend conventions for Owlgarth Finances (Django 6, Django Ninja, Pydantic v2, PostgreSQL) - core rules plus a routing table into reference files for endpoints, services and locking, models and migrations, queries, schemas, and errors and settings. Use when writing or modifying any code in backend/ other than tests (tests: backend-testing).
---

# Django Backend Conventions

This file holds the rules every backend task needs. Detailed patterns live in `references/` next to this file (`.agents/skills/django-backend/references/`): read the ones matching your change BEFORE writing code. The data model is described in `docs/architecture.md`.

## Read Before You Edit

| Your change touches | Read |
|---|---|
| an endpoint, router, auth class, route path, response codes, sortable or paginated lists, file downloads | `references/endpoints.md` |
| a service method, uniqueness or limit checks, ordered member sets, optional FKs, row locks, prefetch caches | `references/services.md` |
| a model, constraint, migration, FK change, or `backend/common/*.json` registry | `references/models-and-migrations.md` (deletion and export impact: `data-deletion-gdpr` skill) |
| aggregates, GROUP BY, newest-per-group enrichment | `references/queries.md` |
| request or response schemas, optional collections, partial updates | `references/schemas.md` |
| a domain exception, error message text, env-dependent settings | `references/errors-and-settings.md` |
| tests | `backend-testing` skill |
| auth, tokens, rate limits, anti-enumeration | `auth-security` skill |
| Celery tasks | `celery-tasks` skill |
| sending email | `email-sending` skill |

Rules cited elsewhere as "§Section Name" keep their original headings inside these files - grep `references/` for the heading.

## Core Rules

### Layers
- Endpoints are thin: parse the request, check auth and role, call the service, return `Status(code, payload)` (never the deprecated `return code, payload` tuple). Business logic, DB writes and side effects live in `<app>/services.py` as class-based services with `@staticmethod` methods; domain exceptions live in `<app>/exceptions.py`.
- Workspace-scoped endpoints use `auth=WorkspaceJWTAuth()` and read `request.auth.current_workspace_id`; endpoints that need no active workspace use `JWTAuth()`. Writes call `require_role(user, workspace_id, WRITE_ROLES)` (`common/permissions.py`, roles in `workspaces/models.py`). Personal resources (bookmarks) drop the role gate: the service's user filter is the authorization.
- Route paths byte-match the URL the frontend calls in `client.ts`; collection POSTs register at `''`. Ninja treats `''` and `'/'` as different paths, and a mismatch answers 405.
- Every possible status code is listed in the endpoint's `response=` map.

```python
@router.post('', response={201: TransactionOut}, auth=WorkspaceJWTAuth())
def create_transaction(request: HttpRequest, data: TransactionCreate):
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return Status(201, TransactionService.create(user, workspace_id, data))
```

### Workspace Scoping
- Every workspace-owned model inherits `WorkspaceScopedModel` (`common/models.py`): workspace FK, audit fields, `for_workspace()`, and a guard against changing `workspace_id` after creation. Creates always set `workspace_id`.
- Every query is scoped: `Model.objects.for_workspace(workspace_id)`. A resource from another workspace is indistinguishable from a missing one (404). `get_or_create` on a scoped queryset repeats `workspace_id=` as an explicit kwarg, because queryset filters never reach the create path.
- Services re-check authorization themselves (defense in depth); see §Service-Layer Authorization below.

### Data Integrity
- Any service method with more than one write runs under `@db_transaction.atomic`. `select_for_update()` only inside `atomic()`: it crashes in autocommit, and `TestCase` hides that because every test already runs in a transaction. Lock multiple rows in id order.
- Account balances and budget periods are derived on read, never stored, so no write path maintains a balance row.
- Invariants live in the DB (unique and check constraints, partial unique constraints for "at most one flagged row"); service checks exist to raise one clear domain error, never as the only guard.
- `save(update_fields=[...])` must include every field the model's `save()` override sets (`updated_at` and friends).
- Keep what `makemigrations` emits, and run `makemigrations --check` on a clean tree.

### Errors
- Domain exceptions subclass the `ServiceError` family in `common/exceptions.py` (`NotFoundError` 404, `ValidationError` 400, `AuthenticationError` 401, `PermissionDeniedError` 403); the global handler in `config/urls.py` turns them into responses. Name them `<Domain><ErrorType>Error` with class-level `default_message` and snake_case `default_code`.
- Messages are translated: `default_message` is wrapped in `gettext_lazy`, and dynamic messages %-format into a wrapped msgid, never an f-string. Details: `references/errors-and-settings.md`.

### Schemas
- Pydantic v2 `BaseModel` with `ConfigDict(from_attributes=True)` on output schemas. Optional collections default via `Field(default_factory=list, max_length=N)`, never a bare `[]`. Partial updates distinguish "client sent" from "defaulted" with `model_dump(exclude_unset=True)`.

### Verification
- `uv run ruff check --fix .` and `uv run ruff format .` after every change, then `pytest` (or `./dev.sh lint` and `./dev.sh test`).

## Imports

```python
# Standard library
from datetime import date
from decimal import Decimal

# Django/Django Ninja
from django.db import transaction as db_transaction
from django.http import HttpRequest
from ninja import Router, Status

# Common utilities
from common.auth import WorkspaceJWTAuth
from common.exceptions import NotFoundError, ValidationError
from common.permissions import require_role

# Local apps (alphabetically)
from transactions.schemas import TransactionCreate, TransactionOut
from transactions.services import TransactionService
from workspaces.models import WRITE_ROLES
```
## Naming Conventions

- **Files**: snake_case (`transactions/api.py`, `budgeting/models.py`)
- **Classes**: PascalCase (`TransactionOut`, `Account`, `Budget`)
- **Functions/Variables**: snake_case (`resolve_account`, `account_id`, `date_from`)
- **Constants**: UPPER_SNAKE_CASE (`WRITE_ROLES`, `TOKEN_KEY`)
- **Schemas**: Suffix with purpose (`TransactionCreate`, `TransactionOut`, `TransactionImport`)
## Input Normalization

Normalize user inputs (emails, strings, etc.) early - at the schema/validation level - so all downstream logic (uniqueness checks, token generation, email sending) uses the normalized value. The `ValidatedEmail` type lowercases emails before they reach any endpoint.

For inputs not covered by a schema validator (e.g., direct function arguments), normalize immediately after validation:

```python
@staticmethod
@db_transaction.atomic
def request_email_change(user, new_email: str, password: str):
    if not user.check_password(password):
        raise InvalidPasswordError()
    new_email = new_email.lower()
    if new_email == user.email:
        raise SameEmailError()
    # ... rest of logic uses normalized new_email
```
## Email Lookups

Emails are always stored as lowercase (`UserManager.normalize_email`, `User.save()`, and the `ValidatedEmail` schema handle this). Use exact match for email lookups.

Prefer `filter().first()` with a `None` check over `get()` with `try/except DoesNotExist` - it follows the return-early pattern and avoids exception-driven control flow:

```python
# Bad: exception-driven control flow
try:
    user = User.objects.get(email=data.email)
except User.DoesNotExist:
    raise UserNotFoundError()

# Good: explicit None check
user = User.objects.filter(email=data.email).first()
if not user:
    raise UserNotFoundError()
```

**Exception:** methods that need `select_for_update()` legitimately use `get()` inside `try/except DoesNotExist` because they need the lock and the query in one call.
## Return Early Pattern

Use guard clauses and early returns to reduce nesting:

```python
# Good: return early
def process_transaction(data):
    if not data:
        return None
    if data.amount <= 0:
        return None
    if not data.currency:
        return None
    return create_transaction(data)
```
## No Nested Helper Functions

Do not define helper functions inside a method body. Extract them as `@staticmethod` methods on the service class:

```python
# Good - class-level static methods
class WorkspaceService:
    @staticmethod
    def _send_existing_invite(user, workspace):
        ...

    def add_member(self, ...):
        WorkspaceService._send_existing_invite(user, workspace)
```

**Private method ordering:** Place private `@staticmethod` methods before the public methods that call them (private-methods-first).

**Shared helpers for side effects:** When multiple public methods need the same side-effect logic, extract it into a shared private `@staticmethod`. Keep caller-specific guard checks in the public method - the shared helper contains only the side-effect logic:

```python
class PlannedTransactionService:
    @staticmethod
    def _execute_side_effects(planned, workspace_id):
        """Shared logic - no guards, just side effects."""

    @staticmethod
    @db_transaction.atomic
    def execute(user, workspace_id, planned_id):
        planned = PlannedTransactionService._get_planned(...)
        if planned.status == 'done':
            raise PlannedTransactionAlreadyExecutedError()  # Guard stays in public method
        PlannedTransactionService._execute_side_effects(planned, workspace_id)
```
## Service-Layer Authorization (Defense-in-Depth)

Service methods that perform destructive operations should validate authorization themselves, not rely solely on API-layer checks. This prevents accidental misuse if the service is called from a management command or future endpoint:

```python
@staticmethod
@db_transaction.atomic
def delete_workspace(user, workspace_id: int) -> None:
    try:
        workspace = Workspace.objects.select_for_update().get(id=workspace_id)
    except Workspace.DoesNotExist:
        raise WorkspaceNotFoundError()

    membership = WorkspaceMember.objects.filter(user=user, workspace=workspace).select_for_update().first()
    if not membership or membership.role != Role.OWNER:
        raise WorkspacePermissionDeniedError()
```
## Check Object State, Not Just Existence

When a model has a boolean flag (`is_enabled`, `is_active`, `is_verified`, …), always check both existence AND the flag:

```python
# Good - checks existence AND enabled state
twofa = UserTwoFactor.objects.filter(user_id=user_id).first()
if not twofa or not twofa.is_enabled:
    raise TwoFactorNotEnabledError()
```
## Validate Stateful Dependencies Before Operations

When an endpoint or service depends on a resource being in a specific state, validate that state **before** the main operation - a specific error beats a misleading generic one (e.g., check 2FA is enabled before reporting "Invalid verification code").

Also validate and raise **before** creating records - e.g., reject a transaction on a custom-cadence budget when no period covers the date, rather than saving something the UI can't place:

```python
account = TransactionService._resolve_account(workspace_id, data.account_id)
if account.is_archived:
    raise TransactionAccountArchivedError()
Transaction.objects.create(account=account, workspace_id=workspace_id, ...)
```

This applies to both `create` and `update` paths - if a guard exists on create, apply the same guard on update.
## Safe Defaults for `getattr` Fallbacks

When using `getattr` as a safety net for fields added by recent migrations (rolling deploys), always default to the more restrictive/secure value:

```python
# Bad: default True silently grants privileges during rolling deploy
email_verified = getattr(user, 'email_verified', True)

# Good: default False fails safe
email_verified = getattr(user, 'email_verified', False)
```
## Model Field Defaults Must Match Service Defaults

When a service overrides a model field default (e.g., creates with `WeekdayChoices.MONDAY`), the model field `default` must match. Otherwise direct creation paths (Django admin, factories, management commands) produce inconsistent data. Only the field `default` changes - no data migration needed.
## `update_fields` Must Include Fields Set by Model Overrides

`save(update_fields=[...])` persists **only** the listed fields - any field a model-level override sets in memory is silently dropped, with no error and no failing test. When a model method mutates state beyond the field it is named for (e.g. `User.set_password` also stamps `password_changed_at`), every `save(update_fields=...)` call site on that model must list the extra fields:

```python
user.set_password(new_password)
user.save(update_fields=['password', 'password_changed_at'])  # stamp comes from the override
```

When adding a field to such an override, grep `update_fields=` across the app in the same task - a missed list quietly drops the write (for the `password_changed_at` instance, a dropped stamp lets a stolen refresh token survive a password change; see the `auth-security` skill).
## Read Settings at Call Time

Read `django.conf.settings` values inside the function body, not at module import. Import-time reads freeze the value for the process lifetime and make `override_settings` useless in tests - call-time reads are why `override_settings(TRUSTED_PROXY_COUNT=...)` and `override_settings(TWO_FACTOR_ENCRYPTION_KEY=...)` work. The deliberate exception is decorator configuration (e.g. `rate_limit(...)` captures `settings.RATE_LIMIT_*` at decoration time); the test consequence - those limits are only testable at their defaults - is in the `backend-testing` skill.
## Case-Insensitive Grouping with Display Casing

When grouping text values that vary in casing (e.g., "Amazon"/"amazon"), group by lowercase but display the most common original casing: build a `lowercase → most common variant` map (via `Counter(...).most_common(1)`), aggregate with `.annotate(lower_desc=Lower('description'))`, then map results back through the display map.
## Code Cleanup When Refactoring

When removing code that uses specific imports, also remove the now-unused imports - especially `logging`/`logger` when removing the only logging call, `send_mail`/`EmailMessage` when migrating to `EmailService`, and `db_transaction` when removing the only atomic block.
## Workspace Management

```python
from workspaces.services import WorkspaceService

# Create a new workspace (auto-switches user to it)
workspace = WorkspaceService.create_workspace(user=user, name='New Workspace', create_demo=True)

# Delete a workspace (switches all affected users to another workspace)
WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)
```
