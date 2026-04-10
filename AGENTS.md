# AGENTS.md

Coding guidelines and commands for agentic coding agents working on the Monie codebase.

## Project Overview

Monie is a personal finance tracking application built with Django 6, Django Ninja, React 19, and PostgreSQL. It features multi-currency support, period-based budgeting, and collaborative team features.

## Build/Lint/Test Commands

### Backend (Django)

When running Python commands, always use the virtual environment:

```bash
backend/.venv/bin/python
```

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
pytest -v                                 # Verbose output
pytest budget_accounts/tests/             # Run specific app tests
pytest budget_accounts/tests/test_api.py::TestClass::test_method  # Single test
pytest -k "test_create"                   # Run tests matching pattern
pytest --cov=. --cov-report=html          # With coverage
pytest --create-db -v                      # Fresh test DB (use when cross-branch migrations cause stale DB issues)

# Linting & Formatting
uv run ruff check .                       # Check linting issues
uv run ruff check --fix .                 # Auto-fix lint issues
uv run ruff format .                      # Format code
```

Always run `uv run ruff check` and `uv run ruff format` after making changes.

### Frontend (React + Vite)

```bash
cd frontend

# Setup
npm install

# Development
npm run dev                               # Runs at http://localhost:5173

# Build
npm run build                             # TypeScript check + Vite build

# Linting
npm run lint                              # ESLint check
```

Always run `npm run lint` after making changes.

## Data Hierarchy

All data operations follow this hierarchy:

```
Workspace → BudgetAccount → BudgetPeriod → [Category, Transaction, Budget, ...]
```

Every endpoint must verify resources belong to the user's workspace.

## Model Relationships Reference

| Parent | Child | FK Field | on_delete | related_name |
|--------|-------|----------|-----------|-------------|
| Workspace | BudgetAccount | `workspace` | CASCADE | (default) |
| Workspace | Currency | `workspace` | CASCADE | `currencies` |
| BudgetAccount | BudgetPeriod | `budget_account` | CASCADE | `budget_periods` |
| BudgetPeriod | Transaction | `budget_period` | SET_NULL | `transactions` |
| BudgetPeriod | PlannedTransaction | `budget_period` | SET_NULL | `planned_transactions` |
| BudgetPeriod | CurrencyExchange | `budget_period` | SET_NULL | `currency_exchanges` |

### SET_NULL Children Must Be Explicitly Deleted

`Transaction`, `PlannedTransaction`, and `CurrencyExchange` have `on_delete=SET_NULL` on their `budget_period` FK. Django does **not** cascade-delete them — it sets `budget_period=NULL`, leaving orphaned rows. These orphans hold FK references to `Currency` (with `on_delete=PROTECT`), which blocks downstream deletions with unhandled 500 errors.

Any `delete()` method on a parent model that has `SET_NULL` children must explicitly delete those children first:

```python
@staticmethod
@db_transaction.atomic
def delete(workspace_id: int, account_id: int) -> None:
    from currency_exchanges.models import CurrencyExchange
    from planned_transactions.models import PlannedTransaction
    from transactions.models import Transaction

    account = BudgetAccountService.get(account_id, workspace_id)
    period_ids = list(account.budget_periods.values_list('id', flat=True))
    Transaction.objects.filter(budget_period_id__in=period_ids).delete()
    PlannedTransaction.objects.filter(budget_period_id__in=period_ids).delete()
    CurrencyExchange.objects.filter(budget_period_id__in=period_ids).delete()
    account.delete()
```

> **When adding a new model with `on_delete=SET_NULL`**: Update every parent deletion service that could leave orphans. Also update `UserService.delete_account()` and `export_all_data()` per GDPR rules.

### Defense-in-Depth Deletion in `delete_account`

Even models with `on_delete=CASCADE` should be explicitly deleted in `UserService.delete_account()` before `user.delete()`. This ensures robustness if the deletion flow is ever refactored to not delete the User row directly, and makes the data cleanup order clear and auditable.

```python
# Explicit deletions before user.delete()
UserTwoFactor.objects.filter(user=user).delete()  # CASCADE handles this, but explicit for defense-in-depth
user.delete()
```

> **When adding a new model owned by User**: Explicitly delete it in `delete_account()` regardless of `on_delete` behavior.

## Backend Code Style (Python)

### Imports

```python
# Standard library
from datetime import date
from decimal import Decimal

# Django/Django Ninja
from django.db import transaction as db_transaction
from django.http import HttpRequest
from ninja import Router

# Common utilities
from common.auth import WorkspaceJWTAuth
from common.exceptions import NotFoundError, ValidationError
from common.permissions import require_role

# Local apps (alphabetically)
from transactions.schemas import TransactionCreate, TransactionOut
from transactions.services import TransactionService
from workspaces.models import WRITE_ROLES
```

### Naming Conventions

- **Files**: snake_case (`transactions/api.py`, `period_balances/models.py`)
- **Classes**: PascalCase (`TransactionOut`, `BudgetPeriod`)
- **Functions/Variables**: snake_case (`get_workspace_period`, `budget_period_id`)
- **Constants**: UPPER_SNAKE_CASE (`WRITE_ROLES`, `TOKEN_KEY`)
- **Schemas**: Suffix with purpose (`TransactionCreate`, `TransactionOut`, `TransactionImport`)

### Input Normalization

Normalize user inputs (emails, strings, etc.) early in the flow — at the schema/validation level — so all downstream logic (uniqueness checks, token generation, email sending) uses the normalized value. The `ValidatedEmail` type lowercases emails before they reach any endpoint:

```python
def _validate_email(v: str) -> str:
    v = v.lower().strip()
    validator = EmailValidator()
    try:
        validator(v)
    except DjangoValidationError:
        raise ValueError('Enter a valid email address')
    return v
```

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

### Email Lookups

Emails are always stored as lowercase. The `UserManager.normalize_email` and `User.save()` handle this automatically, and the `ValidatedEmail` schema normalizes input. Use exact match for email lookups:

```python
user = User.objects.filter(email=data.email).first()
if not user:
    raise UserNotFoundError()
```

Prefer `filter().first()` with a `None` check over `get()` with `try/except DoesNotExist`. It follows the return-early pattern and avoids exception-driven control flow:

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

### Return Early Pattern

Use guard clauses and early returns to reduce nesting and improve readability:

```python
# Bad: deeply nested
def process_transaction(data):
    if data:
        if data.amount > 0:
            if data.currency:
                return create_transaction(data)
    return None

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

### Django Ninja Endpoints

Endpoints are thin wrappers — parse the request, call the service, return the response. Business logic belongs in service classes. Request-scoped validation that returns HTTP error responses (e.g. token uid/token checking in password reset) may stay in the API layer — only business logic moves to the service.

**API layer responsibilities:** parsing request data, token/uid validation that returns HTTP error responses, authentication/authorization checks, calling the service, returning the response tuple.

**Service layer responsibilities:** business logic (validation, DB operations, side effects, balance updates, email notifications). If logic involves saving to the database or sending emails, it belongs in the service.

For workspace-scoped endpoints, use `WorkspaceJWTAuth` which automatically validates that the user has an active workspace:

```python
from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from transactions.services import TransactionService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Transactions'])

@router.get('', response=list[TransactionOut], auth=WorkspaceJWTAuth())
def list_transactions(request: HttpRequest, budget_period_id: int | None = Query(None)):
    """Docstring describing the endpoint."""
    workspace_id = request.auth.current_workspace_id
    return TransactionService.list(workspace_id, budget_period_id)

@router.post('', response={201: TransactionOut}, auth=WorkspaceJWTAuth())
def create_transaction(request: HttpRequest, data: TransactionCreate):
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return 201, TransactionService.create(user, workspace_id, data)
```

For endpoints that don't require an active workspace (e.g., listing all workspaces), use `JWTAuth`:

```python
from common.auth import JWTAuth

@router.get('', response=list[WorkspaceOut], auth=JWTAuth())
def list_workspaces(request: HttpRequest):
    return WorkspaceService.list(request.auth)
```

### Service Layer

Business logic lives in `<app>/services.py` as class-based services (e.g., `TransactionService`). Services handle validation, DB operations, and balance updates. Domain-specific exceptions are defined in `<app>/exceptions.py`.

Shared helpers:
- `common/permissions.py` — `require_role(user, workspace_id, allowed_roles)` — raises 403, returns the role
- `common/services/base.py` — `resolve_currency`, `get_or_create_period_balance`, `update_period_balance`

```python
# transactions/services.py
from django.db import transaction as db_transaction

from common.exceptions import CurrencyNotFoundInWorkspaceError
from common.services.base import get_or_create_period_balance, resolve_currency
from transactions.exceptions import TransactionNoActivePeriodError, TransactionNotFoundError
from transactions.models import Transaction

class TransactionService:
    @staticmethod
    def get_transaction(transaction_id: int, workspace_id: int) -> Transaction:
        trans = Transaction.objects.for_workspace(workspace_id).filter(id=transaction_id).first()
        if not trans:
            raise TransactionNotFoundError()
        return trans

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: TransactionCreate) -> Transaction:
        currency = resolve_currency(workspace_id, data.currency)
        if not currency:
            raise CurrencyNotFoundInWorkspaceError(data.currency)
        trans = Transaction.objects.create(..., created_by=user, updated_by=user)
        TransactionService.update_period_balance(...)
        return trans
```

### No Nested Helper Functions

Do not define helper functions inside a method body. Extract them as `@staticmethod` methods on the service class. This improves readability, testability, and follows the flat-structure convention used across the codebase.

```python
# Bad — nested functions inside a method
class WorkspaceService:
    def add_member(self, ...):
        def _send_existing(user, workspace):
            ...
        def _send_new(email, workspace):
            ...
        _send_existing(user, workspace)

# Good — class-level static methods
class WorkspaceService:
    @staticmethod
    def _send_existing_invite(user, workspace):
        ...

    @staticmethod
    def _send_new_invite(email, workspace):
        ...

    def add_member(self, ...):
        WorkspaceService._send_existing_invite(user, workspace)
```

### Service-Layer Authorization (Defense-in-Depth)

Service methods that perform destructive operations should validate authorization themselves, not rely solely on API-layer checks. This prevents accidental misuse if the service is called from a management command or future endpoint.

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
    # ... rest of logic
```

### Concurrent Safety with `select_for_update`

For operations that must be atomic under concurrent requests (e.g., consuming a one-time recovery code), use `select_for_update()` to acquire a row-level lock and combine related field updates into a single `save()`:

```python
@staticmethod
@db_transaction.atomic
def verify_code(user: User, code: str) -> bool:
    try:
        twofa = UserTwoFactor.objects.select_for_update().get(user=user, is_enabled=True)
    except UserTwoFactor.DoesNotExist:
        return False

    if _try_recovery_code(twofa, code):
        twofa.last_used_at = timezone.now()
        twofa.save(update_fields=['backup_codes', 'last_used_at', 'updated_at'])
        return True
    return False
```

Without `select_for_update()`, two concurrent requests could both read the same recovery code before either writes, allowing double-use.

**`select_for_update()` must execute inside `atomic()`:** All reads, validation, and writes using `select_for_update()` must be inside a single `atomic()` block — either via `@db_transaction.atomic` decorator or `with db_transaction.atomic():` at the top of the method. Without `ATOMIC_REQUESTS=True`, PostgreSQL raises `TransactionManagementError` in autocommit mode. Django's `TestCase` wraps each test in its own transaction, masking this bug — it only surfaces in production.

```python
# Bad — select_for_update outside atomic (crashes in production, passes in tests):
workspace = Workspace.objects.select_for_update().get(id=workspace_id)
# ... validation ...
with db_transaction.atomic():
    # ... deletion ...

# Good — everything inside atomic:
with db_transaction.atomic():
    workspace = Workspace.objects.select_for_update().get(id=workspace_id)
    # ... validation ...
    # ... deletion ...
```

**`select_for_update()` exception to `filter().first()` convention:** Methods that need `select_for_update()` for row-level locking legitimately use `get()` inside `try/except DoesNotExist` because they need both the lock and the query in one call. This is acceptable even though the project convention is `filter().first()` + `None` check.

### Rate Limiting

Two decorators are available in `common/throttle.py`:

- **`rate_limit(key_prefix, limit, period)`** — Keys by client IP only. Use for most endpoints.
- **`rate_limit_by_key(key_prefix, key_extractor, limit, period)`** — Keys by client IP + custom key (e.g., `user_id` from a temp token). Use when an attacker could rotate IPs to bypass IP-only limits.

Both decorators use atomic cache operations (`cache.add()` + `cache.incr()`) via `_atomic_increment()` to eliminate TOCTOU race conditions. Do not use `cache.get()` → `cache.set()` patterns in rate limiting.

Key extractors for tokens must return a unique value (e.g., `str(uuid.uuid4())`) for invalid tokens, not a fixed string like `'invalid'`. A fixed string lets attackers on a shared IP exhaust the bucket and block legitimate users.

All rate limit `limit` and `period` values **must** be configured via Django settings backed by env vars, not hardcoded. Each setting needs an inline comment explaining its purpose:

```python
# Max 2FA verification attempts per IP+user within the period window
RATE_LIMIT_VERIFY_2FA = int(os.getenv('RATE_LIMIT_VERIFY_2FA', '10'))
# Time window (seconds) for 2FA verification rate limiting
RATE_LIMIT_VERIFY_2FA_PERIOD = int(os.getenv('RATE_LIMIT_VERIFY_2FA_PERIOD', '60'))
```

Reference in endpoints via `settings.RATE_LIMIT_*`:

```python
from django.conf import settings
from common.throttle import rate_limit, rate_limit_by_key

@router.post('/verify-2fa', response={200: Token, 401: DetailOut, 404: DetailOut, 429: DetailOut})
@rate_limit_by_key('verify_2fa', _extract_2fa_rate_key, limit=settings.RATE_LIMIT_VERIFY_2FA, period=settings.RATE_LIMIT_VERIFY_2FA_PERIOD)
def verify_2fa(request, data: Verify2FAIn):
    ...
```

### Token Consumption Patterns

Two functions exist in `common/auth.py` for temp tokens:

- **`decode_temp_token(token)`** — Peeks at the token payload without side effects. Use when you need to read claims without consuming the token (e.g., extracting a `user_id` for rate limiting).
- **`consume_temp_token(token)`** — Consumes the token (marks its JTI as used in cache). Returns `None` on replay. Use when the token should be single-use (e.g., `verify_2fa`).

Never use `decode_temp_token` where `consume_temp_token` is appropriate — a consumed token must not be replayable.

For refresh tokens:

- **`create_refresh_token(user)`** — Issues a JWT with `type: 'refresh'`, a unique `jti`, and expiry configured via `JWT_REFRESH_TOKEN_EXPIRE_DAYS` setting (default 7 days). Does not include `email` or `current_workspace_id` (unlike access tokens).
- **`consume_refresh_token(token)`** — Decodes the JWT, validates `type == 'refresh'`, then atomically marks the `jti` as consumed using `cache.add()`. Returns `None` on replay, expiry, or invalid signature. Follows the same pattern as `consume_temp_token`.

Both `consume_temp_token` and `consume_refresh_token` use the same pattern: validate token type, derive cache TTL from `exp` via `_ttl_from_exp()`, atomically mark JTI with `cache.add()`. This ensures cache TTL always matches the remaining token lifetime. If `ttl == 0` (token already expired), `None` is returned without caching.

`JWTAuth.authenticate` rejects tokens with `type: 'refresh'` alongside `'2fa_pending'` — this prevents refresh tokens from being used as access tokens:

```python
token_type = payload.get('type')
if token_type in ('2fa_pending', 'refresh'):
    return None
```

### Check Object State, Not Just Existence

When a model has a boolean flag (e.g., `is_enabled`, `is_active`), always check both the object's existence AND the flag. Records can exist in intermediate/disabled states, and a simple truthiness check on the object silently misses `flag=False`.

```python
# Bad — only checks existence, misses is_enabled=False
twofa = UserTwoFactor.objects.filter(user_id=user_id).first()
if not twofa:
    raise TwoFactorNotEnabledError()

# Good — checks existence AND enabled state
twofa = UserTwoFactor.objects.filter(user_id=user_id).first()
if not twofa or not twofa.is_enabled:
    raise TwoFactorNotEnabledError()
```

This applies to any model with status flags: `is_enabled`, `is_active`, `is_verified`, etc.

### Validate Stateful Dependencies Before Operations

When an endpoint or service method depends on a resource being in a specific state, validate that state **before** attempting the main operation. This provides a meaningful, specific error instead of a misleading generic one.

```python
# Bad — user gets "Invalid verification code" when the real issue is 2FA was disabled
@router.post('/verify-2fa')
def verify_2fa(request, data):
    user = get_user(data.temp_token)
    if not TwoFactorService.verify_code(user, data.code):
        return 401, {'detail': 'Invalid verification code'}

# Good — check 2FA state first, then verify the code
@router.post('/verify-2fa', response={200: Token, 401: DetailOut, 404: DetailOut})
def verify_2fa(request, data):
    user = get_user(data.temp_token)
    tf = UserTwoFactor.objects.filter(user=user).first()
    if not tf or not tf.is_enabled:
        raise TwoFactorNotEnabledError()
    if not TwoFactorService.verify_code(user, data.code):
        return 401, {'detail': 'Invalid verification code'}
```

This also applies to service methods that depend on a resource existing — validate and raise **before** creating records. For example, reject creation when no budget period covers the given date, rather than saving an invisible orphan record:

```python
# Bad — saves record with budget_period=None, invisible to the API
period_id = CurrencyExchangeService._find_period_for_date(workspace_id, data.date)
CurrencyExchange.objects.create(budget_period_id=period_id, ...)

# Good — reject creation when no period exists
period_id = CurrencyExchangeService._find_period_for_date(workspace_id, data.date)
if not period_id:
    raise CurrencyExchangeNoPeriodError()
CurrencyExchange.objects.create(budget_period_id=period_id, ...)
```

This applies to both `create` and `update` paths. If a service validates a dependency before creating a record, the same guard must be applied when updating that record — otherwise the update path can silently produce orphan records:

```python
# create path — guard exists
period_id = CurrencyExchangeService._find_period_for_date(workspace_id, data.date)
if not period_id:
    raise CurrencyExchangeNoPeriodError()
CurrencyExchange.objects.create(budget_period_id=period_id, ...)

# update path — same guard must be applied
new_period_id = CurrencyExchangeService._find_period_for_date(workspace_id, data.date)
if not new_period_id:
    raise CurrencyExchangeNoPeriodError()
```

### Document All Possible Response Status Codes

Every endpoint's `response` parameter must list **all** status codes the endpoint can return, including those from raised exceptions. This serves as documentation and ensures Django Ninja generates accurate API schemas.

```python
# Bad — 404 is possible but not documented
@router.post('/verify-2fa', response={200: Token, 401: DetailOut})
def verify_2fa(request, data):
    raise TwoFactorNotEnabledError()  # returns 404, but it's not in the response schema

# Good — all status codes are documented
@router.post('/verify-2fa', response={200: Token, 401: DetailOut, 404: DetailOut})
def verify_2fa(request, data):
    ...
```

### Workspace-Scoped Models

All models that belong to a workspace must inherit from `WorkspaceScopedModel`. This provides:
- Direct `workspace` FK for efficient filtering
- Audit fields: `created_by`, `updated_by`, `created_at`, `updated_at`
- `for_workspace()` queryset method via `WorkspaceScopedQuerySet`
- Validation preventing `workspace_id` changes after creation

```python
# categories/models.py
from common.models import WorkspaceScopedModel

class Category(WorkspaceScopedModel):
    """Category model scoped to a workspace."""

    budget_period = models.ForeignKey(
        'budget_periods.BudgetPeriod', on_delete=models.CASCADE, related_name='categories'
    )
    name = models.CharField(max_length=100)

    class Meta:
        db_table = 'categories'
        unique_together = [['name', 'budget_period']]

# Service usage - always set workspace_id on creation:
Category.objects.create(
    budget_period_id=period_id,
    workspace_id=workspace_id,
    name='Food',
    created_by=user,
)
```

For models with custom querysets (e.g., with additional filter methods):

```python
# budget_periods/models.py
from common.models import WorkspaceScopedModel
from common.querysets import WorkspaceScopedQuerySet

class BudgetPeriodQuerySet(WorkspaceScopedQuerySet):
    def containing(self, target_date: date):
        return self.filter(start_date__lte=target_date, end_date__gte=target_date)

class BudgetPeriod(WorkspaceScopedModel):
    objects = BudgetPeriodQuerySet.as_manager()
    # ... fields
```

### Pydantic Schemas

```python
from pydantic import BaseModel, ConfigDict, Field

class TransactionCreate(BaseModel):
    """Schema for creating a transaction."""
    date: date
    description: str = Field(..., max_length=500)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., pattern=r'^[A-Z]{3}$')

class TransactionOut(BaseModel):
    """Schema for transaction response."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    amount: Decimal
```

### Shared Validated Types

When identical Pydantic field validators are repeated across schemas, extract them into a shared `Annotated` type using `BeforeValidator`:

```python
from typing import Annotated
from pydantic import BeforeValidator

def _validate_email(value: str) -> str:
    return value.lower().strip()

ValidatedEmail = Annotated[str, BeforeValidator(_validate_email)]

class RegisterIn(BaseModel):
    email: ValidatedEmail

class ForgotPasswordIn(BaseModel):
    email: ValidatedEmail
```

Define the validation function as a module-level private function (`_validate_email`) and the annotated type as a module constant. Only extract validators that are truly identical across all schemas — keep separate validators on schemas that have additional concerns or may diverge.

For email validators, include `.lower().strip()` in the validator so that all downstream code receives pre-normalized values:

```python
def _validate_email(v: str) -> str:
    v = v.lower().strip()
    validator = EmailValidator()
    try:
        validator(v)
    except DjangoValidationError:
        raise ValueError('Enter a valid email address')
    return v
```

### Safe Defaults for `getattr` Fallbacks

When using `getattr` as a safety net for fields added by recent migrations (e.g., during rolling deploys where code ships before migrations), always default to the more restrictive/secure value:

```python
# Bad: default True silently grants privileges during rolling deploy
email_verified = getattr(user, 'email_verified', True)

# Good: default False fails safe
email_verified = getattr(user, 'email_verified', False)
```

This applies to verification flags, permission flags, and any security-relevant booleans. The `getattr` fallback is only needed temporarily during migrations — after the migration runs, the actual model field value is used.

### Model Field Defaults Must Match Service Defaults

When a service overrides a model field default (e.g., `UserService.get_or_create_preferences` creates with `WeekdayChoices.MONDAY`), the model field `default` must match the service value. Otherwise direct creation paths (Django admin, factories, management commands) produce inconsistent data:

```python
# Bad: model defaults to SUNDAY but service creates with MONDAY
class UserPreferences(models.Model):
    calendar_start_day = models.IntegerField(default=WeekdayChoices.SUNDAY)

# Good: model default matches service default
class UserPreferences(models.Model):
    calendar_start_day = models.IntegerField(default=WeekdayChoices.MONDAY)
```

Only the Django field `default` changes — no data migration needed since existing rows already have values set by the service.

### Error Handling

- **Domain Exceptions**: Services raise domain exceptions inheriting from `ServiceError` (in `common/exceptions.py`)
- **Global Handler**: A Django Ninja exception handler in `config/urls.py` converts `ServiceError` to HTTP responses automatically
- **Exception Types**: `NotFoundError` (404), `ValidationError` (400), `AuthenticationError` (401), `PermissionDeniedError` (403)
- **App Exceptions**: Each app defines specific exceptions in `<app>/exceptions.py` (e.g., `TransactionNotFoundError`)
- **Transactions**: Use `@db_transaction.atomic` for database operations that update balances
- **Exception Naming**: `<Domain><ErrorType>Error` — e.g., `TwoFactorNotEnabledError`, `TransactionNotFoundError`. Always set `default_message` and `default_code` as class attributes
- **Exception Codes**: Every domain exception should include a `default_code` (snake_case string) for frontend error matching (e.g., `'two_factor_not_enabled'`, `'invalid_password'`)

```python
# common/exceptions.py
class ServiceError(Exception):
    http_status: int = 500
    default_message: str = 'An unexpected error occurred'
    default_code: str | None = None

class NotFoundError(ServiceError):
    http_status = 404
    default_message = 'Not found'

# users/exceptions.py
class TwoFactorNotEnabledError(NotFoundError):
    default_message = 'Two-factor authentication is not enabled for this user'
    default_code = 'two_factor_not_enabled'

# For exceptions with dynamic messages, accept params in __init__:
class CurrencyNotFoundInWorkspaceError(ValidationError):
    def __init__(self, currency: str):
        super().__init__(f'Currency {currency} not found in workspace', code='currency_not_found')
```

### Testing

Use Factory Boy factories (e.g., `WorkspaceMemberFactory`) instead of direct `Model.objects.create()` calls when creating test database records. Factories exist in `<app>/factories.py` across the codebase.

**Factory gotcha:** Factories for financial records (`TransactionFactory`, `PlannedTransactionFactory`, `CurrencyExchangeFactory`) default to creating their own `BudgetPeriod` and `User` via `SubFactory`. When tests need records tied to a specific workspace/account/period, pass these explicitly:

```python
period = BudgetPeriodFactory(
    budget_account=account,
    start_date='2025-01-01',
    end_date='2025-01-31',
    created_by=self.user,
)
pln = self.workspace.currencies.get(symbol='PLN')
transaction = TransactionFactory(
    budget_period=period,
    currency=pln,
    created_by=self.user,
    updated_by=self.user,
)
```

```python
from common.tests.mixins import AuthMixin, APIClientMixin
from django.test import TestCase

class TestTransactions(AuthMixin, APIClientMixin, TestCase):
    user_role = 'member'  # default: 'owner'; also: 'admin', 'viewer'

    def test_create_transaction(self):
        data = self.post('/api/transactions', payload, **self.auth_headers())
        self.assertStatus(201)

    def test_viewer_cannot_create(self):
        # self.user, self.workspace, self.auth_token are available
        self.assertStatus(403)
```

`AuthMixin` creates a workspace with PLN+USD currencies (via `WorkspaceFactory`), a user, a workspace membership, and a default "General" `BudgetAccount`. The mixin also creates an `auth_token` and provides `auth_headers()`.

### Test Data: Prefer Factories Over Service Calls

Use factory classes (`WorkspaceFactory`, `WorkspaceMemberFactory`, `UserFactory`) for test setup. Service calls create extra side effects (currencies, budget accounts, memberships) that make assertions unreliable.

```python
# Bad: service call creates a full workspace with demo fixtures
workspace = WorkspaceService.create_workspace(user=owner, name='Team')

# Good: factory creates only the records needed
workspace = WorkspaceFactory(name='Team')
owner = UserFactory(full_name='Owner', current_workspace=workspace)
WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
```

Only use service calls when the test specifically validates service-level behavior (e.g. `test_delete_workspace_*` calling `WorkspaceService.delete_workspace` directly).

### Test Auth Without AuthMixin

For tests that need an authenticated user but don't fit the `AuthMixin` pattern (e.g., testing a specific user without workspace setup), use factories directly:

```python
from common.auth import create_access_token
from common.tests.factories import UserFactory

user = UserFactory(email='test@example.com', full_name='Test')
user.set_password('testpass123')
user.save()

token = create_access_token(user)
headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
```

Avoid `User.objects.get()` queries in test setup — the factory already returns the user instance.

### Testing on_commit Callbacks

Django's `TestCase` wraps each test in a transaction, which means `on_commit` callbacks don't fire until the test transaction ends. To test methods that use `on_commit`, patch it to execute immediately:

```python
from unittest.mock import patch
from django.db import transaction

def _immediate_on_commit(func, *args, **kwargs):
    func()

class TestMyFeature(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_sends_email(self, mock_on_commit):
        # ... test code ...
        self.assertEqual(len(mail.outbox), 1)
```

Only patch `on_commit` for the specific tests that need it — don't apply it globally.

### Testing Token Expiry

On Python 3.13+, `datetime.datetime` is a C-implemented immutable type and cannot be patched with `unittest.mock.patch('datetime.datetime.now', ...)`. PyJWT also uses `datetime.datetime.now(tz=timezone.utc).timestamp()` internally, so patching `time.time` doesn't affect JWT decoding.

Instead, create a manually-crafted JWT with a past `exp` timestamp using `jwt.encode()` directly:

```python
import datetime as dt
import jwt
from django.conf import settings

now = dt.datetime.now(dt.timezone.utc)
payload = {
    'user_id': str(user.id),
    'type': 'refresh',
    'jti': str(uuid.uuid4()),
    'iat': (now - dt.timedelta(days=8)).timestamp(),
    'exp': (now - dt.timedelta(days=1)).timestamp(),
}
expired_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
```

### Code Cleanup When Refactoring

When removing code that uses specific imports, also remove the now-unused imports. This applies especially to:
- `logging` / `logger` when removing the only logging call
- `send_mail` / `EmailMessage` when migrating to `EmailService`
- `db_transaction` when removing the only atomic block in a file

Unused imports create noise and can mislead future readers about what a module depends on.

## Frontend Code Style (TypeScript/React)

### File Structure

- Components: `components/Category/CategoryRow.tsx`
- Pages: `pages/CategoryPage.tsx`
- Types: `types/index.ts`
- API: `api/client.ts`
- Contexts: `contexts/AuthContext.tsx`

### Component Pattern

- Remove unused props from component interfaces — dead props create misleading API surfaces and confuse future developers.
- When a component handles a concern internally (e.g., resend verification via API call), don't also expose a callback prop for the same concern. One mechanism is enough.

```tsx
interface Props {
  id: number
  name: string
  onSave?: (data: Category) => void
}

export default function CategoryForm({ id, name, onSave }: Props) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      // ...
    } catch (error) {
      toast.error('Failed to save')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* ... */}
    </form>
  )
}
```

### Multi-Step UI Flows

Use a union-typed state machine with conditional rendering for multi-step flows (e.g., setup → verify → confirm):

```typescript
type SectionState = 'idle' | 'setup' | 'showing_codes' | 'disabling'

const [state, setState] = useState<SectionState>('idle')

if (state === 'showing_codes') return <RecoveryCodesDisplay ... />
if (state === 'setup' && setupData) return <SetupForm ... />

const mutation = useMutation({
  mutationFn: api.verifySetup,
  onSuccess: (data) => {
    setState('showing_codes')
    queryClient.invalidateQueries({ queryKey: ['status'] })
  },
})
```

### Auth Response Error Guard

Every auth function that expects an `access_token` in its response must have an `else` branch showing an error toast when the token is missing. Never silently do nothing on an unexpected response:

```typescript
if (response.access_token) {
  // ... existing success logic
} else {
  toast.error('Unexpected response from server. Please try again.')
  return
}
```

### Stateful Component Preservation with CSS `hidden`

When a component holds important transient state (e.g., recovery codes that cannot be re-displayed), use CSS `hidden` to keep it mounted but visually hidden when switching tabs. Conditional rendering (`{condition && <Component />}`) unmounts the component, permanently losing internal state:

```tsx
// Bad — unmounts TwoFactorSection, losing recovery codes
{activeTab === 'security' && <TwoFactorSection />}

// Good — stays mounted, preserving internal state
<div className={activeTab === 'security' ? '' : 'hidden'}>
  <TwoFactorSection />
</div>
```

Only apply this to components where state loss is problematic — other tabs can continue using conditional rendering.

### Avoid Duplicate Toasts

Before adding error toasts in a component's catch block, check whether the called function already handles errors with toast notifications (e.g., `AuthContext.login()` already shows `toast.error()` and re-throws). If it does, the catch block only needs to prevent the unhandled promise rejection (so `finally` can reset loading state). An empty catch block needs a comment to satisfy ESLint's `no-empty` rule:

```typescript
} catch {
  // Error already displayed by AuthContext
} finally {
  setIsSubmitting(false);
}
```

### Token Storage

Access and refresh tokens are stored separately in `localStorage` (`monie_token` and `monie_refresh_token` keys). Three exported helpers manage refresh token storage in `api/client.ts`: `setRefreshToken`, `getRefreshToken`, and `clearAuthToken` (which clears both tokens and the Authorization header).

All auth flows that receive token pairs (`login`, `register`, `verify2FA`) must store both tokens:

```typescript
if (response.access_token) {
  setAuthToken(response.access_token);
  if (response.refresh_token) {
    setRefreshToken(response.refresh_token);
  }
  // ... rest of flow
}
```

The `if (response.refresh_token)` guard matches the optional `refresh_token` field on the `Token` type, providing backward compatibility for endpoints that only return access tokens.

### 401 Interceptor with Token Refresh

The Axios response interceptor in `api/client.ts` uses a queue-based pattern to transparently refresh expired access tokens:

1. When a request fails with 401, check if a refresh token exists. If not, clear tokens and redirect to `/login`.
2. If a refresh is already in progress (`isRefreshing` flag), queue the failed request in `failedQueue` and replay it after the refresh succeeds.
3. On refresh success, store the new token pair, replay all queued requests, then retry the original request.
4. On refresh failure, clear both tokens, reject all queued requests, and redirect to `/login`.
5. Auth routes (`/login`, `/register`) are excluded from redirect to avoid infinite loops.

The `authApi.refresh` method sends `{ headers: { Authorization: '' } }` to prevent sending the expired access token on the refresh request itself.

### Token-Based Verification Pages

```tsx
type State = 'loading' | 'success' | 'error'

export default function VerifyPage() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get('token')
      if (!token) {
        setState('error')
        return
      }
      try {
        await authApi.verify(token)
        setState('success')
      } catch {
        setState('error')
      }
    }
    verify()
  }, [searchParams])

  // Render based on state
}
```

- Always handle the missing-token case (`if (!token)` → error state)
- Public verification pages go outside `ProtectedRoute`; authenticated pages are wrapped in `ProtectedRoute`
- Success states should offer a navigation link; error states should offer a retry or resend option
- Use a named `async` function inside `useEffect` with `try/catch/await` — avoid mixing `.then()` chains with async calls
- Never swallow errors by showing the same success state in both `try` and `catch` blocks. Add a distinct error state with a retry option so users can recover from failures.

### Frontend State Refresh After Mutations

After operations that change server-side state (e.g., email change, profile update), fetch the full updated object from the server rather than patching local state partially:

```tsx
// Bad: partial update may miss fields
updateUser({ email_verified: true })

// Good: fetch full state from server
const updatedUser = await authApi.getCurrentUser()
updateUser(updatedUser)
```

This ensures local state is fully in sync with the backend and avoids stale data.

### API Client Pattern

```typescript
export const categoriesApi = {
  getAll: (params?: { budget_period_id?: number }) => 
    api.get('/categories', { params }),
  create: (data: { budget_period_id: number; name: string }) => 
    api.post('/categories', data),
  update: (id: number, data: { budget_period_id: number; name: string }) => 
    api.put(`/categories/${id}`, data),
  delete: (id: number) => 
    api.delete(`/categories/${id}`),
}
```

### Naming Conventions

- **Components**: PascalCase (`BudgetTable`, `TransactionList`)
- **Functions**: camelCase (`handleSubmit`, `fetchData`)
- **Constants**: camelCase for objects, UPPER_SNAKE for primitives
- **Types/Interfaces**: PascalCase (`User`, `Transaction`, `Props`)
- **Event handlers**: `handle` prefix (`handleSubmit`, `handleClick`)

### Imports Order

```typescript
// React/React Router
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// External libraries
import toast from 'react-hot-toast'

// Internal - API
import { categoriesApi } from '../api/client'

// Internal - Types
import type { Category } from '../types'

// Internal - Contexts/Hooks
import { useAuth } from '../contexts/AuthContext'
```

## Security Model (Four Layers)

1. **Authentication**: `auth=JWTAuth()` on endpoints (or `auth=WorkspaceJWTAuth()` for workspace-scoped endpoints)
2. **Workspace Membership**: Guaranteed by `WorkspaceJWTAuth` — raises 400 if `current_workspace_id` is unset
3. **Role-Based Permissions**: `require_role(user, workspace_id, WRITE_ROLES)`
4. **Resource Ownership**: Filter queries by workspace ID using `Model.objects.for_workspace(workspace_id)`

### Workspace-Scoped Endpoints

For endpoints that require an active workspace, use `WorkspaceJWTAuth`:

```python
from common.auth import WorkspaceJWTAuth

@router.get('', response=list[TransactionOut], auth=WorkspaceJWTAuth())
def list_transactions(request: HttpRequest):
    workspace_id = request.auth.current_workspace_id
    return Transaction.objects.for_workspace(workspace_id)
```

`WorkspaceJWTAuth` returns 400 (not 401) if no workspace is selected, because the token is valid — the workspace state is missing.

### Workspace-Scoped Queries

Use the `for_workspace()` queryset method:

```python
# Instead of:
Transaction.objects.filter(budget_period__budget_account__workspace_id=workspace_id)

# Use:
Transaction.objects.for_workspace(workspace_id)
```

All workspace-scoped models inherit from `WorkspaceScopedModel` which provides the direct `workspace_id` FK.

### List Endpoints Return Empty Arrays for Cross-Workspace Resources

When a list endpoint receives a `budget_period_id` or similar filter that references a resource in another workspace, it returns an empty array (`[]`) rather than 404. This is a deliberate security choice to prevent leaking whether resource IDs exist in other workspaces.

Examples:
- `GET /api/transactions?current_date=...` returns `[]` when no period matches
- `GET /api/categories?budget_period_id=...` returns `[]` when the period belongs to another workspace

Do not "fix" these to return 404 — the empty array behavior is intentional.

## GDPR & Data Integrity Rules

> **When adding or removing a Django model**, always check `backend/users/services.py`:
> - `UserService.delete_account()` — ensure the new model's rows are deleted (or cascade
>   correctly) before parent objects are removed. `on_delete=PROTECT` fields must be deleted
>   in dependency order; otherwise account deletion will raise an `OperationalError`.
> - `UserService.export_all_data()` — include the new model's data in the JSON export so
>   users receive a complete copy of their personal data (GDPR Art. 20). Export only
>   non-sensitive fields (e.g., `is_enabled`, `created_at`, `last_used_at`). Never include
>   secrets, encrypted values, or hashed tokens in the export.
>   Normalize nullable string fields with `or None` (e.g., `user.pending_email or None`) to
>   convert empty strings to `None` for cleaner JSON output.

> **When adding new data fields, processing purposes, or third-party integrations**, update
> the legal pages to keep them accurate:
> - `backend/core/templates/legal/privacy-policy.md` — reflect new data collected or how it is used
> - `backend/core/templates/legal/terms-of-service.md` — reflect new features or usage rules
>
> These files use Django template syntax with variables from environment settings:
> - `{{ operator_name }}` — Company or individual name (LEGAL_OPERATOR_NAME)
> - `{{ contact_email }}` — Contact email (LEGAL_CONTACT_EMAIL)
> - `{{ jurisdiction }}` — Legal jurisdiction (LEGAL_JURISDICTION)
> - `{% if is_individual %}...{% endif %}` — Conditional for individuals vs companies
>
> After editing, bump the `version` in the YAML frontmatter to trigger re-consent prompts.
>
> **Deploying legal document updates**: The database is the runtime source of truth for legal
> documents. After bumping template versions, run:
> ```bash
> python manage.py seed_legal_documents          # Seeds from templates if version changed
> python manage.py seed_legal_documents --force  # Force update even if version matches
> ```
> Alternatively, use Django admin to create/edit `LegalDocument` records directly.

## Email Patterns

### Sending Email

Use `EmailService.send_email()` to ensure emails are only sent after the database transaction succeeds. There are two valid patterns depending on the situation:

**Pattern A — Decorator + `on_commit`** (when the method uses `@db_transaction.atomic` for its own DB operations):

```python
from django.db import transaction as db_transaction
from common.email import EmailService

class MyService:
    @staticmethod
    @db_transaction.atomic
    def do_something(user, workspace_id):
        # ... database operations ...

        db_transaction.on_commit(
            lambda: MyService._send_notification_email(user, workspace_id)
        )

    @staticmethod
    def _send_notification_email(user, workspace_id):
        EmailService.send_email(
            to=user.email,
            subject='Something happened — Monie',
            template_name='email/template_name',
            context={'user_name': user.full_name or user.email},
        )
```

**Pattern B — Context manager + direct call after block** (simpler, no lambda, clearer stack traces):

```python
class MyService:
    @staticmethod
    def do_something(user, new_password: str):
        with db_transaction.atomic():
            user.set_password(new_password)
            user.save()
            # ... other DB operations ...

        # Direct call after the with block exits (after commit)
        MyService._send_notification_email(user)

    @staticmethod
    def _send_notification_email(user):
        EmailService.send_email(
            to=user.email,
            subject='Password changed — Monie',
            template_name='email/password_changed',
            context={'user_name': user.full_name or user.email},
        )
```

**Rules:**
- Only use `on_commit` inside `@db_transaction.atomic` methods so emails are not sent if the transaction rolls back. Never use `on_commit` outside an atomic block — it fires immediately anyway, so a direct call is clearer and less misleading.
- Prefer Pattern B (`with` block + direct call) when the method doesn't already use `@db_transaction.atomic` as a decorator.
- Extract email-sending logic into a separate static method (not a nested function) on the service class. Use a `lambda` in `on_commit` to call it.
- When registering `on_commit` callbacks inside a loop, capture loop variables via lambda default arguments (`lambda x=val: ...`) to avoid late binding.
- `EmailService.send_email` handles failures internally with logging — do not wrap it in `try/except`. If you need to know whether the email was sent, check its boolean return value.

### Email Subject Format

All email subjects follow the format `{Description} — Monie` using an em-dash (`—`) before the app name:

```python
subject='Verify your email — Monie'
subject='Reset your password — Monie'
subject='Password changed — Monie'
subject='Your email was changed — Monie'
subject='Your Monie account has been deleted — Monie'
```

### Email Templates

Each email has an HTML and plain text version in `backend/templates/email/`. Templates extend `base.html` / `base.txt`:

```
templates/email/
  base.html          # Shared HTML layout (inline CSS, max-width 600px)
  base.txt           # Shared plain text layout
  verify_email.html / .txt
  welcome.html / .txt
  reset_password.html / .txt
  password_changed.html / .txt
  email_change_verify.html / .txt
  email_change_notify.html / .txt
  workspace_invitation_new.html / .txt
  workspace_invitation_existing.html / .txt
  member_removed.html / .txt
  member_left.html / .txt
  workspace_deleted.html / .txt
  role_changed.html / .txt
  account_deleted.html / .txt
```

**To add a new email template:**
1. Create `email/my_email.html` extending `email/base.html` with `{% block content %}`, `{% block cta_url %}`, `{% block cta_text %}`
2. Create `email/my_email.txt` extending `email/base.txt` with `{% block content %}`
3. Call `EmailService.send_email(template_name='email/my_email', ...)`

**Emails without a CTA button:** When no action can be taken (e.g., account deleted, password changed), do not include a CTA button. Instead, override the `{% block cta_url %}` with a security note paragraph. See `password_changed.html` and `account_deleted.html` for examples.

### Token Patterns

- **Email verification / generic tokens**: `TimestampSigner` (stateless, configurable expiry via `TOKEN_MAX_AGE` setting):
  ```python
  from common.tokens import generate_verification_token, verify_verification_token
  token = generate_verification_token(user.id)
  user_id = verify_verification_token(token)  # Returns int or None
  ```

- **Password reset tokens**: Django's built-in `PasswordResetTokenGenerator` (one-time-use, invalidated on password change):
  ```python
  from django.contrib.auth.tokens import default_token_generator
  token = default_token_generator.make_token(user)
  valid = default_token_generator.check_token(user, token)
  ```

- **Email change tokens**: `TimestampSigner` with `sign_object`:
  ```python
  from common.tokens import generate_email_change_token, verify_email_change_token
  token = generate_email_change_token(user.id, new_email)
  result = verify_email_change_token(token)  # Returns (uid, email) tuple or None
  ```

### Anti-Enumeration

These endpoints always return 200 with the same generic message regardless of input:
- `POST /api/auth/forgot-password` — "If an account exists with this email, a reset link has been sent."
- `POST /api/auth/resend-verification` — "If your email is unverified, a new verification email has been sent."

Never reveal whether an email address is registered.

**Timing normalization:** Anti-enumeration endpoints can still leak information via response timing (the "send email" path is measurably slower than the "user not found" early-return path). Mitigate by adding `time.sleep(random.uniform(0.1, 0.3))` on early-return paths:

```python
import random
import time

@router.post('/forgot-password', response={200: MessageOut})
def forgot_password(request, data: ForgotPasswordIn):
    user = User.objects.filter(email=data.email).first()
    if not user:
        time.sleep(random.uniform(0.1, 0.3))  # Normalize response time to reduce timing side-channel
        return 200, {'message': 'If an account exists with this email, a reset link has been sent.'}
    # ... send reset email (naturally slow) ...
```

Import `random` and `time` at the module level (stdlib imports, before Django/third-party).

### Environment Variables

Email configuration is set via environment variables (see `example.env`):

```
EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_USE_TLS
DEFAULT_FROM_EMAIL
FRONTEND_URL              # Used in email links
TOKEN_MAX_AGE             # Verification token expiry in seconds (default: 7 days)
```

In tests, `EMAIL_BACKEND` is set to `django.core.mail.backends.locmem.EmailBackend` via `config/test_settings.py`. Use `django.core.mail.outbox` (aliased as `mail.outbox`) to inspect sent emails in tests.

## Common Patterns

### Backend: Workspace-scoped Query

```python
# Using the for_workspace() queryset method (preferred)
queryset = Transaction.objects.for_workspace(workspace_id)

# Direct filter (alternative)
queryset = Transaction.objects.filter(
    budget_period__budget_account__workspace_id=workspace.id
)
```

### Backend: Call a Service from an Endpoint

```python
# In api.py — no business logic, just wire up
@router.post('', response={201: TransactionOut}, auth=WorkspaceJWTAuth())
def create_transaction_endpoint(request, data: TransactionCreate):
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return 201, TransactionService.create(user, workspace_id, data)
```

### Backend: Workspace Management

```python
from workspaces.services import WorkspaceService

# Create a new workspace (auto-switches user to it)
workspace = WorkspaceService.create_workspace(user=user, name='New Workspace', create_demo=True)

# Delete a workspace (switches all affected users to another workspace)
WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)
```

### Frontend: Use Context

```typescript
const { user, isAuthenticated } = useAuth()
const { workspace, workspaces, switchWorkspace, createWorkspace, deleteWorkspace } = useWorkspace()
const { selectedPeriod, selectedPeriodId } = useBudgetPeriod()
```
