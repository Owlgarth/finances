# Service Layer and Concurrency

Part of the `django-backend` skill. Read before writing or changing service methods: uniqueness and limit checks, ordered member sets, optional-FK resolvers, rider censuses, prefetch caches, and row locking with `select_for_update`.

## Service Layer

Business logic lives in `<app>/services.py` as class-based services (e.g., `TransactionService`). Services handle validation and DB operations. Account balances and budget periods are derived on read, never stored, so no service write path maintains a balance row (see `docs/architecture.md`). Domain-specific exceptions live in `<app>/exceptions.py`.

Shared helpers:
- `common/permissions.py` - `require_role(user, workspace_id, allowed_roles)` - raises 403, returns the role
- `currencies/services.py` - `CurrencyCatalogService.get_enabled(workspace_id, code)` - returns an enabled workspace currency or raises `CurrencyNotEnabledError`
- `common/services/base.py` - `delete_workspace_financial_records(workspace_id)` - deletes a workspace's domain records in PROTECT-safe dependency order

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
        account = TransactionService._resolve_account(workspace_id, data.account_id)
        currency = TransactionService._resolve_currency(workspace_id, account, data.currency_code)
        return Transaction.objects.create(
            ..., account=account, currency=currency, created_by=user, updated_by=user
        )
```

**`get_or_create` on a scoped queryset repeats the scoping column as an explicit lookup kwarg.** Django applies queryset filters on the `get()` path but builds the create params from `kwargs + defaults` only - the filters NEVER reach `create()` (Django 6, `django/db/models/query.py`). `Model.objects.for_workspace(ws_id).get_or_create(user=user, ...)` therefore finds existing rows fine but raises `ValueError: workspace_id must be set before save` from `WorkspaceScopedModel.save` on every first GET. Write `for_workspace(workspace_id).get_or_create(user=user, workspace_id=workspace_id, defaults=...)` so the workspace guard and the create path both hold.

**Service-level uniqueness checks:** Validate uniqueness at the service level so a violation raises one clear domain error from a single place (the DB constraint stays the real guard). Exemplar: the category duplicate-name guard (`_check_ci_duplicate` in `categories/services.py`):

```python
queryset = Category.objects.filter(budget_id=budget_id, name__iexact=name)
if exclude_id is not None:
    queryset = queryset.exclude(id=exclude_id)
if queryset.exists():
    raise CategoryDuplicateNameError()
```

**Pre-clear-then-set for partial-unique-constraint partitions:** When a partial unique constraint enforces "at most one flagged row per partition" (see §Workspace-Scoped Models), the service pre-clears the partition *before* setting the new flag so well-behaved clients never hit the constraint - the DB constraint is the real guard, the pre-clear exists for clean UX, never as the only enforcement (no `try/except IntegrityError`):

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

**Derived-count limit checks validate BEFORE any mutation, walking an unsaved probe.** When a limit guards a derived count (occurrences from a generation pointer to an end date), it cannot be a DB constraint - the count is never stored - so it is service validation raising a clean 400 (`MAX_MATERIALIZE_OCCURRENCES` in `RecurringTransactionService._validate_materialize_all`). The guard runs on create AND update before the first INSERT/save: a rejected rule must leave zero rows behind, and a post-hoc guard means the rows already exist. The count walk seeds exactly like the generation loop (pointer + 1 day, else `max(start_date, created_at)`), mirrors the loop's no-backfill skip, and steps an UNSAVED probe instance with the model's own `next_occurrence_on_or_after` - a second implementation of the calendar math drifts from the loop's - capped at MAX + 1 steps so it terminates for any end_date.

**A mutation response serializes the endpoint's own instance; side-effect machinery running on a separate instance never updates it.** The recurring generator re-fetches the rule under lock and advances `last_generated_date` there, so create/update responses still carry the PRE-generation pointer and pending counts. That is the deliberate wire contract, not an omission: never "fix" it with a re-fetch before returning (the test shape that pins it - both facts, every mutation path - is in the `backend-testing` skill).

**Ordered member sets are through-models with a `position` column, not FK flags on the parent** (`BudgetCurrency`, after the `WorkspaceCurrency` precedent: plain `Model` - scoped transitively via the parent FK, no audit fields - `Meta.ordering = ['position', 'id']`, unique together on parent+member). Writes validate ALL members first (every `get_enabled(...)` raise happens BEFORE any delete - a bad payload must not wipe the existing set inside the caller's atomic block), dedupe preserving first occurrence (`list(dict.fromkeys(codes))`), then delete + `bulk_create` with `position=enumerate_index`. Importers restore junction rows the same way, inside their existing atomic block - per-row creates matching the neighboring children, codes resolved through the same path the sibling entities use. The read side serializes through a model property (see §Pydantic Schemas).

**Same-set reorders use `bulk_update`; delete + `bulk_create` is for set-changing writes.** When only positions move and the membership set is unchanged, recreating the rows churns ids and `created_at` for nothing. Reorder validation stays validate-all-first: a single `len(codes) != len(rows) or set(codes) != set(row_by_code)` permutation check raises before any write (a bad payload can never disturb the stored order) and catches every failure shape structurally - unknown, missing, extra, duplicate, and empty among direct callers; the schema 422s empty at the API. Positions stay sparse: no renumbering on disable, gaps cost nothing, and ordering never assumes contiguity. Direct creates must append via the next-position helper - a bare `WorkspaceCurrency.objects.create` lands at the column default `0`, AHEAD of the primary, breaking the position-0-is-primary invariant.

**Split resolvers for optional FKs with a dependent field.** When a parent FK becomes optional but a derived field stays mandatory (account optional, own currency required), split resolution into `_resolve_account` (optional - omitted id resolves to `None`, but an explicitly-set archived id still raises) and `_resolve_currency` with a three-way branch: account set + currency omitted = derive from the account; account set + mismatched currency = 400; no account + omitted = 400 required. The account branch compares plain codes with no enablement lookup - an account's currency is enabled by construction; only the account-less branch resolves through `get_enabled` (404). Resolution order is a UX contract: run specific validators (`adjustment requires an account`) BEFORE the generic currency-required branch so `adjustment + no account + no currency` reports the specific error, not the generic one.

**A model change's rider census is a grep, not a list.** When a model gains a NOT NULL column or a positional invariant, every direct `Model.objects.create` site outside the owning service needs the rider kwarg to keep the column satisfiable - find them by grepping `Model.objects.create` across ALL apps (service importers, legacy import, demo fixtures), and land every rider in the same task as the column so the NOT NULL lands green. Audit plan-provided rider snippets especially: a rider written `currency=account,` where `account` is an Account INSTANCE silently stores `currency_id = account.id` - cross-FK corruption that passes tests only where ids happen to coincide. An assignment must name the like-typed field: `currency=account.currency`. The same census grep matches SUBMODEL names - `PlannedTransaction.objects.create` contains the literal `Transaction.objects.create` - so classify substring hits explicitly instead of letting them pad the census. When the referenced entity is merge-able, the census has a second write-site family: a new FK consumer extends the merge's re-point block in the SAME locked transaction (in the existing re-point order, no workspace scoping - the source is pre-verified), or the merge re-points the old consumers while the new FK SET_NULLs to inherit, silently losing attribution.

**A system-owned derived row type has exactly ONE writer helper; every managed write path routes through it.** When the server owns a derived row (the coverage remainder), one service helper (`TransactionService._normalize_coverage`) is its only constructor, and create/update/replace/auto-fill/demo-fixture/import paths all call it - a second construction site drifts from the normalization rule and double-represents the derived value. Optional control fields targeting the derived row (`remainder_category_id`) validate only AFTER the helper runs and only when a row actually results: whether they apply is decidable only post-derivation, so an exact-cover payload silently ignores them instead of 400ing on fields the system would disregard anyway. Importers re-enter the same helper rather than re-implementing its math (import-side rules in the `data-deletion-gdpr` skill).

**New params on a service method with positional callers join the keyword group.** When existing call sites pass the first N arguments positionally (`PlannedTransactionService.list(workspace_id, status, account_id, start_date, end_date)`), inserting a new param at its semantically natural spot (right after `account_id`, where the filter chain would suggest) silently rebinds every caller's next positional argument - `start_date` becomes `currency_code` with no error. Place new params after the established positional run and pass them by keyword everywhere: filter-chain order is semantically irrelevant (an AND of all provided filters), signature placement is not. Before adding a param, check how the method's real callers invoke it.

**Pop the prefetch cache after rewriting rows behind a prefetched relation.** When a read path prefetches a relation (`BudgetService.get()` prefetches `currencies`) and a write path on the same instance rewrites those rows via plain querysets (delete + recreate), the in-memory prefetch cache still serves the OLD set to anything reading the relation afterward - plain queryset writes never touch the instance cache. End the write helper with `getattr(obj, '_prefetched_objects_cache', {}).pop('<relation>', None)` (the `getattr` guard keeps the create path safe where no cache exists). `refresh_from_db()` would clear the cache too, but it also discards unsaved instance state, so it is unusable mid-update.

**User-sent collections raise on invalid entries; machine-chosen defaults skip.** An unknown code in an explicit client list raises (`UnknownCurrencyError`, 404 - correct feedback for user choices), while an unknown entry in a module-level convenience default (`DEFAULT_WORKSPACE_EXTRA_CURRENCIES`) is silently skipped - raising on a machine-chosen default would take down registration and account reset on a partially seeded catalog. Single-source the raise path (a `strict` flag set at the codes-dedup branch) instead of duplicating the validation call between the two routes.

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

**`select_for_update()` must execute inside `atomic()`:** All reads, validation, and writes using `select_for_update()` must be inside a single `atomic()` block. Without `ATOMIC_REQUESTS=True`, PostgreSQL raises `TransactionManagementError` in autocommit mode. Django's `TestCase` wraps each test in a transaction, masking this bug - it only surfaces in production.

```python
# Bad - select_for_update outside atomic (crashes in production, passes in tests):
workspace = Workspace.objects.select_for_update().get(id=workspace_id)
with db_transaction.atomic():
    ...

# Good - everything inside atomic:
with db_transaction.atomic():
    workspace = Workspace.objects.select_for_update().get(id=workspace_id)
    ...
```

**`select_for_update()` + `select_related()` caveat:** Cannot combine with `select_related()` on nullable FKs - PostgreSQL raises "FOR UPDATE cannot be applied to the nullable side of an outer join". Remove `select_related` from locked queries involving nullable FKs.

**Multi-row `select_for_update` - lock in id-order, re-check with `list()`:** When a mutation locks more than one row (e.g. merging two categories), acquire locks in ascending id order so concurrent transactions over the same pair can never deadlock - id-ascending is the house default lock order, and every transaction in the app acquires locks in the same order:

```python
locked = list(
    Category.objects.select_for_update()
    .filter(id__in=[target.id, source.id])
    .order_by('id')
)
if len(locked) != 2:
    raise CategoryNotFoundError()  # a concurrent tx deleted the source while we waited on the lock
```

The post-lock re-check uses `list(...)` + `len(locked) != N` - a concurrent transaction may have deleted a row while this one waited, and the count check surfaces that as a domain 404 rather than a 500. This is the multi-row analogue of the single-row `get()` + `DoesNotExist` form above.

**Aggregates silently strip `FOR UPDATE`:** Postgres forbids `FOR UPDATE` with aggregate functions, so `.count()`, `.exists()`, and `.aggregate()` on a `select_for_update()` queryset silently emit a plain `SELECT` with no lock - no error, no warning, and the race the lock was meant to close stays open (single-threaded tests still pass). Only row-returning evaluation (e.g. `list(qs)`) actually acquires locks. Never use an aggregate terminal to verify or count a `select_for_update` queryset.

**Unique-constraint races: savepoint, then re-read outside it.** When a create path can race on a unique constraint (e.g. idempotency-key dedup), wrap the racing insert - and the parent-row writes that must not be orphaned - in a *nested* `with db_transaction.atomic():` (SAVEPOINT), catch `IntegrityError`, and re-read the winner **after** the savepoint block:

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
        pass  # lost the race - savepoint rollback removed BOTH the key insert and the target
    return MyService._lookup(key, user, workspace_id).target  # re-read OUTSIDE the savepoint
```

- A bare `try/except IntegrityError` around the outer atomic block is **wrong**: Django marks the outer `atomic()` broken on any `IntegrityError`, even when caught - the follow-up re-read raises `TransactionManagementError` at runtime (single-threaded tests won't show it). The savepoint isolates the rollback so the outer transaction stays usable.
- TTL-style dedup records: expired rows still occupy the unique constraint and will raise on insert - sweep them (same filter set as the lookup) between lookup and insert. Never-reused keys are a periodic-cleanup concern, not a request-path one.
- Helpers that only ever run inside an existing atomic block (the savepoint, or the outer method's) stay undecorated - a redundant `@db_transaction.atomic` would open a pointless nested savepoint on every call.

**This flow is ONE shared helper, not an inline pattern to re-implement.** `common/idempotency.py` exports `create_with_idempotency(...)`, the parameterized lookup→sweep→savepoint→IntegrityError flow above (`lookup`/`do_create` callables + `record_model`/`target_model`/`target_field`), and `parse_idempotency_key(request) -> (key, error_dict)` - a tuple, not an exception, so the 400 response tuple stays in the API layer. Injecting the lookup as a callable (resolved at call time via `Service._lookup_idempotency_key`) preserves the `mock.patch.object(Service, '_lookup_idempotency_key', ...)` test seam. When another model needs the flow, **mirror the dedup table field-for-field as a plain model** (own migration, own constraint name; transient record - not `WorkspaceScopedModel`, no audit fields, excluded from export/import/delete per the `data-deletion-gdpr` skill) and delegate to the helper: reshaping an existing dedup table (GenericFK, second nullable FK, shared-app move) churns its constraint name, migration chain, and test contract. TTL/max-length live only in the module constants (`IDEMPOTENCY_TTL`, `IDEMPOTENCY_KEY_MAX_LENGTH`) - never re-hardcode `timedelta(hours=24)`; lookup window and sweep window must not be able to drift apart.

**Dedup lookups and unique constraints stay in lockstep.** For any unique-constraint-backed dedup, the lookup's filter set and the constraint's column set must widen or narrow **together**. Workspace-scoping the lookup while the constraint stays narrower turns a legitimate cross-scope collision into an unhandled `IntegrityError` (500) on the savepoint race path above - the constraint must widen in the same commit so the race-path insert succeeds per-scope. Keep the sweep's filter set identical to the lookup's.
