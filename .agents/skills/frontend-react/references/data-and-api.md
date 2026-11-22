# API Client, Queries and Money

Part of the `frontend-react` skill. Read before changing `api/client.ts`, TanStack queries or invalidation, widgets, downloads, error toasts, money math, or runtime config.

## API Client Pattern

```typescript
// Categories are nested under a budget (see budgetsApi in client.ts):
export const budgetsApi = {
  listCategories: (budgetId: number, includeArchived = false): Promise<Category[]> =>
    api.get<Category[]>(`/budgets/${budgetId}/categories`, { params: { include_archived: includeArchived } }).then(r => r.data),
  createCategory: (budgetId: number, data: { name: string }): Promise<Category> =>
    api.post<Category>(`/budgets/${budgetId}/categories`, data).then(r => r.data),
  // …update / archive / delete follow the same nested shape
}
```

**Export type aliases for repeated literal unions:** When a literal union (e.g., ordering options) is used in more than one place, export it as a `type` alias at the top of `client.ts` and import it at call sites - don't inline the same union in multiple files:

```typescript
// client.ts
export type TransactionOrdering =
  | '-date' | 'date' | '-description' | 'description'
  | '-amount' | 'amount' | '-type' | 'type'
  | '-category__name' | 'category__name'
  | '-account__name' | 'account__name' | '-account__currency__code' | 'account__currency__code';
```

**Per-request headers via an optional `opts` bag:** `create(data, opts?: { idempotencyKey?: string })` injects the header with a conditional spread on the axios config - `...(opts?.idempotencyKey ? { headers: { 'Idempotency-Key': opts.idempotencyKey } } : {})` - so call sites without the option are untouched. Never push per-request headers onto `api.defaults.headers`; that leaks across requests.

**One base-URL seam for out-of-band requests:** `getApiBaseUrl()` is exported from `api/client.ts` and the axios `baseURL` routes through it - any request that bypasses the axios instance (a keepalive `fetch` that must outlive the page, a worker) calls the helper instead of re-deriving the `getRuntimeApiUrl() || VITE_API_URL || localhost` chain, so the two can never drift.

**Write payloads declare a dedicated `XInput` interface, never `Partial<Entity>`** (`TransactionInput`, `BudgetInput` in `client.ts`): the interface lists exactly the fields the frontend actually sends, so adding a payload field is a documented decision. `Partial<Budget>` keeps silently accepting `id`/`workspace_id`/`created_at`, and the next payload field becomes an accident of the response type instead of a declared contract. Response and payload interfaces mirror the backend wire format (snake_case fields like `category_id`); camelCase lives only on editing-row shapes (`Row.categoryId`), and exactly one seam module (`utils/transactionItems.ts`) maps between the two.

**Additive backend enrichment fields are OPTIONAL on the wire type and read `!= null`.** A nullable field an older backend omits entirely is typed `x?: T | null` so absence is representable in the type itself, and every read treats `undefined` (key absent) and `null` (explicit empty) identically (`x != null`, `?? null` on derived values) - no version flag, no feature gate. The frontend tolerating absence by design is what lets the backend field land additively. Exemplar: the `last_*` fields on `FrequentDescriptionItem` in `types/index.ts`.

**Full-replace PUT contracts make EVERY update call site echo the derived fields.** When a backend update becomes full-replace (the whole resource is rewritten from the payload), every caller that updates in place - including best-effort follow-ups like a post-parse description update - must echo the fields the server now requires (`currency_code: p.currency_code`), or account-less rows 400 and a swallowing `catch {}` silently drops the side effect. When the payload contract gains a required-when-X field, grep the sibling `xxxApi.update` call sites across pages and modals - the sites that break are the ones that never looked like update flows (a cancel action, an extraction review). For an OPTIONAL field under a full-replace PUT this inverts the optional-fields rule: every create and update payload sends the key, with `null` as the cleared value (`note: note.trim() || null`) - direct field assignment server-side makes the schema default the stored value, so an omitted key silently wipes stored data; pin the contract in a doc comment on the `XInput` field so the next payload editor sees it. Close the sweep with a two-way grep: the API method's call sites PLUS the raw `api.put('/<endpoint>'...)` path - only the second grep proves no untyped bypass exists. Payload fields echoed from a stored object pass through verbatim (`note: transaction.note`); `trim() || null` normalization belongs only to fields sourced from user input. A one-field editor over such a PUT concentrates the rule in a save hook: `mutationFn` assembles the COMPLETE payload from the loaded row (verbatim echo of every stored field, the null-capable keys always sent even as null, the patch spread on top), making a one-field edit structurally unable to clear another field; editors normalize values before calling and the hook forwards patch values verbatim. Exemplar: `hooks/useTransactionFieldSave.ts`.

**A DELTA field on a full-replace list omits on `undefined` - the inverse of the always-send-null rule.** When the backend reads a field only when sent (`Optional[...] = None`, acting only `if ... is not None`, so an omitted key keeps the stored value), the client method takes `x?: T | null` and the body conditionally spreads the key only when defined: `undefined` is the omission signal, never null - the day a backend distinguishes null from omitted, an always-sent null silently flips from "leave unchanged" to "user cleared it". When the backend instead treats null and omitted IDENTICALLY (no clear path exists), a string field with a reset affordance uses `''` as the explicit reset value (honored and stripped server-side): send user-input-sourced values unconditionally trimmed, never `|| null` - against such a backend, `|| null` silently KEEPS the stored value instead of reverting to the default. The remainder controls on `replaceItems` are the exemplar.

**A list response that embeds a server-owned system row is filtered at EVERY mapping-to-payload site.** GET/PUT items responses include the remainder row (`is_remainder: true`); the write payload cannot express the flag and the backend schema ignores unknown keys, so an unfiltered echo is silently stored as a USER row, double-representing the derived amount with no 400 anywhere. Filter `!i.is_remainder` in every consumer (the items editor and the extraction review both do), read the system row via a find-helper, and write it only through the dedicated replace params.

**Internal per-request flags go through axios module augmentation, never `as any`:**

```typescript
// api/client.ts
declare module 'axios' {
  interface AxiosRequestConfig { _skipAuthRefresh?: boolean }
}
```

Augmenting `AxiosRequestConfig` also types `error.config` (`InternalAxiosRequestConfig` extends it), so producer and consumer sites stay fully typed with zero casts.

**Idempotency keys on create mutations:** `crypto.randomUUID()` per modal session - stable within one open, fresh across opens. A modal that seeds in a session render-adjust mints the key in the adjust's create branch (`null` in the edit branch); a permanently-mounted modal reset via `close()` → `reset()` uses a lazy `useState(() => crypto.randomUUID())` initializer and regenerates inside `reset()`.

**Backend-mirrored constants:** `PAGE_SIZE_OPTIONS` in `utils/pageSize.ts` duplicates the backend's `ALLOWED_PAGE_SIZES` - the user's choice is persisted to localStorage and sent as `page_size` on every list request, so the two lists must change together (the 422 trap is documented under Pagination Param Caps in the `django-backend` skill). Put an inline sync comment at the constant itself in the one-line `/** Synced with backend <file> <CONSTANT>. */` format (see `TotalsLabel`) - the coupling knowledge belongs where the next editor actually looks, not only in this skill. Mirrored reference DATA pulls from the backend's data module, never its seed command - `PRE_AUTH_CURRENCIES` in `utils/currencies.ts` mirrors `currencies/data.py`'s ISO 4217 rows byte-for-byte under a source-naming sync comment. Ordering type unions in `client.ts` are the same mirror for the backend's `ORDERING_PATTERN` allowlists - they widen in lockstep with the backend change that widens the pattern. The same discipline applies to format strings: `formatPeriodName` (`utils/format.ts`) mirrors the backend's period-naming format (dd MMM + en dash) and is persisted as period names, while the adjacent display-only `formatPeriodRange` ("Apr 1 - Apr 30", regular hyphen) is deliberately different - harmonizing the look-alikes would corrupt the mirror, and the separator difference is invisible in review surfaces. The docblock adjacency warning between them is the guard; do not remove it.

## Dashboard Widget Component Pattern

Filter-scoped widgets (e.g. account- or budget-scoped) follow this structure:

```tsx
interface Props {
  budgetId: number | null
}

export default function MyWidget({ budgetId }: Props) {
  const { t } = useTranslation('dashboard')
  const { data, isLoading } = useQuery({
    queryKey: ['my-data', budgetId],
    queryFn: async () => {
      if (!budgetId) return null
      return myApi.getData({ budget_id: budgetId })
    },
    enabled: !!budgetId,
  })

  if (!budgetId) return null
  const items = data?.items ?? []

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <h3 className="text-sm font-medium text-text mb-3">{t('myWidget.title')}</h3>
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 bg-surface-muted rounded-sm animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">{t('myWidget.empty')}</p>
      ) : (
        <div>{/* Render items */}</div>
      )}
      <Link to="/detail-page" className="inline-block mt-3 text-sm text-primary hover:text-primary-hover">
        {t('viewAll')}
      </Link>
    </div>
  )
}
```

**Key conventions:** early-return `null` when `budgetId` is null (no skeleton); `enabled: !!budgetId` on `useQuery`; three rendering states (loading skeleton / empty message / data); always a `<Link>` to the detail page; skeletons use `bg-surface-muted rounded-sm animate-pulse`; container uses `border border-border rounded-sm bg-surface p-4`.

**A row cap below the page-size floor requests the FLOOR and slices client-side.** Backend list endpoints silently coerce any non-allowlisted `page_size` to 25 (`ALLOWED_PAGE_SIZES = [10, 25, 50, 100, 200]`, `core/schemas/pagination.py`), so a widget pinning `page_size: 3` actually receives a full 25-row page and renders every row it gets - no error anywhere. A widget capping at N rows where N is below the floor requests `PAGE_SIZE_OPTIONS[0]` (the synced mirror) and `.slice(0, N)` at render; never send a sub-floor page_size expecting the server to cap. (Backend-side authoring of the caps: `django-backend`'s Pagination Param Caps.)

**Enabled-chained queries gate loading on data presence, not `isLoading`.** When a query's `enabled` chains on another query's data (currentPeriod → history → summary), a disabled query reports `isLoading: false` - a bare `isLoading` gate flashes the empty-state message during the waiting window. Gate skeletons on `!!id && !data`, with a comment at the gate explaining the disabled window. Same class of race for defaults: when a fast list query and an authoritative query compete to supply a default value, gate the list fallback on the authoritative query's `isSuccess`. For switch-flash: paginated list queries get `placeholderData: keepPreviousData` (with placeholder data, `isLoading` is true only on first load, so the existing skeleton branch needs no change); non-paginated queries that should keep showing current data across id changes use `placeholderData: (prev) => prev`.

**Enabled flags gate on data PRESENCE, not optional-field inequality.** `budget?.cadence !== 'custom'` is TRUE while `budget` is still undefined - the query fires a doomed GET on every visit; write `enabled: budget != null && budget.cadence !== 'custom'`. The same gate is a data-INTEGRITY guard for write affordances, not just a doomed-request saver: a batch-Save button rendered during a summary refetch race snapshots the placeholder values (`planned: '0'` for every row mid-race), all rows read changed, and an immediate Save ZEROES real amounts - render the affordance only while the data it snapshots is loaded (`!summaryLoading`), so it is absent exactly while the surface renders skeletons. Same race class for foreign-id arguments: a derived-membership gate (`const summaryPeriodId = allPeriods.some((p) => p.id === periodId) ? periodId : undefined`, feeding the queryKey) keeps a stale previous-entity id - the pre-reset render of budget-to-budget nav - and garbage `?period=` seeds off the server, killing the transient `budgetSummary(B, A_period)` 404. The gate is a derived const (zero set-state-in-effect cost) and must sit below the memo it reads (TDZ).

**Gate at the MOUNT when the hook has no `enabled` flag to thread.** A surface that renders workspace-less (the sidebar) consuming workspace-scoped hooks whose queries take no `enabled` param (`useBudgets`, the balances query) extracts the whole region into a child component rendered only under the workspace-truthy branch (`{workspace ? <SidebarNav /> : null}`) - a workspace-less mount can only ever produce rejected requests, so the GETs never fire without a workspace. This generalizes `useBookmarks(workspace != null)` from a single hook to a subtree; a side benefit is that the subtree's queries ride the same family keys as their first consumers (`['current-balances', false]`), so existing invalidation sites refresh them with zero new wiring. Exemplar: `SidebarNav` in `layout/Sidebar.tsx`.

**"Known/loaded" gates count terminal error as known.** A boolean gate derived from a query and feeding a default-selection or reconcile branch must arm on `isSuccess || isError`, not success alone: with `retry: false`, ONE terminal request failure (backend `--reload` mid-visit, network blip) leaves a success-only gate closed for the whole mount, killing every auto-pick branch behind it while healthy list data renders behind the placeholder (this exact shape stranded budget opening with no period selected, and every naive probe passed because the defect needs a failed request). Exemplar: `BudgetDetailPage`'s `currentPeriodKnown = budget?.cadence === 'custom' || currentPeriodLoaded || currentPeriodError`. Decide a gate's error arm deliberately: a "known" gate counts error as known (no answer is coming - proceed with what is there), while a fallback-deferral gate does not fire its fallback on error (it must not preempt the authoritative answer); when touching a query's error handling, check every gate consumer for which shape it is.

**Shared domain hooks:** Widgets read workspace data through the hooks in
`hooks/useDomain.ts` (`useAccounts`, `useBudgets`, `useEnabledCurrencies`,
`useMultiCurrency`, `useExtractionConfig` (returns `{ enabled, reachable }` - extraction UI
keys polling cadence on `reachable`), `useExtractionConfig`) rather than threading props.
Periods are per-budget, so period selection is local state on the Budget detail page - there
is no global period context.

## State Refresh After Mutations

After operations that change server-side state (email change, profile update), fetch the full updated object rather than patching local state partially:

```tsx
// Good: fetch full state from server
const updatedUser = await authApi.getCurrentUser()
updateUser(updatedUser)
```

**Workspace cache invalidation is removal-by-predicate with a keep-set - never an invalidation list.** Workspace-scoped query keys don't encode the workspace id (the API serves the *current* workspace), so on workspace switch/create/delete `WorkspaceContext` runs `queryClient.removeQueries({ predicate })` keeping only the user/deployment-scoped keys in its `userScopedQueryKeys` set. Drift asymmetry is the reasoning: a drop-list that forgets a new query ships stale cross-workspace data (that IS the bug); a keep-set that forgets a new user-scoped key costs one harmless extra refetch (the safe direction). New workspace-scoped queries need zero action; new USER-scoped query keys must be added to `userScopedQueryKeys`.

- Use `removeQueries` (query cache only), not `clear()`, inside `useMutation.onSuccess` - `clear()` also empties the mutation cache and can evict the in-flight mutation's own entry. `clear()` is reserved for auth identity changes (login/logout), where a full wipe is wanted.
- `refetch()` from `useQuery` bypasses the query's `enabled` flag - guard manual refetches on the same condition `enabled` uses whenever the queryFn dereferences possibly-null data, or it throws on null.
- react-query v5 has no query-level `onError` - query failure UX renders inline (`isError || !data` early-return), not via a toast. A manual `useEffect` + `useState` fetch should become a `useQuery` (caching, retries, dedup at zero extra code). The inline early-return is for data-carrying queries; an optional-enhancement query - one that enriches a form but does not gate it - degrades silently instead: render the defaults over `data === undefined`, no error UI, and fail fast without burning the app-wide retry budget (`retry: (failureCount) => failureCount < 1` preserves `retry: 1` for genuinely transient failures). This is the shape for pre-workspace queries against workspace-scoped auth (the currency catalog inside workspace creation 400s while no current workspace exists): an errored query is stale, so the next open refetches and the degrade self-heals once the precondition exists. Exemplar: `CreateWorkspaceForm`'s catalog query.
- **Key a derived query INSIDE the list-family prefix its mutations invalidate.** A derived query over the same rows a list shows (a totals strip, autocomplete suggestions, a fetched edit prefill) is keyed `['transactions', 'totals', ...]`, `['transactions', 'frequent-descriptions', type]`, `['transfers', 'detail', id]` - nested under the family prefix, never a sibling key like `['transaction-totals']`. The family's create/edit/delete mutations often live in other files and invalidate only the family prefix; TanStack prefix matching then refetches the derived query through those existing invalidation calls with zero out-of-scope edits, where a sibling key goes stale after every create/edit. The exception is cardinality-keyed ephemeral queries: a per-keystroke palette search (`['palette-transactions', q]`) mints a new cache entry per committed query string, so family nesting would replay one request per query string ever typed on every invalidation - keep those sibling/isolated. The partition question: does the UI re-read this data (nest under the family) or mint a new key per interaction (isolate)? Derived queries also MIRROR the list's filters: every list filter param threads into a derived query over the same rows in the same commit - the queryKey entry (e.g. `currencyFilter.join(',')`) AND the queryFn param, both mirroring the list query's expressions and ordering byte-identically. The key entry is the load-bearing half: without it, toggling the filter refetches the list but serves the strip from a stale cache entry, invisible to any backend test because both requests are individually valid. Exemplar: the planned-totals strip in `Planned.tsx`. An editable entity's DETAIL query additionally reuses the exact cache entry of an existing consumer rather than minting a sibling detail family - `useTransaction(id)` keys `['transactions', 'detail', id]`, the same entry `/new`'s copy query reads - so the family-wide invalidations refresh the record with zero new wiring and two observers of one entry stay consistent by construction. Differently-scoped entries over the same data get distinguishing key members: a date-scoped period query carries the transaction date in its key so it can never be served by (or pollute) the dateless page entry. Exemplar: `hooks/useDomain.ts`.

- **Await the refetch before clearing a selection that an effect re-derives.** When a null-picker effect re-selects from a list (`setPeriodId(periods[0].id)` whenever the selection is null), a delete mutation must `await` the list's `invalidateQueries` refetch BEFORE clearing the selected id - clearing against a stale cache lets the effect re-select the just-deleted id, and a ghost id whose lookup returns null renders a dead page. Exemplar: `BudgetDetailPage`'s `deletePeriod` awaits the `['periods', budgetId]` refetch before `setPeriodId(null)`; a fire-and-forget invalidation plus an immediate clear reintroduces the race. Invalidation ownership follows mutation ownership: the form modal's own `onSuccess` invalidates its add/edit (`PeriodFormModal`); a page-level delete mutation invalidates in the page.
- **Cross-tab staleness is a different bug class from invalidation.** Each browser tab keeps its own query cache, so a mutation's invalidation never reaches other tabs - and `refetchOnWindowFocus` defaults to stale-only while `api/queryClient.ts` sets a 5-minute `staleTime` app-wide, so focusing the observing tab refetches nothing until that expires; an entry deleted in another tab lingers in this tab's dropdown and selecting it 404s. Fix class: `refetchOnWindowFocus: 'always'` on the cheap list GETs that feed dropdowns - the `useDomain.ts` list hooks (`useAccounts`, `useBudgets`, `useEnabledCurrencies`, `useWorkspaceCategories`) and page-local lists such as `BudgetDetailPage`'s `['periods', budgetId]` query - leaving `staleTime` in force everywhere else for navigation snappiness. Probe by bug class: same-tab invalidation via SPA-link navigation (no reload), cross-tab staleness via two real tabs plus a focus event (`bringToFront()`); never `page.goto()` - a full load re-creates the query cache and masks both.

- **An optimistic reorder goes `onMutate` + `queryClient.setQueryData`, with a narrower invalidation than set-changing writes.** `onMutate` fires synchronously in the click tick, so swapping two rows in the cached array renders the move instantly with no local state and no effect - structurally lint-quiet. Capture the render-scoped previous array for `onError` rollback, and disable the move controls on `isPending` so a second move cannot interleave. Set-preserving mutations own a NARROWER invalidation internally: a reorder invalidates only `['enabled-currencies']`, never `['currency-catalog']` - the set and the catalog are unchanged, only the order moved; set-changing mutations (enable/disable/custom) keep the both-keys pattern. Exemplar: `CurrenciesSettingsSection`'s reorder.

## Blob Downloads and Object-URL Ownership

Files behind authenticated endpoints are fetched as blobs through the axios
client (`responseType: 'blob'`, e.g. `transactionsApi.downloadAttachment`) -
browsers cannot send the JWT header on navigations, so `<img src>`/`<a href>`
pointing at the API never works; `URL.createObjectURL` bridges blob -> URL. The
load-bearing contract is that exactly one site creates a URL per lifecycle, and
`URL.revokeObjectURL` ownership is explicit at each call site (exemplar:
`hooks/useAttachments.ts` + `utils/attachments.ts`):

- **The query cache mints and pins display URLs.** The blob query's `queryFn`
  returns `URL.createObjectURL(blob)` with BOTH `staleTime: Infinity` AND
  `gcTime: Infinity` - the bytes are immutable, and the default 5-min gc drops
  the cache entry, leaks its object URL, and mints a duplicate URL for the same
  bytes on remount.
- **A download-to-disk mutation creates and revokes its own short-lived URL**
  around the programmatic anchor click (`useAttachmentDownload`).
- **A reuse path NEVER revokes a cached URL.** The lightbox reuses the URL
  passed in from the tile's cached data - revoking it after close would poison
  the thumbnail that still references it. Shared download helpers stay
  deliberately revoke-free (`triggerBrowserDownload`); never "simplify" the two
  paths into one helper that always revokes.
- **Per-item blob queries live in a child component** (`AttachmentMedia`) -
  hooks cannot be called inside a list `.map()` callback; the parent's map keeps
  the stateless chrome (border, delete button, extraction overlay).
- **Delete mutations drop the deleted item's blob cache entry**
  (`queryClient.removeQueries({ queryKey: attachmentBlobKey(...) })`); the
  object URL itself is reclaimed at document unload, bounded by the
  per-transaction attachment caps. A new blob consumer reuses the same client
  call and key builders instead of minting a second query family for the same
  bytes.

## API Error Message Extraction

Every API-error toast or handler extracts its message with
`getApiErrorMessage(error, t('uploadFailed'))` from `utils/errors.ts` - it wraps
`axios.isAxiosError` and reads `response.data.detail`, returning the fallback when either
is missing. Ninja 422 details arrive as an array of field-error objects; the helper joins
their (server-translated) msg strings into one '; '-separated line and falls back when the
array yields nothing - call sites never hand-roll array handling:

```typescript
onError: (error) => toast.error(getApiErrorMessage(error, t('uploadFailed')))
```

Never hand-roll `(error as { response?: { data?: { detail?: string } } })` casts or
`error: any` at call sites - the helper is the single seam, and it keeps the error
parameter typed as `unknown`.

**Blob responses never have a parsed body.** On `responseType: 'blob'` requests the
error response body arrives as a Blob (axios never parses it as JSON), so
`getApiErrorMessage`'s `response.data.detail` read always finds nothing. Branch on
the HTTP status first (`axios.isAxiosError(error)` + `error.response?.status`, e.g.
404 -> "no longer available", 503 -> "storage unavailable"), then fall through to
the generic helper. Exemplar: `attachmentDownloadErrorMessage` in
`utils/attachments.ts`.

**A shared blob-export helper parses the error body for a `detail` and owns every toast.**
Blob bodies can still be READ: `await error.response.data.text()` then `JSON.parse` recovers
the Ninja `{ detail: string }` shape when present, falling back to status-aware messages -
the parsing sibling of the status-first branch above. The helper shape: `runBlobExport(fetchBlob, options)`
(`utils/blobExport.ts`) takes every user-facing string PRE-TRANSLATED from the caller (utils
own no translation keys, so callers keep their own namespaces and zero i18n edits ship),
owns the optional loading toast, the success toast, and the error toast, and NEVER throws -
callers keep only their `isExporting` state with plain set-before/set-after around the call,
no try/finally. It honors `triggerBrowserDownload`'s revoke-free contract by revoking the URL
it mints itself.

## Avoid Duplicate Toasts

Before adding error toasts in a catch block, check whether the called function already shows toasts (e.g., `AuthContext.login()` shows `toast.error()` and re-throws). If so, the catch only prevents unhandled rejection; an empty catch needs a comment for ESLint's `no-empty`:

```typescript
} catch {
  // Error already displayed by AuthContext
} finally {
  setIsSubmitting(false);
}
```

When a catch block exists only to swallow the error (no inspection), use the optional catch binding `catch { ... }` rather than `catch (e)`/`catch (_e)` - no unused binding, satisfies `@typescript-eslint/no-unused-vars` without underscore noise.

**No success toast when the visual change IS the feedback.** A mutation whose effect is immediately visible on screen (an optimistic reorder re-rendering the list) skips the success toast entirely - three rapid clicks must not stack toasts. Errors still get exactly one `toast.error(getApiErrorMessage(...))`; only the success channel is conditionally silent.

## Money Arithmetic (Exact Strings)

Backend Decimal amounts cross the API as strings; any arithmetic whose result is **persisted or sent back** must be exact string/BigInt math via the helpers in `utils/format.ts` (`subtractAmounts` - BigInt cents, 3rd-digit round-half-up, never returns `'-0.00'`). Never `parseFloat` a backend Decimal that will be persisted: a 17-digit Decimal through `parseFloat` loses the last cent, and the wrong delta gets recorded as a real adjustment transaction. Floats are for validation/display only. The exact arm also covers categorical CLAIMS, not only persisted values: an over/not-over boundary that decides chip text, link-side grouping, or sort position is a `subtractAmounts` sign check (exact cents), because a float compare can flip a row at exact equality by a fraction of a cent - a wrongly-labeled OVER chip is a false alarm, not a rounding artifact - while the percentage itself stays float math for display and pct-ordering.

**A total displayed beside a table is an exact BigInt sum over the rows that table renders - never an API summary total whose scope differs from the visible table.** The budget summary endpoint includes archived categories' money while the ledger table filters them out, so an API-sourced total disagrees with the very column it sits under and reads as a wrong sum; summing the rendered rows is the only total that matches what the user sees. This is the display-side arm of the exact-math rule above: a total that must match its visible column exactly is exact math too - 17-integer-digit Decimals lose their last cent through `parseFloat`, and a visibly-off total is the same failure as a wrong persisted delta. Exemplar: `BudgetDetailPage`'s `totalPlanned`/`totalActual`/`totalRemaining` consts (`sumAmounts(rows.map((r) => r.planned))` etc.) feeding the desktop `<tfoot>` row and the mobile totals card.

**Adding an exact-money helper: mirror the shared output idiom verbatim, and treat the docblock's worked examples as the review contract.** A new helper lives beside the others in `utils/format.ts` (`sumAmounts` beside `subtractAmounts`), reduces over module-private `toCents` with a `0n` seed, and reuses the shared output idiom (`.toString().padStart(3, '0')` + slice, never `'-0.00'`) - a second formatting path drifts. `toCents` stays module-private by design, so negativity of a formatted money string is the string-sign check `startsWith('-')` at the call site - sound only because the helpers never emit `'-0.00'`. The frontend has no test runner, so the docblock's worked examples ARE the helper's contract: execute them against the real module (a throwaway `node` import) before landing instead of trusting the author's arithmetic, and keep them in sync if the behavior ever changes.

Number-input values are arbitrary strings - `'1e5'`, `''`, `'.5'`, `'5.'` - so validate with a regex (`/^-?(\d+(\.\d*)?|\.\d+)$/`, which also rejects e-notation) before the BigInt math. BigInt itself accepts leading zeros; only the regex gate keeps scientific notation out.

**User-typed amounts normalize at the commit boundary, never per keystroke.** Money inputs are `type="text" inputMode="decimal"` and their state holds the raw draft string; `normalizeAmountInput` / `parseAmountNumber` (`utils/amountInput.ts`, style-aware via live `getNumberStyle()` reads) run only when the value is committed. A submit seam threads the normalized value as the `mutation.mutate(arg)` argument into `mutationFn` (no new state, no effects, lint-quiet); a filter input wraps its debounced commit inside the shared component (`onCommit(normalizeAmountInput(next) ?? next)`). Never reformat the field on keystroke or blur. `parseFloat` on user input is forbidden - it silently truncates at the decimal comma ('1,5' parses as 1); display-only seams use `parseAmountNumber` with a tolerance (`?? 0`, `?? 1`) and never toast-and-abort (a collapsed-card preview must not error mid-edit). Submit seams toast the shared `common`-ns `validation.amountInvalid` key only for unparseable NON-EMPTY input - the empty case belongs to the form's per-namespace required-key rules and keeps its existing payload behavior.

## Runtime Config and Build-Arg Env Values

Deploy-time values (API URL, demo mode) are runtime config, not build args: the ui container's entrypoint writes `/config.js` (`window.__APP_CONFIG__ = {"apiUrl":...,"demoMode":...}`) from its `API_URL`/`DEMO_MODE` env at startup, `index.html` loads it before the bundle, and every consumer reads it through the helpers in `src/runtimeConfig.ts` - never `window.__APP_CONFIG__` ad hoc. Precedence at each read: `window.__APP_CONFIG__` -> `import.meta.env.VITE_*` -> hard-coded default (`http://localhost:8000/api` / `false`). The Vite arm is dev-server only (the root `.env`'s `VITE_API_URL`/`VITE_DEMO_MODE` reach the Vite process env: `dev.sh` sources the file on the host, the `node` service takes it via `env_file`) - `/config.js` 404s on the Vite dev server, which is expected, and the chain falls through; the `vite-ignore` attribute on its `index.html` tag keeps the build from warning about an unbundleable classic script. Demo mode is case-insensitive end to end, matching the backend's `DEMO_MODE.lower() == 'true'`: the container hook normalizes the value to lowercase (so a shared `prod/.env` `DEMO_MODE=True` cannot crash-loop the ui while the backend accepts it) and the Vite arm lowercases before comparing. `VITE_APP_VERSION` is the one remaining baked build arg (release.yml passes exactly it): module-scope read with an inline `||` fallback (`import.meta.env.VITE_APP_VERSION || 'dev'`, `ProfilePage.tsx`) - local dev and dev compose builds pass no build args, and without the fallback a non-release build renders `undefined`.
