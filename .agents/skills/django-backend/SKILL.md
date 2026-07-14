---
name: django-backend
description: Backend (Python/Django/Django Ninja) code conventions for Denarly. Use when writing or modifying backend code — endpoints, services, models, schemas, exceptions, or queries in backend/. Covers import order, naming, service-layer architecture, workspace scoping, Pydantic schemas, error handling, and concurrency patterns.
---

# Django Backend Conventions

## Imports

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

## Naming Conventions

- **Files**: snake_case (`transactions/api.py`, `budgeting/models.py`)
- **Classes**: PascalCase (`TransactionOut`, `Account`, `Budget`)
- **Functions/Variables**: snake_case (`resolve_account`, `account_id`, `date_from`)
- **Constants**: UPPER_SNAKE_CASE (`WRITE_ROLES`, `TOKEN_KEY`)
- **Schemas**: Suffix with purpose (`TransactionCreate`, `TransactionOut`, `TransactionImport`)

## Input Normalization

Normalize user inputs (emails, strings, etc.) early — at the schema/validation level — so all downstream logic (uniqueness checks, token generation, email sending) uses the normalized value. The `ValidatedEmail` type lowercases emails before they reach any endpoint.

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

Prefer `filter().first()` with a `None` check over `get()` with `try/except DoesNotExist` — it follows the return-early pattern and avoids exception-driven control flow:

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

## Django Ninja Endpoints

Endpoints are thin wrappers — parse the request, call the service, return the response. Business logic belongs in service classes. Request-scoped validation that returns HTTP error responses (e.g. token uid/token checking in password reset) may stay in the API layer — only business logic moves to the service.

**API layer responsibilities:** parsing request data, token/uid validation that returns HTTP error responses, authentication/authorization checks, calling the service, returning the response tuple.

**Service layer responsibilities:** business logic (validation, DB operations, side effects, balance updates, email notifications). If logic involves saving to the database or sending emails, it belongs in the service.

For workspace-scoped endpoints, use `WorkspaceJWTAuth` (auto-validates the user has an active workspace):

```python
router = Router(tags=['Transactions'])

@router.get('', response=list[TransactionOut], auth=WorkspaceJWTAuth())
def list_transactions(request: HttpRequest, account_id: int | None = Query(None)):
    """Docstring describing the endpoint."""
    workspace_id = request.auth.current_workspace_id
    return TransactionService.list(workspace_id, account_id=account_id)

@router.post('', response={201: TransactionOut}, auth=WorkspaceJWTAuth())
def create_transaction(request: HttpRequest, data: TransactionCreate):
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return 201, TransactionService.create(user, workspace_id, data)
```

For endpoints that don't require an active workspace (e.g., listing all workspaces), use `JWTAuth()`.

### Document All Possible Response Status Codes

Every endpoint's `response` parameter must list **all** status codes the endpoint can return, including those from raised exceptions:

```python
# Bad — 404 is possible but not documented
@router.post('/verify-2fa', response={200: Token, 401: DetailOut})

# Good — all status codes are documented
@router.post('/verify-2fa', response={200: Token, 401: DetailOut, 404: DetailOut})
```

### Sortable List Endpoints

When a list endpoint accepts a user-controlled `ordering` parameter that flows into `queryset.order_by()`, validate it with a regex `pattern=` allowlist on the `Query(...)` param. Django's `order_by()` raises `FieldError` (→ 500) on unknown fields; the allowlist prevents arbitrary-field injection:

```python
ordering: str | None = Query(
    None,
    pattern=r'^(-?(date|description|amount|type|category__name|account__name|account__currency__code))$',
),
```

Pattern structure is `^(-?(field1|field2|fk__field))$` — optional `-` prefix for descending, then an alternation of allowed fields. Always anchor with `^` and `$`.

**Deterministic tiebreaker for paginated sortable lists:** Append a unique-field secondary sort after the primary `order_by()` to guarantee stable ordering across pages:

```python
sort_order = ordering or '-date'
queryset = queryset.order_by(sort_order, '-id')  # '-id' tiebreaker → stable pagination
```

Transactions use `-date, -id`; transfers and planned transactions use `-date, -id`. Either an id or created_at tiebreak is fine — the rule is "always append a unique-field secondary sort on paginated + user-sortable lists."

## Service Layer

Business logic lives in `<app>/services.py` as class-based services (e.g., `TransactionService`). Services handle validation, DB operations, and balance updates. Domain-specific exceptions live in `<app>/exceptions.py`.

Shared helpers:
- `common/permissions.py` — `require_role(user, workspace_id, allowed_roles)` — raises 403, returns the role
- `common/services/base.py` — `resolve_currency`, `get_or_create_period_balance`, `update_period_balance`

```python
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

**Service-level uniqueness checks:** When a uniqueness constraint is workspace-scoped but no `unique_together` DB constraint exists, validate at the service level (single place, clear domain error):

```python
existing = ExchangeShortcut.objects.for_workspace(workspace_id).filter(
    from_currency=data.from_currency, to_currency=data.to_currency
).exclude(id=shortcut_id).first()  # exclude self on update
if existing:
    raise ExchangeShortcutDuplicateError()
```

**Per-resource limit checks:** When a resource has a workspace-scoped maximum count, validate against a settings-backed env var before creation:

```python
count = ExchangeShortcut.objects.for_workspace(workspace_id).count()
if count >= settings.EXCHANGE_SHORTCUTS_MAX_PER_WORKSPACE:
    raise ExchangeShortcutLimitError()
```

## No Nested Helper Functions

Do not define helper functions inside a method body. Extract them as `@staticmethod` methods on the service class:

```python
# Good — class-level static methods
class WorkspaceService:
    @staticmethod
    def _send_existing_invite(user, workspace):
        ...

    def add_member(self, ...):
        WorkspaceService._send_existing_invite(user, workspace)
```

**Private method ordering:** Place private `@staticmethod` methods before the public methods that call them (private-methods-first).

**Shared helpers for side effects:** When multiple public methods need the same side-effect logic, extract it into a shared private `@staticmethod`. Keep caller-specific guard checks in the public method — the shared helper contains only the side-effect logic:

```python
class PlannedTransactionService:
    @staticmethod
    def _execute_side_effects(planned, workspace_id):
        """Shared logic — no guards, just side effects."""

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

## Concurrent Safety with `select_for_update`

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

**`select_for_update()` must execute inside `atomic()`:** All reads, validation, and writes using `select_for_update()` must be inside a single `atomic()` block. Without `ATOMIC_REQUESTS=True`, PostgreSQL raises `TransactionManagementError` in autocommit mode. Django's `TestCase` wraps each test in a transaction, masking this bug — it only surfaces in production.

```python
# Bad — select_for_update outside atomic (crashes in production, passes in tests):
workspace = Workspace.objects.select_for_update().get(id=workspace_id)
with db_transaction.atomic():
    ...

# Good — everything inside atomic:
with db_transaction.atomic():
    workspace = Workspace.objects.select_for_update().get(id=workspace_id)
    ...
```

**`select_for_update()` + `select_related()` caveat:** Cannot combine with `select_related()` on nullable FKs — PostgreSQL raises "FOR UPDATE cannot be applied to the nullable side of an outer join". Remove `select_related` from locked queries involving nullable FKs.

## Check Object State, Not Just Existence

When a model has a boolean flag (`is_enabled`, `is_active`, `is_verified`, …), always check both existence AND the flag:

```python
# Good — checks existence AND enabled state
twofa = UserTwoFactor.objects.filter(user_id=user_id).first()
if not twofa or not twofa.is_enabled:
    raise TwoFactorNotEnabledError()
```

## Validate Stateful Dependencies Before Operations

When an endpoint or service depends on a resource being in a specific state, validate that state **before** the main operation — a specific error beats a misleading generic one (e.g., check 2FA is enabled before reporting "Invalid verification code").

Also validate and raise **before** creating records — e.g., reject a transaction on a custom-cadence budget when no period covers the date, rather than saving something the UI can't place:

```python
account = TransactionService._resolve_account(workspace_id, data.account_id)
if account.is_archived:
    raise TransactionAccountArchivedError()
Transaction.objects.create(account=account, workspace_id=workspace_id, ...)
```

This applies to both `create` and `update` paths — if a guard exists on create, apply the same guard on update.

## Workspace-Scoped Models

All models that belong to a workspace must inherit from `WorkspaceScopedModel`. This provides:
- Direct `workspace` FK for efficient filtering
- Audit fields: `created_by`, `updated_by`, `created_at`, `updated_at`
- `for_workspace()` queryset method via `WorkspaceScopedQuerySet`
- Validation preventing `workspace_id` changes after creation

```python
from common.models import WorkspaceScopedModel

class Category(WorkspaceScopedModel):
    """Category model scoped to a workspace, owned by a Budget."""

    budget = models.ForeignKey('budgeting.Budget', on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=100)
    is_archived = models.BooleanField(default=False)

    class Meta:
        db_table = 'categories'
        constraints = [
            models.UniqueConstraint(Lower('name'), 'budget', name='uniq_category_name_per_budget'),
        ]

# Service usage - always set workspace_id on creation:
Category.objects.create(budget_id=budget_id, workspace_id=workspace_id, name='Food', created_by=user)
```

**Override abstract FK related names:** `WorkspaceScopedModel`'s abstract base uses `%(class)s_set` defaults. Concrete models should set explicit `related_name` on all FKs.

For models with custom querysets:

```python
class AccountQuerySet(WorkspaceScopedQuerySet):
    def active(self):
        return self.filter(is_archived=False)

class Account(WorkspaceScopedModel):
    objects = AccountQuerySet.as_manager()
```

**Workspace-scoped queries:** Prefer `Model.objects.for_workspace(workspace_id)` over manual FK-chain filters like `filter(account__workspace_id=...)`.

## Pydantic Schemas

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

**Cross-field validation:** Use `@field_validator` with `mode='after'`:

```python
@field_validator('to_currency', mode='after')
@classmethod
def currencies_must_differ(cls, v, info):
    if info.data.get('from_currency') == v:
        raise ValueError('Currencies must be different')
    return v
```

**Shared validated types:** When identical field validators repeat across schemas, extract a shared `Annotated` type with `BeforeValidator`:

```python
def _validate_email(v: str) -> str:
    v = v.lower().strip()
    validator = EmailValidator()
    try:
        validator(v)
    except DjangoValidationError:
        raise ValueError('Enter a valid email address')
    return v

ValidatedEmail = Annotated[str, BeforeValidator(_validate_email)]
```

Define the validation function as a module-level private function and the annotated type as a module constant. Only extract validators that are truly identical across all schemas — keep separate validators on schemas that may diverge. Email validators must include `.lower().strip()` so downstream code receives pre-normalized values.

**Dynamic dict-based schemas for multi-currency data:** When response data is keyed by a dynamic value (e.g., currency codes), use `dict[str, ValueType]` instead of hardcoded fields:

```python
class BudgetSummaryResponse(BaseModel):
    period: BudgetSummaryOut
    currencies: dict[str, CurrencySummary]   # Keyed by currency code ("PLN", "USD", …)
    balances: dict[str, CurrencyBalances]
```

Populate in the API layer by iterating the queryset and grouping into dicts.

## Safe Defaults for `getattr` Fallbacks

When using `getattr` as a safety net for fields added by recent migrations (rolling deploys), always default to the more restrictive/secure value:

```python
# Bad: default True silently grants privileges during rolling deploy
email_verified = getattr(user, 'email_verified', True)

# Good: default False fails safe
email_verified = getattr(user, 'email_verified', False)
```

## Model Field Defaults Must Match Service Defaults

When a service overrides a model field default (e.g., creates with `WeekdayChoices.MONDAY`), the model field `default` must match. Otherwise direct creation paths (Django admin, factories, management commands) produce inconsistent data. Only the field `default` changes — no data migration needed.

## Error Handling

- **Domain Exceptions**: Services raise domain exceptions inheriting from `ServiceError` (in `common/exceptions.py`)
- **Global Handler**: A Django Ninja exception handler in `config/urls.py` converts `ServiceError` to HTTP responses automatically
- **Exception Types**: `NotFoundError` (404), `ValidationError` (400), `AuthenticationError` (401), `PermissionDeniedError` (403)
- **App Exceptions**: Each app defines specific exceptions in `<app>/exceptions.py`
- **Transactions**: Use `@db_transaction.atomic` for database operations that update balances
- **Exception Naming**: `<Domain><ErrorType>Error` — e.g., `TwoFactorNotEnabledError`. Always set `default_message` and `default_code` as class attributes
- **Exception Codes**: Every domain exception should include a `default_code` (snake_case string) for frontend error matching (e.g., `'two_factor_not_enabled'`)

```python
# users/exceptions.py
class TwoFactorNotEnabledError(NotFoundError):
    default_message = 'Two-factor authentication is not enabled for this user'
    default_code = 'two_factor_not_enabled'

# For exceptions with dynamic messages, accept params in __init__:
class CurrencyNotFoundInWorkspaceError(ValidationError):
    def __init__(self, currency: str):
        super().__init__(f'Currency {currency} not found in workspace', code='currency_not_found')
```

## Case-Insensitive Grouping with Display Casing

When grouping text values that vary in casing (e.g., "Amazon"/"amazon"), group by lowercase but display the most common original casing: build a `lowercase → most common variant` map (via `Counter(...).most_common(1)`), aggregate with `.annotate(lower_desc=Lower('description'))`, then map results back through the display map.

## Code Cleanup When Refactoring

When removing code that uses specific imports, also remove the now-unused imports — especially `logging`/`logger` when removing the only logging call, `send_mail`/`EmailMessage` when migrating to `EmailService`, and `db_transaction` when removing the only atomic block.

## Workspace Management

```python
from workspaces.services import WorkspaceService

# Create a new workspace (auto-switches user to it)
workspace = WorkspaceService.create_workspace(user=user, name='New Workspace', create_demo=True)

# Delete a workspace (switches all affected users to another workspace)
WorkspaceService.delete_workspace(user=user, workspace_id=workspace.id)
```
