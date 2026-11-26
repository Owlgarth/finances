---
name: backend-testing
description: Backend test conventions for Owlgarth Finances (pytest, Factory Boy, AuthMixin, on_commit, Celery tasks, email), plus a reference file for specialized techniques: time control, token expiry, rate limits, translated errors, subprocess settings probes, race-loss branches, TransactionTestCase flush, constraints, query counts, data migrations, dry runs. Use when writing or modifying backend tests.
---

# Backend Testing Conventions

Core rules below. When a test needs time control, token expiry, rate limits, Accept-Language, import-time settings branches, race-loss branches, TransactionTestCase flush semantics, DB check constraints, query-count invariance, data-migration functions, or a dry run against real dev data, read `.agents/skills/backend-testing/references/specialized-tests.md`.

## Commands

```bash
cd backend
pytest                                    # Run all tests
pytest -v                                 # Verbose output
pytest transactions/tests.py              # Run specific app tests
pytest transactions/tests.py::TestClass::test_method  # Single test
pytest -k "test_create"                   # Run tests matching pattern
pytest --cov=. --cov-report=html          # With coverage
pytest --create-db -v                     # Fresh test DB (use when cross-branch migrations cause stale DB issues)
```
## Use Factories, Not Direct Creates or Service Calls

Use Factory Boy factories (e.g., `WorkspaceMemberFactory`) instead of direct `Model.objects.create()` calls. Factories exist in `<app>/factories.py` across the codebase.

Prefer factories over service calls for setup - service calls create extra side effects (enabled currencies, a Main account, a General budget, memberships) that make assertions unreliable:

```python
# Bad: service call creates a full workspace with demo fixtures
workspace = WorkspaceService.create_workspace(user=owner, name='Team')

# Good: factory creates only the records needed
workspace = WorkspaceFactory(name='Team')
owner = UserFactory(full_name='Owner', current_workspace=workspace)
WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
```

Only use service calls when the test specifically validates service-level behavior (e.g. `test_delete_workspace_*` calling `WorkspaceService.delete_workspace` directly).

**Factory gotcha:** Factories for financial records (`TransactionFactory`, `TransferFactory`, `PlannedTransactionFactory`) default to creating their own `Account` (and its workspace) and `User` via `SubFactory`. When tests need records tied to a specific workspace/account, pass these explicitly:

```python
account = AccountFactory(workspace=self.workspace, name='Main', opening_balance=Decimal('100.00'))
transaction = TransactionFactory(
    account=account, workspace=self.workspace, amount=Decimal('50.00'), type='expense',
)
```

A transaction's currency **is** its account's currency - there is no separate
`currency` FK. Categories belong to a `Budget` (via `CategoryFactory(budget=...)`),
not to a period.

**Round-trip and echo pins need non-default factory values** - a default-value round-trip proves nothing (defaults survive trivially): a GDPR export/import test sets `upfront_count=3` and pairs `materialize_all=True` with an `end_date` (the DB check constraint forbids the flag alone), so each field's survival is individually observable.

**Per-row RANDOM factory defaults break ordering assertions.** `TransactionFactory.date` defaults to `Faker('date_this_year')` (`backend/transactions/factories.py`) - random per row - so any test asserting newest-per-group ordering, or any date-order-dependent result, must pass explicit `date=` on EVERY created row; leaving dates to chance makes the assertion pass or fail per Faker seed.
## AuthMixin

```python
from common.tests.mixins import AuthMixin, APIClientMixin
from django.test import TestCase

class TestTransactions(AuthMixin, APIClientMixin, TestCase):
    user_role = 'member'  # default: 'owner'; also: 'admin', 'viewer'

    def test_create_transaction(self):
        data = self.post('/api/transactions', payload, **self.auth_headers())
        self.assertStatus(201)
```

`AuthMixin` creates a bare workspace (via `WorkspaceFactory`), a user, and a workspace membership - it does **not** enable currencies or create accounts/budgets (that keeps assertions clean). Enable a currency and create accounts/budgets explicitly in `setUp` when the test needs them (e.g. `CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')` then `AccountFactory(workspace=self.workspace)`). It also creates `auth_token` and provides `auth_headers()`. `self.user`, `self.workspace`, `self.auth_token` are available.

**Byte-streaming endpoints:** `APIClientMixin`'s `self.get` parses JSON only - success-path assertions on file bytes and headers (`response.content`, `response['Content-Disposition']`) use `self.client.get` directly, while error paths keep `self.get` + `assertStatus`. Exemplar: `TestAttachmentDownload` in `transactions/tests.py`.

**`self.delete` returns `None`:** unlike `post`/`get`, the `delete` helper never parses the response body - asserting an error body after a DELETE reads `self.response.json()['detail']` (the helper sets `self.response`), not a return value.

**Workspace ambiguity:** When tests create additional workspaces for the same user (e.g., via `import_all_data`), filtering by `owner=self.user` alone may return the AuthMixin workspace instead of the new one. Filter by both `owner` and `name`:

```python
workspace = Workspace.objects.filter(owner=self.user, name='Imported Workspace').first()
```

**GDPR round-trip tests rewrite the exported workspace name before import:** a real `export_all_data` payload carries the source workspace's name, and the importing user is a member of that workspace, so `import_all_data`'s default `conflict_strategy='rename'` silently renames the restored workspace to 'Test Workspace (imported ...)' - a lookup by the original name then returns the AuthMixin source workspace instead of the restored rows. Rewrite `payload['workspaces'][0]['workspace_name']` to a fresh name before importing (mirroring a fresh-instance import) so lookup-by-name stays deterministic. Exemplar: the planned-transactions GDPR round-trip test.

**Authenticating as a different user:** `AuthMixin` only mints a JWT for `self.user`. Cross-user tests (same idempotency key under another user, viewer-role probes) mint one directly with `create_access_token(other_user)` from `common.auth` and send it as an explicit `Authorization: Bearer …` header instead of `self.auth_headers()`.
## Test Auth Without AuthMixin

For tests that need an authenticated user without workspace setup:

```python
from common.auth import create_access_token
from common.tests.factories import UserFactory

user = UserFactory(email='test@example.com', full_name='Test')
user.set_password('testpass123')
user.save()

token = create_access_token(user)
headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
```

Avoid `User.objects.get()` queries in test setup - the factory already returns the user instance.
## Testing on_commit Callbacks

Django's `TestCase` wraps each test in a transaction, so `on_commit` callbacks never fire naturally inside a test. The default idiom is `captureOnCommitCallbacks`, which captures (and optionally runs) the registered callbacks without patching anything:

```python
with self.captureOnCommitCallbacks(execute=True) as callbacks:
    result = PlannedTransactionService.create(...)  # registers on_commit inside its atomic
self.assertEqual(len(callbacks), 1)  # asserted AFTER the block - see gotcha
```

**Django 6 gotcha:** the context manager snapshots `run_on_commit` on entry and populates the yielded list only at context EXIT - `len(callbacks)` read inside the `with` block is stale (usually 0); assert callback counts after the block, not inside it. Exemplar: `TestDoneCreateDispatchDeferredToCommit` in `planned_transactions/tests/test_planned_transactions.py`.

**Capture instead of patching when the code under test actually calls `on_commit`.** Patching remains only for the narrow case where the callback must run inline in the middle of a flow (e.g. the registration email at `core/services.py`, pinned by `test_email_verification.py`):

```python
from unittest.mock import patch
from django.db import transaction

def _immediate_on_commit(func, *args, **kwargs):
    func()

class TestMyFeature(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_sends_email(self, mock_on_commit):
        self.assertEqual(len(mail.outbox), 1)
```

Only patch `on_commit` for the specific tests that need it - never globally, and never on code that does not call `on_commit` at all: an inert patch passes trivially and proves nothing about the code under test (23 such patches were deleted in one audit-remediation sweep).

**Pin the production contract, not the eager-mode artifact.** With dispatch deferred to commit, the synchronous response reflects pre-worker state (e.g. `transaction_id: null`) - under `ALWAYS_EAGER` plus an immediate-on_commit patch, old tests "saw" the task's row, an artifact no production path produces. Assert the null; when the worker's effect matters, capture with `execute=True` and assert after the block. Dispatch placement itself is in the `celery-tasks` skill. The separate-instance variant (side effects that run on a re-fetched instance inside the same request, not a deferred task - the recurring generator re-fetches the rule under lock) pins the same way on EVERY mutation path: assert the response's PRE-side-effect value AND the advanced value in the DB via a fresh query, so a future "fix" that re-fetches before returning breaks tests loudly instead of silently changing the wire (the design rule is in the `django-backend` skill).
## Testing Celery Tasks

Test settings use `CELERY_TASK_ALWAYS_EAGER=True`, so `.delay()` executes synchronously - no worker needed. Call tasks directly (`execute_planned_transaction(planned_id)`) instead of via `.delay()` for clearer error messages. After dispatching a task in a test, call `instance.refresh_from_db()` to pick up changes the synchronous task made.

Use a three-class structure:

1. **Direct task invocation** - call the task function directly, assert side effects
2. **Service-level dispatch** - call the service method, verify the task executed (works because of `ALWAYS_EAGER`)
3. **Configuration validation** - assert task attributes match expected retry config

```python
class TestSendEmailTaskDirect(TestCase):
    def test_sends_email(self):
        send_email_task(['user@example.com'], 'Test', 'email/test', {})
        self.assertEqual(len(mail.outbox), 1)

class TestEmailServiceDispatch(TestCase):
    def test_dispatches_task(self):
        result = EmailService.send_email(['user@example.com'], 'Test', 'email/test', {})
        self.assertTrue(result)

class TestTaskConfig(TestCase):
    def test_retry_config(self):
        self.assertEqual(send_email_task.max_retries, 3)
        self.assertEqual(send_email_task.autoretry_for, (Exception,))
        self.assertTrue(send_email_task.retry_backoff)
```
## Deleting a Workspace in Tests

Direct `workspace.delete()` raises `ProtectedError` - accounts are PROTECT-referenced by transactions, transfers, and planned transactions. Do what production does (`UserService.delete_account`, `WorkspaceService.delete_workspace`): call `delete_workspace_financial_records(workspace_id)` first (deletion ordering is in the `data-deletion-gdpr` skill).
## New Optional Schema Field: Five-Test Shape

Cover a newly added optional schema field with one test class: (1) positive case with ordered values, (2) backward-compat - field omitted, (3) explicit empty collection, (4) `max_length` rejection - asserts 422 straight from Pydantic `ValidationError`, no DB hit, (5) the cross-cutting invariant the field could violate (e.g. items must not influence the authoritative `amount`/balance). This shape catches schema, service, and invariant regressions together. In the `max_length`-rejection test, every list item must satisfy the PER-ITEM constraint - items that fail their own pattern (digit-containing currency codes) still 422 but from the wrong constraint, so a cap regression to a huge value goes unnoticed. Generate per-item-valid items (`'ZZ' + chr(ord('A') + idx)`) so only the collection cap can fire.
## Behavior Changes Rewrite Their Tests

When a task deliberately changes a behavior, the tests pinning the OLD behavior are part of the change, not optional cleanup - rewrite them in the same task and grep the old test names to confirm none survive (the trusted-proxy change rewrote three tests that asserted first-hop XFF parsing). A test left asserting the old behavior either breaks CI later or gets "fixed" by reverting the behavior. Where the invariant survives the change, keep the old test's NAME (the rewrite then reads as a strengthening in the diff); rename only when the old contract is gone.

**The rewrite census greps the FIELD NAME across ALL apps' test files**, not just the owning app's tests - a payload-field rename (`currency_code` → `currency_codes` on register/account-reset) also lives in `currencies/tests.py`'s registration test, and Pydantic's `extra='ignore'` silently drops the stale key from the payload (no 422), so the failure surfaces only as a downstream order assertion, far from the change that caused it. Behavior changes rewrite their tests WHEREVER the tests pin them.

The same `extra='ignore'` tolerance makes clean-break sequencing forgiving across the stack: until the matching frontend task lands, the old key in the client's payload is silently dropped and defaults apply - no breakage window between the backend and frontend commits of a squash-merged PR.

**A deliberately dropped wire key is pinned with `assertNotIn` - extra tolerance makes silence the default failure mode.** Pydantic's `extra='ignore'` swallows a stale key in either direction with no 422, so nothing except an explicit `self.assertNotIn('lead_days', data)` catches a half-finished rename or a regression that resurrects the field. Send the replacement fields from every payload helper so the pin exercises the real call shape.

**Expected values derive from the landed code, never from the plan text.** Row counts come from the landed loop (a today-start recurring rule materializes the catch-up row plus one window row; a future-start rule with `upfront_count=1` exactly one row at `start_date`), and 400 assertions use the landed `default_code` literals byte-for-byte - probe `exceptions.py` first, a spec's guessed literals are always wrong. When a behavior change alters what every run produces, re-derive sibling test counts from the source instead of incrementing blindly; test comments enumerating each fixture's contribution are the cross-check.

**Plan-authored test snippets are unexecuted code - trace each against the pinned service behavior before landing it.** The same distrust that applies to expected values applies to the test body itself: spec test snippets have never run, so they can assert unreachable states and use invalid call shapes. Three flavors from one session: an assertion moving the already-last row "down" (a boundary no-op by pinned design - the swap it asserts can never happen; resetting the collision first also reaches the branch the original never exercised); a duplicate-keyword factory call (`Factory(budget=x, **{'budget': None})` is a `TypeError` before any DB access - merge overrides into ONE kwargs dict; dict-literal `**` merge is legal last-wins, duplicate call kwargs are not); and a cross-workspace test keeping a currency only enabled in the source workspace (the per-workspace enablement check correctly 404s it). Fix the test to exercise the pinned behavior - never bend the landed service to match a broken test. Plan service-code snippets are unexecuted code too - syntax-check them before landing (one spec snippet wrote `order_by=F('date').desc(), F('id').desc(),` - positional after keyword - and failed at import).
## URL-Pinning Tests Call the Exact Client URL

Tests that exercise an endpoint must call the exact URL the real frontend client sends - never a variant the router also happens to accept. The workspace-create 405 survived a green suite because every test posted to `/api/workspaces/` while the frontend called the slash-less `/api/workspaces`; the tests blessed a URL no real client used (the route-registration side of this rule is in the `django-backend` skill). When a route's path changes or is questioned, grep the literal URL string across ALL test files and docstrings, not just the spec'd call sites - fixture-setup calls in other apps' tests (a currencies test creating a workspace) and test-class docstrings hold slashed URLs too.
## Email in Tests

`EMAIL_BACKEND` is set to `django.core.mail.backends.locmem.EmailBackend` via `config/test_settings.py`. Use `mail.outbox` to inspect sent emails.

For flows that send email on success, give each failure-path test its own `assertEqual(len(mail.outbox), 0)` next to its status assertion - a future guard reorder that starts emailing before validation then fails that specific path's test, not a distant aggregate. Two counting details:
- A delivered email proves both templates rendered - eager Celery's `send_email_task` renders `.txt` and `.html` before sending, so `len(mail.outbox) == 1` plus a body assertion covers "template exists, context vars present" without a render-to-string test.
- `on_commit` emails never fire in `TestCase`, so on an early-return path the only outbox entry is the direct-send email - `len(mail.outbox) == 1` is exact without patching.
