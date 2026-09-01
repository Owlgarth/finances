---
name: django-backend
description: Backend (Python/Django/Django Ninja) code conventions for Owlgarth Finances. Use when writing or modifying backend code - endpoints, services, models, schemas, exceptions, queries, or migrations in backend/. Covers import order, naming, service-layer architecture, workspace scoping, Pydantic schemas, error handling, translatable error messages (gettext, Accept-Language), concurrency patterns, and migration authoring.
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

### Route Paths Byte-Match the Client URL

Collection POSTs register at `''`, and every route path must agree byte-for-byte with the URL the frontend client calls in `client.ts` - Django Ninja registers `''` and `'/'` as two distinct paths and never folds a trailing slash. Failure mode of a mismatch: a collection POST registered at `'/'` while the client calls the slash-less path resolves into the GET-only collection route and answers **405** - not a 404 and no redirect, because `APPEND_SLASH` only fires for URLs that fail to resolve entirely (this exact split broke workspace-create for every real user while all five sibling routers were correct). Keep one canonical collection URL per router - never add a backcompat `'/'` twin, since Django has no REMOVE_SLASH redirect and the duplicate would be permanent convention noise.

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

**Creation order can itself be the payload.** Ordering a list by `created_at, id` makes "first" meaningful with zero schema fields: the `id` tiebreak is load-bearing because Postgres `now()` is transaction-stable, so rows created in one atomic block share a timestamp and only `id` (insertion order) puts the intended-first row first. `CurrencyCatalogService.list_enabled` is the exemplar - the first enabled currency IS the workspace primary, and consumers derive `currencies[0]` with no `is_primary` field. The order is read-only by construction: the moment users need to reorder, it must become an explicit `position` column (the `BudgetCurrency` through-model is the in-repo precedent), never a reinterpretation of timestamps.

**List-filter values are not resource lookups: no pattern, no 422, no 404.** A `currency_code: list[str] | None = Query(None)` filter carries no `pattern=` - unknown or malformed values simply match nothing and return a 200 with an empty list, identical to filtering by an unknown `account_id`. The regex allowlist above is specifically for `ordering` values, because those reach `order_by()` and raise `FieldError` (500) on unknown fields; filter values only feed `__in` lookups. When a filter is ambiguous about WHICH field it targets, state the semantics in the endpoint docstring (the account-currency filter targets `account__currency__code__in`, never the informational `original_currency` facet).

**Aggregation siblings stay in filter parity with their list endpoint.** When a totals endpoint shares the list's `_build_filtered_queryset` helper, adding a filter to the list endpoint is pure param threading: the aggregation endpoint gains the same bare `Query(None)` param at the same position, and its service methods pass it into the shared helper - a totals strip that disagrees with the filtered list (group totals ignoring the active filter) is exactly the bug this prevents.

**After touching a `Query(..., pattern=...)` line, the gate is a route-importing pytest run, not ruff.** A corrupted regex in the raw string (a stray parenthesis) passes `ruff check` AND `ruff format`, and explodes only at Django Ninja route registration (Pydantic compiles the pattern at import), taking down every test that imports the router - a full traceback wall on the first run. Ruff alone is never sufficient verification for a `pattern=` edit.

### Pagination Param Caps (`page_size`)

Numeric bounds on list-endpoint query params are part of the endpoint contract, declared on the `Query(...)` itself so Django Ninja rejects out-of-range values with an automatic 422 — services keep receiving already-validated ints:

```python
from core.schemas.pagination import ALLOWED_PAGE_SIZES

MAX_PAGE_SIZE = max(ALLOWED_PAGE_SIZES)  # module level in each api.py

page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
```

- Pair `le=` with `ge=1` — the contract rejects 0/negative sizes too, not just huge ones.
- **Derive the cap from the source of truth** (`max(ALLOWED_PAGE_SIZES)`), never hardcode `le=100`. `paginate_queryset` silently coerces any size outside `ALLOWED_PAGE_SIZES` to its default; deriving `MAX_PAGE_SIZE` keeps the explicit 422 and the silent coercion in lockstep if the allowed set ever changes.
- **The cap must not fall below the frontend's maximum.** `ALLOWED_PAGE_SIZES` (backend) and `PAGE_SIZE_OPTIONS` (frontend `utils/pageSize.ts`) duplicate the same list with no cross-reference; the frontend persists the user's choice in localStorage and sends it as `page_size` on every list request. A backend cap below the frontend max 422s real users' stored preference on their main pages — a functional regression dressed as a security fix. Lowering the cap or shrinking the allowed set requires a coordinated frontend change (drop the option from `PAGE_SIZE_OPTIONS` + migrate stored prefs) in the same PR.
- Pin the contract with one boundary test per app: `page_size=1000` → 422, `page_size=0` → 422, and `page_size=<frontend max>` → 200 — the last assertion makes a future cap-lower fail loudly in tests instead of silently breaking the UI.

### Byte-Streaming Download Endpoints

Endpoints that stream stored bytes to the client return a plain
`HttpResponse(content, content_type=...)` with no Ninja response schema -
mirroring `export_transactions` / `users/me/export`. Error status codes are
still declared in `response={404: DetailOut, 503: DetailOut}` and itemized in
the docstring; only the 200 body (the file itself) escapes schematization.
Exemplar: `download_transaction_attachment` in `transactions/api.py`.

- Routing bytes through an authenticated endpoint instead of handing out
  presigned URLs keeps every download behind the four security layers and the
  client-facing URL surface constant - presigned URLs leak the storage host to
  clients and expire opaquely. The Django admin is the sanctioned
  presigned-URL consumer (`transactions/admin.py`).
- User-controlled filenames never reach `Content-Disposition` raw: the RFC
  6266/5987 formatting (ASCII-sanitized `filename="..."` fallback plus a
  `filename*=UTF-8''...` param via `urllib.parse.quote(filename, safe='')`)
  lives on the service (`AttachmentService.content_disposition`), not the
  endpoint module - header-encoding policy is domain logic, and the endpoint
  stays a thin wrapper.
- A stored object that is gone while its metadata row survives raises a
  `NotFoundError` subclass with its own `default_code` (`file_missing`) so the
  client can tell "no such attachment" (`not_found`) from "row intact, bytes
  unreachable".

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
            raise UnknownCurrencyError(data.currency)
        trans = Transaction.objects.create(..., created_by=user, updated_by=user)
        TransactionService.update_period_balance(...)
        return trans
```

**Service-level uniqueness checks:** Validate uniqueness at the service level so a violation raises one clear domain error from a single place (the DB constraint stays the real guard). Exemplar: the category duplicate-name guard (`_check_ci_duplicate` in `categories/services.py`):

```python
queryset = Category.objects.filter(budget_id=budget_id, name__iexact=name)
if exclude_id is not None:
    queryset = queryset.exclude(id=exclude_id)
if queryset.exists():
    raise CategoryDuplicateNameError()
```

**Pre-clear-then-set for partial-unique-constraint partitions:** When a partial unique constraint enforces "at most one flagged row per partition" (see §Workspace-Scoped Models), the service pre-clears the partition *before* setting the new flag so well-behaved clients never hit the constraint — the DB constraint is the real guard, the pre-clear exists for clean UX, never as the only enforcement (no `try/except IntegrityError`):

```python
@staticmethod
@db_transaction.atomic
def create(user, workspace_id, data):
    Account.objects.for_workspace(workspace_id).filter(
        currency=data.currency, is_default_for_currency=True
    ).update(is_default_for_currency=False)  # pre-clear the partition
    return Account.objects.create(..., is_default_for_currency=data.is_default_for_currency)
```

On update, `.exclude(id=account.id)` so a row never clears its own flag.

**Per-resource limit checks:** When a resource has a workspace-scoped maximum count, validate against a settings-backed env var before creation. Exemplar: the workspace member limit (`add_member` in `workspaces/services.py`):

```python
current_member_count = WorkspaceMember.objects.filter(workspace_id=workspace_id).count()
if current_member_count >= settings.WORKSPACE_MAX_MEMBERS:
    raise WorkspaceMemberLimitReachedError()
```

**Ordered member sets are through-models with a `position` column, not FK flags on the parent** (`BudgetCurrency`, after the `WorkspaceCurrency` precedent: plain `Model` - scoped transitively via the parent FK, no audit fields - `Meta.ordering = ['position', 'id']`, unique together on parent+member). Writes validate ALL members first (every `get_enabled(...)` raise happens BEFORE any delete - a bad payload must not wipe the existing set inside the caller's atomic block), dedupe preserving first occurrence (`list(dict.fromkeys(codes))`), then delete + `bulk_create` with `position=enumerate_index`. Importers restore junction rows the same way, inside their existing atomic block - per-row creates matching the neighboring children, codes resolved through the same path the sibling entities use. The read side serializes through a model property (see §Pydantic Schemas).

**Same-set reorders use `bulk_update`; delete + `bulk_create` is for set-changing writes.** When only positions move and the membership set is unchanged, recreating the rows churns ids and `created_at` for nothing. Reorder validation stays validate-all-first: a single `len(codes) != len(rows) or set(codes) != set(row_by_code)` permutation check raises before any write (a bad payload can never disturb the stored order) and catches every failure shape structurally - unknown, missing, extra, duplicate, and empty among direct callers; the schema 422s empty at the API. Positions stay sparse: no renumbering on disable, gaps cost nothing, and ordering never assumes contiguity. Direct creates must append via the next-position helper - a bare `WorkspaceCurrency.objects.create` lands at the column default `0`, AHEAD of the primary, breaking the position-0-is-primary invariant.

**Split resolvers for optional FKs with a dependent field.** When a parent FK becomes optional but a derived field stays mandatory (account optional, own currency required), split resolution into `_resolve_account` (optional - omitted id resolves to `None`, but an explicitly-set archived id still raises) and `_resolve_currency` with a three-way branch: account set + currency omitted = derive from the account; account set + mismatched currency = 400; no account + omitted = 400 required. The account branch compares plain codes with no enablement lookup - an account's currency is enabled by construction; only the account-less branch resolves through `get_enabled` (404). Resolution order is a UX contract: run specific validators (`adjustment requires an account`) BEFORE the generic currency-required branch so `adjustment + no account + no currency` reports the specific error, not the generic one.

**A model change's rider census is a grep, not a list.** When a model gains a NOT NULL column or a positional invariant, every direct `Model.objects.create` site outside the owning service needs the rider kwarg to keep the column satisfiable - find them by grepping `Model.objects.create` across ALL apps (service importers, legacy import, demo fixtures), and land every rider in the same task as the column so the NOT NULL lands green. Audit plan-provided rider snippets especially: a rider written `currency=account,` where `account` is an Account INSTANCE silently stores `currency_id = account.id` - cross-FK corruption that passes tests only where ids happen to coincide. An assignment must name the like-typed field: `currency=account.currency`.

**New params on a service method with positional callers join the keyword group.** When existing call sites pass the first N arguments positionally (`PlannedTransactionService.list(workspace_id, status, account_id, start_date, end_date)`), inserting a new param at its semantically natural spot (right after `account_id`, where the filter chain would suggest) silently rebinds every caller's next positional argument - `start_date` becomes `currency_code` with no error. Place new params after the established positional run and pass them by keyword everywhere: filter-chain order is semantically irrelevant (an AND of all provided filters), signature placement is not. Before adding a param, check how the method's real callers invoke it.

**Pop the prefetch cache after rewriting rows behind a prefetched relation.** When a read path prefetches a relation (`BudgetService.get()` prefetches `currencies`) and a write path on the same instance rewrites those rows via plain querysets (delete + recreate), the in-memory prefetch cache still serves the OLD set to anything reading the relation afterward - plain queryset writes never touch the instance cache. End the write helper with `getattr(obj, '_prefetched_objects_cache', {}).pop('<relation>', None)` (the `getattr` guard keeps the create path safe where no cache exists). `refresh_from_db()` would clear the cache too, but it also discards unsaved instance state, so it is unusable mid-update.

**User-sent collections raise on invalid entries; machine-chosen defaults skip.** An unknown code in an explicit client list raises (`UnknownCurrencyError`, 404 - correct feedback for user choices), while an unknown entry in a module-level convenience default (`DEFAULT_WORKSPACE_EXTRA_CURRENCIES`) is silently skipped - raising on a machine-chosen default would take down registration and account reset on a partially seeded catalog. Single-source the raise path (a `strict` flag set at the codes-dedup branch) instead of duplicating the validation call between the two routes.

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

**Multi-row `select_for_update` — lock in id-order, re-check with `list()`:** When a mutation locks more than one row (e.g. merging two categories), acquire locks in ascending id order so concurrent transactions over the same pair can never deadlock — id-ascending is the house default lock order, and every transaction in the app acquires locks in the same order:

```python
locked = list(
    Category.objects.select_for_update()
    .filter(id__in=[target.id, source.id])
    .order_by('id')
)
if len(locked) != 2:
    raise CategoryNotFoundError()  # a concurrent tx deleted the source while we waited on the lock
```

The post-lock re-check uses `list(...)` + `len(locked) != N` — a concurrent transaction may have deleted a row while this one waited, and the count check surfaces that as a domain 404 rather than a 500. This is the multi-row analogue of the single-row `get()` + `DoesNotExist` form above.

**Aggregates silently strip `FOR UPDATE`:** Postgres forbids `FOR UPDATE` with aggregate functions, so `.count()`, `.exists()`, and `.aggregate()` on a `select_for_update()` queryset silently emit a plain `SELECT` with no lock — no error, no warning, and the race the lock was meant to close stays open (single-threaded tests still pass). Only row-returning evaluation (e.g. `list(qs)`) actually acquires locks. Never use an aggregate terminal to verify or count a `select_for_update` queryset.

**Unique-constraint races: savepoint, then re-read outside it.** When a create path can race on a unique constraint (e.g. idempotency-key dedup), wrap the racing insert — and the parent-row writes that must not be orphaned — in a *nested* `with db_transaction.atomic():` (SAVEPOINT), catch `IntegrityError`, and re-read the winner **after** the savepoint block:

```python
@staticmethod
@db_transaction.atomic
def create_with_key(user, workspace_id, data, key):
    existing = MyService._lookup(key, user, workspace_id)
    if existing:
        return existing.target
    MyService._sweep_expired(key, user, workspace_id)  # expired rows still hold the constraint
    try:
        with db_transaction.atomic():  # SAVEPOINT
            target = MyService._do_create(user, workspace_id, data)
            KeyRecord.objects.create(key=key, user=user, workspace_id=workspace_id, target=target)
            return target
    except IntegrityError:
        pass  # lost the race — savepoint rollback removed BOTH the key insert and the target
    return MyService._lookup(key, user, workspace_id).target  # re-read OUTSIDE the savepoint
```

- A bare `try/except IntegrityError` around the outer atomic block is **wrong**: Django marks the outer `atomic()` broken on any `IntegrityError`, even when caught — the follow-up re-read raises `TransactionManagementError` at runtime (single-threaded tests won't show it). The savepoint isolates the rollback so the outer transaction stays usable.
- TTL-style dedup records: expired rows still occupy the unique constraint and will raise on insert — sweep them (same filter set as the lookup) between lookup and insert. Never-reused keys are a periodic-cleanup concern, not a request-path one.
- Helpers that only ever run inside an existing atomic block (the savepoint, or the outer method's) stay undecorated — a redundant `@db_transaction.atomic` would open a pointless nested savepoint on every call.

**This flow is ONE shared helper, not an inline pattern to re-implement.** `common/idempotency.py` exports `create_with_idempotency(...)`, the parameterized lookup→sweep→savepoint→IntegrityError flow above (`lookup`/`do_create` callables + `record_model`/`target_model`/`target_field`), and `parse_idempotency_key(request) -> (key, error_dict)` — a tuple, not an exception, so the 400 response tuple stays in the API layer. Injecting the lookup as a callable (resolved at call time via `Service._lookup_idempotency_key`) preserves the `mock.patch.object(Service, '_lookup_idempotency_key', ...)` test seam. When another model needs the flow, **mirror the dedup table field-for-field as a plain model** (own migration, own constraint name; transient record — not `WorkspaceScopedModel`, no audit fields, excluded from export/import/delete per the `data-deletion-gdpr` skill) and delegate to the helper: reshaping an existing dedup table (GenericFK, second nullable FK, shared-app move) churns its constraint name, migration chain, and test contract. TTL/max-length live only in the module constants (`IDEMPOTENCY_TTL`, `IDEMPOTENCY_KEY_MAX_LENGTH`) — never re-hardcode `timedelta(hours=24)`; lookup window and sweep window must not be able to drift apart.

**Dedup lookups and unique constraints stay in lockstep.** For any unique-constraint-backed dedup, the lookup's filter set and the constraint's column set must widen or narrow **together**. Workspace-scoping the lookup while the constraint stays narrower turns a legitimate cross-scope collision into an unhandled `IntegrityError` (500) on the savepoint race path above — the constraint must widen in the same commit so the race-path insert succeeds per-scope. Keep the sweep's filter set identical to the lookup's.

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

**Partial unique constraints for "at most one flagged row per partition":** When an invariant is "at most one row with `flag=True` per (scope, partition)" while many rows carry `flag=False`, enforce it at the DB level with a partial unique constraint, not service logic alone:

```python
from django.db.models import Q, UniqueConstraint

class Meta:
    constraints = [
        UniqueConstraint(
            condition=Q(is_default_for_currency=True),
            fields=['workspace', 'currency'],
            name='one_default_account_per_currency',
        ),
    ]
```

The `condition=Q(...)` form lets any number of `False` rows coexist while guaranteeing at most one `True` row per partition — immune to service-layer bugs and direct DB writes. The constraint `name` is part of the contract (service tests assert against it; renaming requires a migration). See §Pre-clear-then-set for the companion service pattern.

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

## Migrations

- **Keep what `makemigrations` emits, even beyond the spec'd change.** The autodetector may emit `AlterModelOptions` carrying options the model has had all along (`verbose_name_plural` riding along with a new `ordering`) because the existing migration state never recorded them - stripping the "extra" keys leaves latent drift for the next `makemigrations` run to rediscover.
- **Migration dependencies follow the landed tree, not the plan text.** When an earlier task on the same branch already added a sibling-app migration, the new migration depends on THAT migration, not the plan-pinned older one; `makemigrations --check` on a clean tree is the arbiter.
- **A NOT NULL FK column lands as ONE hand-merged migration.** Declare the field nullable → run `makemigrations` (this captures the autodetector's index name and full dependency list) → tighten to NOT NULL → hand-merge into one migration: `AddField(null=True)` + `AlterField(null=False)` + `AddIndex`. The interactive questioner cannot run non-interactively, so the second generation is derived by hand from the first's shape. With the no-existing-data decision, there is no backfill - dev DBs with rows are dropped and recreated, and pytest's fresh test DB proves the apply.
- **An index lands WITH the column it serves**, in the same migration (the reading task expects it there). A nullable-column index needs no nulls-tolerant companion: Postgres btree indexes NULLs, and account-filtered queries never match account-less rows.

## FK Flips: Stale-Join Sweep and Aggregate Rewiring

When an FK relationship moves (an aggregate source flipping from `account__currency__code` to a stored own `currency__code`), grep for readers of the OLD path (`account__currency`, `instance.account.currency`) and flip them together - totals annotations, list filters, `ORDERING_PATTERN` tokens, and export `select_related` chains all rewire in one commit; INNER JOINs through a now-NULL FK would silently drop the null-side rows from every aggregate. An aggregate flip touches four surfaces together: the annotation source, the `values()`/map keys, the docstrings, AND the tests - a half-flipped aggregate (annotation renamed, map key not) fails loudly, but a stale docstring misleads silently. Put the newly-required `select_related` member FIRST in the argument list (`select_related('currency', ...)`) so prefix-greps stay honest; argument order is join-plan-neutral. Doc riders (a filter-language paragraph in a UX doc) ride the code task that changes the semantics, never a separate docs-only commit.

**Interim guards carry their own removal conditions.** A guard that exists only because another model's column is still NOT NULL states, in domain terms, what it protects and what completes the change (no task ids); the task that nulls the column REMOVES the guard and completes the behavior in the same commit - an interim guard left behind becomes a permanent wrong branch.

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

**Optional list fields (and same-module forward references):** A schema referencing a type defined later in the same module must use the string form — `items: list['TransactionItemIn']` — because Python evaluates bare annotations at class-definition time (`NameError` fires before Pydantic ever sees the model; ruff flags `F821`); Pydantic v2 resolves string annotations at module-load finalization. The default is `Field(default_factory=list, max_length=N)` — never a bare `[]` (mutable default) — with `max_length` matching the sibling endpoint that already caps the same collection. `default_factory=list` keeps every existing caller that omits the field working. In the service, bulk-create the children inside the parent's existing `@db_transaction.atomic` block, guarded by `if data.items:` — the children become atomic with the parent for free. Helpers consuming an already-validated schema skip per-row defensive parsing; reserve try/except parsing for untyped sources (parser dicts, external APIs).

That default is for collections with a sane EMPTY default. When absence and emptiness must stay distinguishable - `[]` is invalid input (a 422 via `min_length=1`) while omission means "use your defaults" - the field is `Field(None, min_length=1, ...)` instead, and the service branches on truthiness (`if currency_codes:`), which additionally shields direct callers from an `IndexError` on an empty list.

**M2M collections serialize through a model property.** `from_attributes` cannot coerce a Django `RelatedManager` to `list[str]` - define `@property currency_codes -> list[str]` on the model (`[bc.currency.code for bc in self.currencies.all()]`). It serializes cleanly, consumes the prefetch cache when present, falls back to `Meta.ordering` otherwise, and becomes the ONE derivation path: the API `Out` schema, the GDPR exporter (`prefetch_related('currencies__currency')` feeding the same cache), and any future reader all read the property instead of re-deriving the comprehension. Exemplar: `Budget.currency_codes`.

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

**Removing a response field requires a consumer census.** Before dropping a field from an `Out` schema, grep every consumer of that field - frontend types, components, and tests - and migrate them in the same branch (the `download_url` removal paired the backend drop with the frontend blob rework). A field the backend silently stops sending while the frontend still types it is an invisible `undefined` at runtime, not a compile error.

## Distinguishing "Client Sent" from "Defaulted" on Partial Updates

When a Pydantic update schema defaults a boolean to `False` (not `None`) so the `setattr` loop sees a plain `bool`, the service cannot tell "client omitted the field" from "client sent `False`" by reading the validated attribute — both are `False`. Branch on the `model_dump(exclude_unset=True)` dict instead:

```python
update_data = data.model_dump(exclude_unset=True)
if update_data.get('is_default_for_currency') is True:
    # client explicitly sent True — run the pre-clear (see §Service Layer)
    Account.objects.for_workspace(workspace_id).filter(
        currency=account.currency, is_default_for_currency=True
    ).exclude(id=account.id).update(is_default_for_currency=False)
for field, value in update_data.items():
    setattr(account, field, value)
```

`exclude_unset=True` includes a key only if the client sent it, so `.get(...)` returns `None` when omitted and the actual value when sent. The `is True` identity check is what distinguishes an explicit `True` from both `None` (omitted) and `False` (explicitly cleared) — truthiness would mis-fire on a truthy non-bool.

**The full-replace dual: direct assignment makes the schema default the stored value.** An update service that assigns fields directly (`trans.note = data.note`, no `exclude_unset` loop) has full-replace semantics - an absent key stores the schema default, i.e. it CLEARS the field. That is free, correct absent-key behavior: pin it with the create schema's docstring and a replace-and-clear test instead of reaching for `exclude_unset`; the dict dance above exists only for partial-update schemas where omission must NOT overwrite.

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

## `update_fields` Must Include Fields Set by Model Overrides

`save(update_fields=[...])` persists **only** the listed fields — any field a model-level override sets in memory is silently dropped, with no error and no failing test. When a model method mutates state beyond the field it is named for (e.g. `User.set_password` also stamps `password_changed_at`), every `save(update_fields=...)` call site on that model must list the extra fields:

```python
user.set_password(new_password)
user.save(update_fields=['password', 'password_changed_at'])  # stamp comes from the override
```

When adding a field to such an override, grep `update_fields=` across the app in the same task — a missed list quietly drops the write (for the `password_changed_at` instance, a dropped stamp lets a stolen refresh token survive a password change; see the `auth-security` skill).

## Read Settings at Call Time

Read `django.conf.settings` values inside the function body, not at module import. Import-time reads freeze the value for the process lifetime and make `override_settings` useless in tests — call-time reads are why `override_settings(TRUSTED_PROXY_COUNT=...)` and `override_settings(TWO_FACTOR_ENCRYPTION_KEY=...)` work. The deliberate exception is decorator configuration (e.g. `rate_limit(...)` captures `settings.RATE_LIMIT_*` at decoration time); the test consequence — those limits are only testable at their defaults — is in the `backend-testing` skill.

## Error Handling

- **Domain Exceptions**: Services raise domain exceptions inheriting from `ServiceError` (in `common/exceptions.py`)
- **Global Handler**: A Django Ninja exception handler in `config/urls.py` converts `ServiceError` to HTTP responses automatically
- **Exception Types**: `NotFoundError` (404), `ValidationError` (400), `AuthenticationError` (401), `PermissionDeniedError` (403)
- **App Exceptions**: Each app defines specific exceptions in `<app>/exceptions.py`
- **Transactions**: Use `@db_transaction.atomic` for database operations that update balances
- **Exception Naming**: `<Domain><ErrorType>Error` — e.g., `TwoFactorNotEnabledError`. Always set `default_message` and `default_code` as class attributes
- **Exception Codes**: Every domain exception should include a `default_code` (snake_case string) for frontend error matching (e.g., `'two_factor_not_enabled'`)
- **Translatable by default:** `default_message` is `gettext_lazy`-wrapped; dynamic messages %-format into a wrapped msgid (see Error Messages Are Translated)

```python
# users/exceptions.py
from django.utils.translation import gettext_lazy

class TwoFactorNotEnabledError(NotFoundError):
    default_message = gettext_lazy('Two-factor authentication is not enabled for this user')
    default_code = 'two_factor_not_enabled'

# For exceptions with dynamic messages, accept params in __init__ and
# %-format into the wrapped msgid (never an f-string; see Error Messages Are Translated):
class UnknownCurrencyError(NotFoundError):
    default_code = 'unknown_currency'

    def __init__(self, code: str):
        super().__init__(gettext_lazy('Currency %(code)s not found in the catalog') % {'code': code})
```

**Disable/delete guards enumerate their blockers per type.** A guard that counts blocking references returns a per-type breakdown dict (`{'accounts': n, 'category_budgets': n, ...}`), not a summed int, and the exception composes the human-readable sentence from a module-level label map (`REFERENCE_LABELS = {'accounts': 'account', ...}` in `currencies/exceptions.py`), pluralizing per count with a generic fallback for unknown kinds. The sentence rides the existing `{'detail': ...}` handler channel, so the frontend renders it verbatim with zero client-side enumeration logic. Dict iteration order drives sentence order - the label map and the breakdown dict are the only places to touch when a new PROTECT FK joins the guard. Exemplar: `CurrencyInUseError`. Guard extensions are append-only: a new reference type joins `_reference_count` LAST and its label joins `REFERENCE_LABELS` LAST - the composed sentence's word order stays stable for every existing test assertion; inserting mid-order silently rewrites every pinned sentence.

**An FK that does not gate an operation can still pin the row against its cleanup.** When un-blocking a guard (transaction original-currency facets stopped counting toward currency disable), check `on_delete` at every DELETION site, not just in the guard: `Transaction.original_currency` is `on_delete=PROTECT`, so the "orphaned" custom-row cleanup that now runs anyway would raise `ProtectedError` (500) on a facet-referenced row. The deletion site needs its own reference check - a facet-referenced row is not orphaned (it stays, re-enablable). Excluding a reference type from the guard NEVER means the row is safe to delete; it means the guard and the cleanup answer different questions.

## Error Messages Are Translated (gettext)

API error details are user-facing UI: every message that can reach the `{'detail': ...}` handler is translatable. Selection is request-driven - `LocaleMiddleware` (after SessionMiddleware) picks the catalog from the request's `Accept-Language` header (the frontend sends it on every request); no header, an unknown language, or a missing translation falls back to the English source string.

- **`<app>/exceptions.py` uses `gettext_lazy` throughout.** Class attributes are assigned at import time, so only a lazy proxy resolves the language at response time: `default_message = gettext_lazy('...')`, and dynamic constructors %-format the lazy msgid (`super().__init__(gettext_lazy('Currency %(code)s not found') % {'code': code})`).
- **Service raise sites and Pydantic validators use runtime `gettext` `_()`** - the same split as any other import-time vs. request-time evaluation: `raise ValidationError(_('Currency %(code)s not found') % {'code': code})`.
- **Placeholders in translatable messages are named %-format, never f-strings.** An f-string interpolates before gettext sees it, baking English word order into the message; the msgid must be one complete sentence.
- **Updating translations:** `uv run python manage.py makemessages -l uk -l pl --no-obsolete` regenerates `locale/<lang>/LC_MESSAGES/django.po`; translate the msgstrs, run `compilemessages` (the Docker entrypoints compile on boot; a gettext-absent host runs the same command through `./dev.sh manage makemessages ...`). The full workflow is in `docs/i18n.md`.
- **Scope: API error details only.** Emails and legal document text stay English by design (see the `email-sending` skill); do not gettext those.
- Testing translated responses (headers, fallback assertions) is in the `backend-testing` skill's Accept-Language pattern.

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
