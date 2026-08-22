"""Shared Stripe-style Idempotency-Key machinery for POST-create dedup.

Single source of truth for the dedup semantics used by
TransactionService.create and PlannedTransactionService.create:

- The dedup record maps (key, user, workspace) → created object, enforced by a
  unique constraint on those three columns (see TransactionIdempotencyKey /
  PlannedTransactionIdempotencyKey). The record is a transient key→object map,
  NOT user data; it never appears in GDPR export/import.
- A replay with the same key (per user, per workspace, within the TTL) returns
  the originally-created object instead of creating a second one — same key,
  same result, regardless of payload.
- Callers inject their own `lookup` staticmethod so tests can monkeypatch it
  (see the race-loss test pattern in the backend-testing skill).
"""

from collections.abc import Callable
from datetime import timedelta

from django.db import IntegrityError, models
from django.db import transaction as db_transaction
from django.http import HttpRequest
from django.utils import timezone

IDEMPOTENCY_KEY_MAX_LENGTH = 100
IDEMPOTENCY_TTL = timedelta(hours=24)


def parse_idempotency_key(request: HttpRequest) -> tuple[str | None, dict | None]:
    """Read + validate the `Idempotency-Key` request header.

    Returns `(key, None)` with a stripped, non-empty key (or `(None, None)`
    when the header is absent or blank) or `(None, error_dict)` when the key
    exceeds IDEMPOTENCY_KEY_MAX_LENGTH — the endpoint returns it as a 400.
    """
    key = request.headers.get('Idempotency-Key')
    if key is None:
        return None, None
    key = key.strip()
    if len(key) > IDEMPOTENCY_KEY_MAX_LENGTH:
        return None, {'detail': f'Idempotency-Key header must be at most {IDEMPOTENCY_KEY_MAX_LENGTH} characters.'}
    return (key or None), None


def create_with_idempotency(
    *,
    user,
    workspace_id: int,
    data,
    key: str,
    lookup: Callable,
    do_create: Callable,
    record_model: type[models.Model],
    target_model: type[models.Model],
    target_field: str,
) -> models.Model:
    """Create `data` under dedup key `key`, returning a replay's original on collision.

    `lookup(user, workspace_id, key)` must return the caller's unexpired dedup
    record or None; `do_create(user, workspace_id, data)` must persist and
    return the target object without its own outer atomic (it runs inside this
    helper's SAVEPOINT). `record_model` is the dedup table; `target_model` /
    `target_field` describe the created object ("transaction" /
    "planned_transaction") for replay re-fetch and FK wiring.

    Not decorated with @db_transaction.atomic: the inner `with atomic()` below
    is a SAVEPOINT when the caller already holds a transaction and a real
    transaction when it does not — both correct for the IntegrityError catch.
    """
    existing = lookup(user, workspace_id, key)
    if existing is not None:
        target_id = getattr(existing, f'{target_field}_id')
        if target_id is None:
            # Original object was deleted out from under the record.
            # Discard the stale entry and fall through to a fresh create.
            existing.delete()
        else:
            # Re-fetch fresh so ninja serializes the current row state
            # (e.g. if some other field was edited in the meantime).
            return target_model.objects.get(id=target_id, workspace_id=workspace_id)

    # Sweep expired records for this (key, user, workspace). The unique
    # constraint is unconditional, so a record older than the TTL would
    # otherwise block our fresh insert (and force us down the slower
    # IntegrityError path). The lookup above already treats these as
    # invisible; this just synchronises storage with the logical TTL.
    # Scoped to this workspace: an expired row in another workspace no
    # longer blocks this insert (the constraint is per-workspace), so
    # don't touch it. Concurrent races still fall through to the
    # IntegrityError handler below.
    cutoff = timezone.now() - IDEMPOTENCY_TTL
    record_model.objects.filter(key=key, user=user, workspace_id=workspace_id, created_at__lte=cutoff).delete()

    # Wrap the create + key-insert in a SAVEPOINT so a lost race rolls
    # BOTH back cleanly. Catching IntegrityError inside an outer
    # @db_transaction.atomic WITHOUT a savepoint would leave the
    # connection broken (Django's atomic marks the whole block for
    # rollback on any IntegrityError, even if caught). The savepoint
    # isolates the failure to just this nested block, leaving the
    # outer transaction usable for the re-read below.
    try:
        with db_transaction.atomic():  # SAVEPOINT
            target = do_create(user, workspace_id, data)
            record_model.objects.create(
                key=key,
                user=user,
                workspace_id=workspace_id,
                **{target_field: target},
            )
        return target
    except IntegrityError:
        # Lost the race. The savepoint rolled back BOTH the key row
        # AND the object we just created (no orphan). Re-read the
        # winner outside the savepoint and return their object.
        winner = lookup(user, workspace_id, key)
        if winner is not None and getattr(winner, f'{target_field}_id') is not None:
            return target_model.objects.get(id=getattr(winner, f'{target_field}_id'), workspace_id=workspace_id)
        raise  # unexpected: IntegrityError with no winner — let it propagate
