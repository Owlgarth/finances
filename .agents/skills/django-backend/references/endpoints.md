# Django Ninja Endpoints

Part of the `django-backend` skill. Read before adding or changing an endpoint: auth classes, route paths, response codes, sortable lists, page-size caps, byte-streaming downloads.

## Django Ninja Endpoints

Endpoints are thin wrappers - parse the request, call the service, return the response. Business logic belongs in service classes. Request-scoped validation that returns HTTP error responses (e.g. token uid/token checking in password reset) may stay in the API layer - only business logic moves to the service.

**API layer responsibilities:** parsing request data, token/uid validation that returns HTTP error responses, authentication/authorization checks, calling the service, returning the `Status(...)` response.

**Service layer responsibilities:** business logic (validation, DB operations, side effects, email notifications). If logic involves saving to the database or sending emails, it belongs in the service.

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
    return Status(201, TransactionService.create(user, workspace_id, data))
```

**Endpoint returns use `Status(code, payload)` - never the deprecated `return code, payload` tuple.** Django Ninja >= 1.7 fires `DeprecationWarning: Returning tuple (status_code, response) is deprecated` on ANY 2-tuple endpoint result, including one built inside a service and returned straight through, so a service whose contract returns `(status, payload)` (AuthService.login is the exemplar) is unwrapped at the endpoint boundary - never re-shaped in the service:

```python
status, payload = AuthService.login(data)
return Status(status, payload)
```

Ninja resolves `Status` and the old 2-tuple identically after the status split, so the wire contract is unchanged and service tuple contracts stay as written. `Status` joins the existing single `from ninja import ...` line in isort position (after `Router`). When a `Status(...)` call with a multiline dict payload exceeds the line limit, `ruff format` reflows it to split-args style (status and payload on their own lines) - that split form is the format-clean shape; keeping a compact inline dict that overflows the line fails `ruff format --check`.

For endpoints that don't require an active workspace (e.g., listing all workspaces), use `JWTAuth()`.

**Personal-resource endpoints drop the role gate entirely.** When a workspace-scoped resource belongs to the individual user rather than the workspace's shared data (bookmarks are the exemplar), `auth=WorkspaceJWTAuth()` plus the service's own user filter IS the authorization: no `require_role`, no `common.permissions` import. The natural copy-paste from role-gated siblings would lock viewers out of their own rows - the exact bug the pattern exists to prevent. A foreign row (another user's, or the same user's in another workspace) surfaces as 404 because the user-scoped query never finds it - never 403; no extra authorization branch exists to get wrong, and probing another user's ids leaks nothing (existence is indistinguishable from a nonexistent id). Word endpoint docstrings "no role gate" - the literal phrase `require_role` in prose trips role-matrix grep gates that count it.

### Route Paths Byte-Match the Client URL

Collection POSTs register at `''`, and every route path must agree byte-for-byte with the URL the frontend client calls in `client.ts` - Django Ninja registers `''` and `'/'` as two distinct paths and never folds a trailing slash. Failure mode of a mismatch: a collection POST registered at `'/'` while the client calls the slash-less path resolves into the GET-only collection route and answers **405** - not a 404 and no redirect, because `APPEND_SLASH` only fires for URLs that fail to resolve entirely (this exact split broke workspace-create for every real user while all five sibling routers were correct). Keep one canonical collection URL per router - never add a backcompat `'/'` twin, since Django has no REMOVE_SLASH redirect and the duplicate would be permanent convention noise.

**Flat routes register BEFORE parameterized `/{id}` routes - registration order is the only mechanism.** Django resolves URLs in registration order, and Django Ninja compiles `/{workspace_id}` to the str converter `[^/]+` - NOT int-only, despite a `workspace_id: int` annotation (int coercion happens inside the operation) - so a flat route registered after the parameterized block is unreachable: `GET /api/workspaces/member-settings` answered 405 with `Allow: DELETE` from the delete-workspace pattern, and the route existed nowhere. Verify behaviorally, not visually: an unauthenticated probe of the flat route must answer 401 from the endpoint's own auth, never 405 with a wrong `Allow` header. The `/current` + `/member-settings` block in `workspaces/api.py` sits before the parameterized zone with a comment pinning the ordering - the next flat route joins it there.

### Document All Possible Response Status Codes

Every endpoint's `response` parameter must list **all** status codes the endpoint can return, including those from raised exceptions:

```python
# Bad - 404 is possible but not documented
@router.post('/verify-2fa', response={200: Token, 401: DetailOut})

# Good - all status codes are documented
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

Pattern structure is `^(-?(field1|field2|fk__field))$` - optional `-` prefix for descending, then an alternation of allowed fields. Always anchor with `^` and `$`.

**Deterministic tiebreaker for paginated sortable lists:** Append a unique-field secondary sort after the primary `order_by()` to guarantee stable ordering across pages:

```python
sort_order = ordering or '-date'
queryset = queryset.order_by(sort_order, '-id')  # '-id' tiebreaker → stable pagination
```

Transactions use `-date, -id`; transfers and planned transactions use `-date, -id`. Either an id or created_at tiebreak is fine - the rule is "always append a unique-field secondary sort on paginated + user-sortable lists."

**Creation order can itself be the payload.** Ordering a list by `created_at, id` makes "first" meaningful with zero schema fields: the `id` tiebreak is load-bearing because Postgres `now()` is transaction-stable, so rows created in one atomic block share a timestamp and only `id` (insertion order) puts the intended-first row first. `CurrencyCatalogService.list_enabled` is the exemplar - the first enabled currency IS the workspace primary, and consumers derive `currencies[0]` with no `is_primary` field. The order is read-only by construction: the moment users need to reorder, it must become an explicit `position` column (the `BudgetCurrency` through-model is the in-repo precedent), never a reinterpretation of timestamps.

**List-filter values are not resource lookups: no pattern, no 422, no 404.** A `currency_code: list[str] | None = Query(None)` filter carries no `pattern=` - unknown or malformed values simply match nothing and return a 200 with an empty list, identical to filtering by an unknown `account_id`. The regex allowlist above is specifically for `ordering` values, because those reach `order_by()` and raise `FieldError` (500) on unknown fields; filter values only feed `__in` lookups. When a filter is ambiguous about WHICH field it targets, state the semantics in the endpoint docstring (the account-currency filter targets `account__currency__code__in`, never the informational `original_currency` facet).

**Aggregation siblings stay in filter parity with their list endpoint.** When a totals endpoint shares the list's `_build_filtered_queryset` helper, adding a filter to the list endpoint is pure param threading: the aggregation endpoint gains the same bare `Query(None)` param at the same position, and its service methods pass it into the shared helper - a totals strip that disagrees with the filtered list (group totals ignoring the active filter) is exactly the bug this prevents.

**"Row OR any child row" list filters stay SEPARATE `.filter()` calls - one per filter param, each an OR-group over its own joins ending in `.distinct()`.** Successive `.filter()` calls AND together, while merging every param's arms into a single `Q(...)` alternation would UNION the params (category-match OR budget-match instead of category-match AND budget-match). A NULL-inheriting child needs no explicit arm when the parent arm already covers it through the read-side Coalesce attribution - the `category_id`/`budget_id` OR-match on `_build_filtered_queryset` is the exemplar.

**After touching a `Query(..., pattern=...)` line, the gate is a route-importing pytest run, not ruff.** A corrupted regex in the raw string (a stray parenthesis) passes `ruff check` AND `ruff format`, and explodes only at Django Ninja route registration (Pydantic compiles the pattern at import), taking down every test that imports the router - a full traceback wall on the first run. Ruff alone is never sufficient verification for a `pattern=` edit.

### Pagination Param Caps (`page_size`)

Numeric bounds on list-endpoint query params are part of the endpoint contract, declared on the `Query(...)` itself so Django Ninja rejects out-of-range values with an automatic 422 - services keep receiving already-validated ints:

```python
from core.schemas.pagination import ALLOWED_PAGE_SIZES

MAX_PAGE_SIZE = max(ALLOWED_PAGE_SIZES)  # module level in each api.py

page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
```

- Pair `le=` with `ge=1` - the contract rejects 0/negative sizes too, not just huge ones.
- **Derive the cap from the source of truth** (`max(ALLOWED_PAGE_SIZES)`), never hardcode `le=100`. `paginate_queryset` silently coerces any size outside `ALLOWED_PAGE_SIZES` to its default; deriving `MAX_PAGE_SIZE` keeps the explicit 422 and the silent coercion in lockstep if the allowed set ever changes.
- **The cap must not fall below the frontend's maximum.** `ALLOWED_PAGE_SIZES` (backend) and `PAGE_SIZE_OPTIONS` (frontend `utils/pageSize.ts`) duplicate the same list with no cross-reference; the frontend persists the user's choice in localStorage and sends it as `page_size` on every list request. A backend cap below the frontend max 422s real users' stored preference on their main pages - a functional regression dressed as a security fix. Lowering the cap or shrinking the allowed set requires a coordinated frontend change (drop the option from `PAGE_SIZE_OPTIONS` + migrate stored prefs) in the same PR.
- Pin the contract with one boundary test per app: `page_size=1000` → 422, `page_size=0` → 422, and `page_size=<frontend max>` → 200 - the last assertion makes a future cap-lower fail loudly in tests instead of silently breaking the UI.
- Assertions that cross a page edge (distinct counts across two pages) must use an `ALLOWED_PAGE_SIZES` value: `paginate_queryset` silently coerces anything else to the default, so a `page_size=1` boundary assertion tests the coercion, not the boundary.
- **Stale `?page=N` clamps server-side in the shared helper, never 404s or endpoint caps.** `page = min(page, max(total_pages, 1))` after `total_pages` is computed in `core/schemas/pagination.py` - a client holding a stale bookmark (rows deleted, page_size grew) gets the last valid page WITH its items instead of an empty list whose meta lies (`page=3, total=20, total_pages=1` is indistinguishable from a genuinely empty list for the frontend, which gates pagination UI on `total`). An empty queryset reads as page 1 via the `max(..., 1)` floor. Do not add an `le=` bound or a 404 on `page` at the endpoint - that reintroduces the stale-bookmark failure the clamp exists to absorb; the endpoint keeps `page: int = Query(1, ge=1)` and the helper absorbs the rest.

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
