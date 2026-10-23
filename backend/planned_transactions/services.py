"""Business logic for the planned_transactions app."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.db import IntegrityError
from django.db import transaction as db_transaction
from django.db.models import Count, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounts.models import Account
from accounts.services import AccountService
from categories.models import Category
from common.enums import TotalsLabel
from common.idempotency import IDEMPOTENCY_TTL, create_with_idempotency
from core.schemas.pagination import DEFAULT_PAGE_SIZE, paginate_queryset
from currencies.models import Currency
from currencies.services import CurrencyCatalogService
from planned_transactions.exceptions import (
    PlannedTransactionAccountArchivedError,
    PlannedTransactionAlreadyExecutedError,
    PlannedTransactionCannotRevertError,
    PlannedTransactionCategoryNotFoundError,
    PlannedTransactionCurrencyMismatchError,
    PlannedTransactionCurrencyRequiredError,
    PlannedTransactionImportError,
    PlannedTransactionNotFoundError,
    RecurringTransactionAdoptAlreadyLinkedError,
    RecurringTransactionAdoptNotAllowedError,
    RecurringTransactionAdoptNotPendingError,
    RecurringTransactionEndDateError,
    RecurringTransactionMaterializeAllLimitError,
    RecurringTransactionMaterializeAllWithoutEndDateError,
    RecurringTransactionNotFoundError,
)
from planned_transactions.models import PlannedTransaction, PlannedTransactionIdempotencyKey, RecurringTransaction
from planned_transactions.schemas import PlannedTransactionCreate, PlannedTransactionImport, RecurringTransactionCreate
from planned_transactions.tasks import execute_planned_transaction
from transactions.models import Transaction

# Upper bound on how many remaining occurrences a materialize_all rule may
# have between its generation seed and end_date. _validate_materialize_all
# counts them and rejects the rule past this cap, so one generate run can
# never materialize an unbounded number of rows.
MAX_MATERIALIZE_OCCURRENCES = 500


class PlannedTransactionService:
    @staticmethod
    def _resolve_account(workspace_id: int, account_id: int | None) -> Account | None:
        """Resolve the explicitly-set account; None means an account-less plan.

        There is no single-active-account default: an omitted account_id IS
        the account-less request. An explicitly-set archived account still
        raises.
        """
        if account_id is None:
            return None
        account = AccountService.get(account_id, workspace_id)
        if account.is_archived:
            raise PlannedTransactionAccountArchivedError()
        return account

    @staticmethod
    def _resolve_currency(workspace_id: int, account: Account | None, currency_code: str | None) -> Currency:
        """Resolve the plan's own stored currency.

        With an account set, the plan books in the account's currency: derived
        from the account when currency_code is omitted, mismatch raises 400.
        The plain code comparison is exact - an account's currency is always
        enabled (accounts block currency disable), so no get_enabled lookup is
        needed on this branch. Without an account, currency_code is required
        and must be enabled for the workspace (404 otherwise).
        """
        if account is not None:
            if currency_code is not None and currency_code != account.currency.code:
                raise PlannedTransactionCurrencyMismatchError()
            return account.currency
        if currency_code is None:
            raise PlannedTransactionCurrencyRequiredError()
        return CurrencyCatalogService.get_enabled(workspace_id, currency_code)

    @staticmethod
    def _validate_category(category_id: int | None, workspace_id: int) -> None:
        """Raise if the category is missing, in another workspace, or archived."""
        if not category_id:
            return
        category = Category.objects.for_workspace(workspace_id).filter(id=category_id).first()
        if not category or category.is_archived:
            raise PlannedTransactionCategoryNotFoundError()

    @staticmethod
    def _build_filtered_queryset(
        workspace_id: int,
        status: str | None = None,
        account_id: list | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        currency_code: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
    ):
        """Build a filtered queryset for planned transactions."""
        queryset = PlannedTransaction.objects.for_workspace(workspace_id)
        if status:
            queryset = queryset.filter(status=status)
        if account_id:
            queryset = queryset.filter(account_id__in=account_id)
        if start_date:
            queryset = queryset.filter(planned_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(planned_date__lte=end_date)
        if category_id:
            queryset = queryset.filter(category_id__in=category_id)
        if budget_id:
            queryset = queryset.filter(category__budget_id__in=budget_id)
        if currency_code:
            queryset = queryset.filter(currency__code__in=currency_code)
        if search:
            queryset = queryset.filter(name__icontains=search)
        if amount_gte is not None:
            queryset = queryset.filter(amount__gte=amount_gte)
        if amount_lte is not None:
            queryset = queryset.filter(amount__lte=amount_lte)
        return queryset

    @staticmethod
    def _lookup_idempotency_key(user, workspace_id: int, key: str) -> PlannedTransactionIdempotencyKey | None:
        """Return the user's unexpired dedup record for `key` in this workspace, or None.

        Mirror of TransactionService._lookup_idempotency_key — "unexpired" = created
        within IDEMPOTENCY_TTL; a record whose planned FK was SET_NULL'd by a delete is
        returned as-is (create_with_idempotency decides what to do with it). Scoped to
        workspace so a replay under workspace B cannot return workspace A's planned row.
        """
        cutoff = timezone.now() - IDEMPOTENCY_TTL
        return (
            PlannedTransactionIdempotencyKey.objects.filter(
                key=key, user=user, workspace_id=workspace_id, created_at__gt=cutoff
            )
            .select_related('planned_transaction')
            .first()
        )

    @staticmethod
    def _do_create(user, workspace_id: int, data: PlannedTransactionCreate) -> PlannedTransaction:
        """Build and persist the planned transaction (no idempotency logic).

        Runs inside the caller's atomic block when a key is given
        (create_with_idempotency's SAVEPOINT); standalone otherwise. Do NOT
        add a method-level @db_transaction.atomic: create_with_idempotency
        calls do_create inside its own SAVEPOINT and requires no outer
        atomic here. The done branch records its row in its own SAVEPOINT
        and defers the Celery dispatch to on_commit, so the message
        publishes only when the OUTERMOST transaction commits
        (idempotency-key path included). A savepoint release is not a
        commit: a worker that beat the real commit would hit the task's
        not-found branch and skip permanently (that branch never retries).
        """
        account = PlannedTransactionService._resolve_account(workspace_id, data.account_id)
        currency = PlannedTransactionService._resolve_currency(workspace_id, account, data.currency_code)
        PlannedTransactionService._validate_category(data.category_id, workspace_id)

        if data.status == 'done':
            with db_transaction.atomic():
                planned = PlannedTransaction.objects.create(
                    workspace_id=workspace_id,
                    account=account,
                    currency=currency,
                    name=data.name,
                    amount=data.amount,
                    category_id=data.category_id,
                    planned_date=data.planned_date,
                    status='done',
                    payment_date=data.planned_date,
                    created_by=user,
                    updated_by=user,
                )
                db_transaction.on_commit(lambda: execute_planned_transaction.delay(planned.id))
            return planned

        return PlannedTransaction.objects.create(
            workspace_id=workspace_id,
            account=account,
            currency=currency,
            name=data.name,
            amount=data.amount,
            category_id=data.category_id,
            planned_date=data.planned_date,
            status=data.status,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    def get_planned(planned_id: int, workspace_id: int) -> PlannedTransaction:
        """Get a planned transaction and verify it belongs to the workspace."""
        planned = (
            PlannedTransaction.objects.select_related('account', 'category', 'currency')
            .for_workspace(workspace_id)
            .filter(id=planned_id)
            .first()
        )
        if not planned:
            raise PlannedTransactionNotFoundError()
        return planned

    @staticmethod
    def list(
        workspace_id: int,
        status: str | None = None,
        account_id: list | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        currency_code: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
        ordering: str | None = None,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> dict:
        queryset = PlannedTransactionService._build_filtered_queryset(
            workspace_id,
            status,
            account_id,
            start_date,
            end_date,
            category_id=category_id,
            budget_id=budget_id,
            currency_code=currency_code,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        )
        sort_order = ordering or 'planned_date'
        queryset = queryset.select_related('account', 'category', 'currency').order_by(sort_order, '-id')

        items, total, page, page_size, total_pages = paginate_queryset(queryset, page, page_size)
        return {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        }

    @staticmethod
    def totals(
        workspace_id: int,
        status: str | None = None,
        account_id: list | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: list | None = None,
        budget_id: list | None = None,
        currency_code: list | None = None,
        search: str | None = None,
        amount_gte: Decimal | None = None,
        amount_lte: Decimal | None = None,
        group_by: str = 'currency',
    ) -> list[dict]:
        """Return aggregated totals grouped by currency or category."""
        queryset = PlannedTransactionService._build_filtered_queryset(
            workspace_id,
            status,
            account_id,
            start_date,
            end_date,
            category_id=category_id,
            budget_id=budget_id,
            currency_code=currency_code,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
        )

        if group_by == 'category':
            rows = (
                queryset.annotate(
                    currency_code=F('currency__code'),
                    grouped_category_name=Coalesce('category__name', Value(str(TotalsLabel.UNCATEGORIZED))),
                )
                .values('grouped_category_name', 'currency_code')
                .annotate(total=Sum('amount'))
                .order_by('grouped_category_name', 'currency_code')
            )
            return [
                {'group': r['grouped_category_name'], 'currency': r['currency_code'], 'total': r['total']} for r in rows
            ]

        # Default: group by currency
        rows = (
            queryset.annotate(currency_code=F('currency__code'))
            .values('currency_code')
            .annotate(total=Sum('amount'))
            .order_by('currency_code')
        )
        return [{'group': r['currency_code'], 'currency': r['currency_code'], 'total': r['total']} for r in rows]

    @staticmethod
    def create(
        user,
        workspace_id: int,
        data: PlannedTransactionCreate,
        idempotency_key: str | None = None,
    ) -> PlannedTransaction:
        """Create a planned transaction on an account.

        If `idempotency_key` is provided, dedup within a 24h window per user per
        workspace: a replay with the same key returns the originally-created
        planned transaction instead of creating a second one (Stripe-style —
        same key, same result, regardless of payload). Mirrors
        TransactionService.create; the dedup flow itself is shared in
        common.idempotency.create_with_idempotency.
        """
        if not idempotency_key:
            return PlannedTransactionService._do_create(user, workspace_id, data)
        return create_with_idempotency(
            user=user,
            workspace_id=workspace_id,
            data=data,
            key=idempotency_key,
            lookup=PlannedTransactionService._lookup_idempotency_key,
            do_create=PlannedTransactionService._do_create,
            record_model=PlannedTransactionIdempotencyKey,
            target_model=PlannedTransaction,
            target_field='planned_transaction',
        )

    @staticmethod
    def create_from_recurring(rule: RecurringTransaction, occurrence: date) -> PlannedTransaction | None:
        """Materialize one occurrence of a recurring rule as a pending planned transaction.

        THE single creation path for generated rows (case file 2026-05-21: Celery
        tasks never create DB records directly) - the nightly beat task and the
        sync-generate on rule create both reach this method through
        RecurringTransactionService's materialization helpers.

        Copies name/amount/account/currency/category from the rule as stored. The
        archived-account and category validations deliberately do NOT re-run: the
        rule was validated at create time, and a rule whose account got archived
        later still generates - the row is a plan, execution validates.

        Returns None when a concurrent generator already created this occurrence
        (IntegrityError on the partial unique constraint (recurring,
        planned_date)): the caller still advances its last_generated_date pointer,
        which is what makes the race loss self-healing.
        """
        try:
            with db_transaction.atomic():  # SAVEPOINT - IntegrityError must not poison the caller's transaction
                return PlannedTransaction.objects.create(
                    workspace_id=rule.workspace_id,
                    account_id=rule.account_id,
                    currency_id=rule.currency_id,
                    name=rule.name,
                    amount=rule.amount,
                    category_id=rule.category_id,
                    planned_date=occurrence,
                    status='pending',
                    recurring=rule,
                    created_by=rule.created_by,
                    updated_by=rule.created_by,
                )
        except IntegrityError:
            return None

    @staticmethod
    def update(user, workspace_id: int, planned_id: int, data: PlannedTransactionCreate) -> PlannedTransaction:
        """Update a planned transaction.

        Editing a done planned re-applies name/amount/category/account to the
        transaction its execution created, so the two never desync; the
        transaction keeps its own date (the payment date).
        """
        planned = PlannedTransactionService.get_planned(planned_id, workspace_id)

        if planned.status == 'done' and data.status != 'done':
            raise PlannedTransactionCannotRevertError()

        account = PlannedTransactionService._resolve_account(workspace_id, data.account_id)
        currency = PlannedTransactionService._resolve_currency(workspace_id, account, data.currency_code)
        PlannedTransactionService._validate_category(data.category_id, workspace_id)

        planned.account = account
        planned.currency = currency
        planned.name = data.name
        planned.amount = data.amount
        planned.category_id = data.category_id
        planned.planned_date = data.planned_date
        planned.updated_by = user

        if data.status == 'done' and planned.status != 'done':
            planned.status = 'done'
            planned.payment_date = planned.planned_date
            with db_transaction.atomic():
                planned.save()
            execute_planned_transaction.delay(planned.id)
            planned.refresh_from_db()
            return planned

        planned.status = data.status
        with db_transaction.atomic():
            planned.save()
            if planned.transaction_id:
                mirror = Transaction.objects.filter(id=planned.transaction_id, workspace_id=workspace_id).first()
                if mirror:
                    mirror.description = planned.name
                    mirror.amount = planned.amount
                    mirror.category_id = planned.category_id
                    # The executed twin tracks the plan's account and stored
                    # currency in lockstep, including the account-less state.
                    mirror.account_id = planned.account_id
                    mirror.currency = planned.currency
                    mirror.updated_by = user
                    mirror.save()
        return planned

    @staticmethod
    def delete(workspace_id: int, planned_id: int) -> None:
        """Delete a planned transaction."""
        planned = PlannedTransactionService.get_planned(planned_id, workspace_id)
        planned.delete()

    @staticmethod
    def execute(user, workspace_id: int, planned_id: int, payment_date: date) -> PlannedTransaction:
        """Execute a planned transaction, creating an actual transaction on its account."""
        planned = PlannedTransactionService.get_planned(planned_id, workspace_id)

        if planned.status == 'done':
            raise PlannedTransactionAlreadyExecutedError()

        planned.status = 'done'
        planned.payment_date = payment_date
        planned.updated_by = user
        with db_transaction.atomic():
            planned.save()
        execute_planned_transaction.delay(planned.id)
        planned.refresh_from_db()
        return planned

    @staticmethod
    def export(
        workspace_id: int,
        status: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[dict]:
        """Return serialisable planned transaction data filtered by status and date range."""
        queryset = PlannedTransactionService._build_filtered_queryset(
            workspace_id, status=status, start_date=start_date, end_date=end_date
        ).select_related('account', 'category', 'currency')

        return [
            {
                'name': pt.name,
                'amount': str(pt.amount),
                'account_name': pt.account_name,
                'currency_code': pt.currency_code,
                'category_name': pt.category_name,
                'planned_date': pt.planned_date.isoformat(),
            }
            for pt in queryset.order_by('planned_date')
        ]

    @staticmethod
    def import_data(user, workspace_id: int, account_id: int, data: list, budget_id: int | None = None) -> int:
        """Bulk-create planned transactions into one explicit account.

        Categories are matched by name within budget_id when given, else left null.
        """
        account = PlannedTransactionService._resolve_account(workspace_id, account_id)

        category_map: dict[str, int] = {}
        if budget_id is not None:
            category_map = {
                name.lower(): pk
                for pk, name in Category.objects.for_workspace(workspace_id)
                .filter(budget_id=budget_id, is_archived=False)
                .values_list('id', 'name')
            }

        new_transactions = []
        for item in data:
            try:
                import_item = PlannedTransactionImport(**item)
            except Exception as e:
                raise PlannedTransactionImportError(f'Invalid data format: {e}')

            category_id = None
            if import_item.category_name:
                category_id = category_map.get(import_item.category_name.lower())

            new_transactions.append(
                PlannedTransaction(
                    workspace_id=workspace_id,
                    account=account,
                    currency=account.currency,
                    name=import_item.name,
                    amount=import_item.amount,
                    planned_date=import_item.planned_date,
                    category_id=category_id,
                    status='pending',
                    created_by=user,
                    updated_by=user,
                )
            )

        if not new_transactions:
            return 0

        PlannedTransaction.objects.bulk_create(new_transactions)
        return len(new_transactions)


class RecurringTransactionService:
    @staticmethod
    def _validate_end_date(start_date: date, end_date: date | None) -> None:
        """Raise when end_date precedes start_date.

        The model carries a CheckConstraint for the same rule; this guard
        turns the violation into a clean 400 instead of an IntegrityError
        (500). Applied identically on create and update.
        """
        if end_date is not None and end_date < start_date:
            raise RecurringTransactionEndDateError()

    @staticmethod
    def _get_adoptable_planned(workspace_id: int, planned_id: int) -> PlannedTransaction:
        """Fetch and lock a planned row eligible for adoption.

        Raises planned's own NotFoundError when the row does not exist in
        this workspace (identical semantics - reuse, not a duplicate
        class), AdoptNotPending when it is done/cancelled, and
        AdoptAlreadyLinked when another rule already owns it. Runs inside
        the caller's atomic block (select_for_update requires it); the
        get()-inside-try form is the sanctioned lock+query-in-one-call
        pattern.
        """
        try:
            planned = PlannedTransaction.objects.select_for_update().for_workspace(workspace_id).get(id=planned_id)
        except PlannedTransaction.DoesNotExist:
            raise PlannedTransactionNotFoundError()
        if planned.status != 'pending':
            raise RecurringTransactionAdoptNotPendingError()
        if planned.recurring_id is not None:
            raise RecurringTransactionAdoptAlreadyLinkedError()
        return planned

    @staticmethod
    def _validate_materialize_all(
        interval_kind: str,
        interval_count: int,
        start_date: date,
        end_date: date | None,
        materialize_all: bool,
        last_generated_date: date | None,
        created_at_date: date,
    ) -> None:
        """Raise when materialize_all is set without end_date or past the cap.

        materialize_all makes the generation loop skip the upfront-window
        BREAK entirely, so two guards run BEFORE any mutation on create and
        update alike (a rejected rule leaves zero rows/rules behind):
          - materialize_all requires end_date (else the loop would have no
            stopping condition other than the cap), and
          - at most MAX_MATERIALIZE_OCCURRENCES occurrences may remain from
            the generation seed to end_date.

        The occurrence-count walk seeds exactly like the generation loop
        (pointer + 1 day, else max(start_date, created_at)) and steps with
        the rule's NEW schedule on an unsaved probe instance -
        next_occurrence_on_or_after is pure date math, no DB access. The
        walk mirrors the loop's no-backfill skip (occurrences before
        created_at never generate, so they never count) and stops at
        MAX + 1 counted steps, so it terminates even for an end_date far
        in the future.
        """
        if not materialize_all:
            return
        if end_date is None:
            raise RecurringTransactionMaterializeAllWithoutEndDateError()
        probe = RecurringTransaction(
            interval_kind=interval_kind,
            interval_count=interval_count,
            start_date=start_date,
        )
        search_from = (
            last_generated_date + timedelta(days=1)
            if last_generated_date is not None
            else max(start_date, created_at_date)
        )
        count = 0
        while True:
            occurrence = probe.next_occurrence_on_or_after(search_from)
            if occurrence > end_date:
                return
            if occurrence >= created_at_date:  # mirror the loop's no-backfill skip
                count += 1
                if count > MAX_MATERIALIZE_OCCURRENCES:
                    raise RecurringTransactionMaterializeAllLimitError()
            search_from = occurrence + timedelta(days=1)

    @staticmethod
    def _generate_for_rule(rule: RecurringTransaction, today: date) -> int:
        """Run the materialization loop for ONE rule; return rows created.

        Opens its own atomic and re-fetches the rule with select_for_update so
        last_generated_date is read under the lock (double idempotency guard:
        generate_due's is_active scan is the fast path; this is the locked
        re-check). A rule deleted or paused between scan and lock returns 0.

        Materialization window rule - the loop maintains the invariant
        "upfront_count PENDING rows with planned_date > today per rule" (ALL
        remaining occurrences when materialize_all is set). Occurrence D
        generates iff ALL hold:
          - D > last_generated_date (candidates step strictly past the pointer;
            a defensive break if the stepper ever fails to advance),
          - D >= rule.created_at.date() (never backfill occurrences predating
            the rule itself; a violation SKIPS forward - it does NOT break,
            because the pointer only advances on generation and a fixed seed
            would deadlock rules created with a past start_date),
          - materialize_all OR D <= today OR future_pending < upfront_count
            (an occurrence at or before today always generates - catch-up:
            downtime must not lose rows - and a future one generates while
            the window has room; monotone within a run because future_pending
            only grows, so a full window BREAKS - later occurrences would
            only keep it full),
          - end_date is None OR D <= end_date (monotone in D, BREAKS).

        future_pending counts the rule's pending rows with planned_date >
        today, read under the lock (plain related-manager count - the rule row
        is what carries the lock), and increments for EVERY future occurrence
        the loop handles, generated or race-lost: the partial unique
        constraint only fires when another generator already created the
        occurrence, so the row exists either way and the window slot is
        consumed. Worked example (upfront_count=3, monthly rule created
        2026-10-23 starting Nov 2): creation materializes Nov 2, Dec 2,
        Jan 2 - three pending future rows; on Nov 2, the day the first row
        comes due, Feb 2 appears: always 3 pending future rows. The default
        N=1 reproduces "the next row appears on the previous occurrence's
        due date". materialize_all rules are capped at
        MAX_MATERIALIZE_OCCURRENCES remaining occurrences at create/update
        (see _validate_materialize_all), so the loop is bounded.

        The pointer advances on every generated OR race-lost occurrence, which
        is what makes repeated runs idempotent (run twice = same rows).
        """
        with db_transaction.atomic():
            locked = RecurringTransaction.objects.select_for_update().filter(id=rule.id).first()
            if locked is None or not locked.is_active:
                return 0

            created = 0
            # Window count under the lock: done/cancelled rows do not hold a
            # window slot, only pending ones strictly after today do.
            future_pending = locked.planned_transactions.filter(status='pending', planned_date__gt=today).count()
            search_from = (
                locked.last_generated_date + timedelta(days=1)
                if locked.last_generated_date is not None
                else max(locked.start_date, locked.created_at.date())
            )
            while True:
                occurrence = locked.next_occurrence_on_or_after(search_from)
                if locked.last_generated_date is not None and occurrence <= locked.last_generated_date:
                    break  # defensive: the stepper must advance past the pointer
                if locked.end_date is not None and occurrence > locked.end_date:
                    break  # rule is finished
                if occurrence < locked.created_at.date():
                    # Occurrence predates the rule: never generate, skip forward.
                    # Only reachable when the pointer predates created_at (adopt
                    # mechanic, GDPR import restore) - the never-generated seed
                    # already starts at max(start_date, created_at.date()).
                    search_from = occurrence + timedelta(days=1)
                    continue
                if occurrence > today and not locked.materialize_all and future_pending >= locked.upfront_count:
                    break  # window full - monotone BREAK (later occurrences only keep it full)
                if PlannedTransactionService.create_from_recurring(locked, occurrence) is not None:
                    created += 1
                if occurrence > today:
                    # Race loss consumes a slot too: the constraint fired
                    # because another generator created this occurrence, so
                    # the row exists either way.
                    future_pending += 1
                # Advance on generation AND on race loss (create_from_recurring
                # returned None): the constraint only fires when another
                # generator already created this occurrence, so it is handled.
                locked.last_generated_date = occurrence
                locked.save(update_fields=['last_generated_date', 'updated_at'])
                search_from = occurrence + timedelta(days=1)
            return created

    @staticmethod
    def list(workspace_id: int, include_inactive: bool = True) -> list[RecurringTransaction]:
        """List a workspace's recurring rules, paused ones included by default.

        Deliberate divergence from BudgetService.list (inactive only on
        request): a paused rule must stay visible so the UI can surface it
        with a paused chip and a resume action - hiding it by default
        would strand the rule. pending_planned_count is a queryset
        annotation (not a model field) powering the delete dialog's
        "also delete N pending planned transactions" label.
        """
        queryset = (
            RecurringTransaction.objects.for_workspace(workspace_id)
            .select_related('account', 'category', 'currency')
            .annotate(
                pending_planned_count=Count('planned_transactions', filter=Q(planned_transactions__status='pending'))
            )
            .order_by('name', 'id')
        )
        if not include_inactive:
            queryset = queryset.filter(is_active=True)
        return list(queryset)

    @staticmethod
    def get_recurring(rule_id: int, workspace_id: int) -> RecurringTransaction:
        """Get a recurring rule and verify it belongs to the workspace.

        Fetches through the same annotated queryset as list() so both
        endpoints serialize pending_planned_count identically.
        """
        rule = (
            RecurringTransaction.objects.select_related('account', 'category', 'currency')
            .annotate(
                pending_planned_count=Count('planned_transactions', filter=Q(planned_transactions__status='pending'))
            )
            .for_workspace(workspace_id)
            .filter(id=rule_id)
            .first()
        )
        if not rule:
            raise RecurringTransactionNotFoundError()
        return rule

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: RecurringTransactionCreate) -> RecurringTransaction:
        """Create a recurring rule.

        adopt_planned_id links an existing pending planned row as the
        rule's first occurrence ("make recurring" conversion): the row's
        recurring FK is set and the rule's last_generated_date pointer
        advances to the row's planned_date, so generation starts strictly
        after it and never materializes a duplicate. The adopt fetch runs
        BEFORE the rule create so the pointer rides the single INSERT (no
        second save). Sync-generation then materializes the first due
        occurrence(s) - the full upfront window for a future-starting rule -
        inline before the rule is returned.
        """
        account = PlannedTransactionService._resolve_account(workspace_id, data.account_id)
        currency = PlannedTransactionService._resolve_currency(workspace_id, account, data.currency_code)
        PlannedTransactionService._validate_category(data.category_id, workspace_id)
        RecurringTransactionService._validate_end_date(data.start_date, data.end_date)

        planned = None
        if data.adopt_planned_id is not None:
            planned = RecurringTransactionService._get_adoptable_planned(workspace_id, data.adopt_planned_id)

        # Before any INSERT. Needs the adopt pointer (it is the seed the
        # generator will start from), so it runs after the adopt fetch;
        # created_at is "now" - the INSERT stamps the same transaction's clock.
        RecurringTransactionService._validate_materialize_all(
            interval_kind=data.interval_kind,
            interval_count=data.interval_count,
            start_date=data.start_date,
            end_date=data.end_date,
            materialize_all=data.materialize_all,
            last_generated_date=planned.planned_date if planned is not None else None,
            created_at_date=timezone.now().date(),
        )

        rule = RecurringTransaction.objects.create(
            workspace_id=workspace_id,
            account=account,
            currency=currency,
            category_id=data.category_id,
            name=data.name,
            amount=data.amount,
            interval_kind=data.interval_kind,
            interval_count=data.interval_count,
            start_date=data.start_date,
            upfront_count=data.upfront_count,
            materialize_all=data.materialize_all,
            end_date=data.end_date,
            is_active=data.is_active,
            last_generated_date=planned.planned_date if planned is not None else None,
            created_by=user,
            updated_by=user,
        )

        if planned is not None:
            planned.recurring = rule
            planned.updated_by = user
            planned.save(update_fields=['recurring', 'updated_by', 'updated_at'])

        # Sync-generate (plan decision 8): materialize the first due
        # occurrence now instead of waiting for the nightly beat, so the row
        # is visible the moment the create response returns. Runs inline in
        # the SAME transaction (same DB connection): it reads the rule this
        # transaction wrote, and nothing here dispatches to Celery (generated
        # rows are pending, and pending rows never enqueue
        # execute_planned_transaction) - so no on_commit deferral applies.
        RecurringTransactionService._generate_for_rule(rule, timezone.now().date())
        return rule

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, rule_id: int, data: RecurringTransactionCreate) -> RecurringTransaction:
        """Full-replace update of a rule; is_active rides the payload.

        Pause/resume is a plain update (is_active in the PUT body), not a
        dedicated endpoint. Edits are future-only: already-materialized
        planned rows are never rewritten here, and the last_generated_date
        pointer is untouched so generation never re-emits past occurrences.
        adopt_planned_id is create-only and rejected here. After the save,
        the same sync-generate call create makes runs in this transaction:
        it tops up the materialization window (or the materialize-all gap)
        immediately - extend end_date, raise upfront_count, toggle
        materialize_all, or resume a paused rule and the new rows land now;
        a rule saved with is_active=false generates nothing (the locked
        re-check guard). The wire response still serializes the
        PRE-generation state (last_generated_date / pending_planned_count
        as of the save) - pinned by tests; no re-fetch is added.
        """
        rule = RecurringTransactionService.get_recurring(rule_id, workspace_id)
        if data.adopt_planned_id is not None:
            raise RecurringTransactionAdoptNotAllowedError()

        account = PlannedTransactionService._resolve_account(workspace_id, data.account_id)
        currency = PlannedTransactionService._resolve_currency(workspace_id, account, data.currency_code)
        PlannedTransactionService._validate_category(data.category_id, workspace_id)
        RecurringTransactionService._validate_end_date(data.start_date, data.end_date)
        # Before any mutation: the walk seeds from the rule's EXISTING pointer
        # and created_at (edits are future-only; the pointer never moves here)
        # but steps with the NEW schedule the payload carries.
        RecurringTransactionService._validate_materialize_all(
            interval_kind=data.interval_kind,
            interval_count=data.interval_count,
            start_date=data.start_date,
            end_date=data.end_date,
            materialize_all=data.materialize_all,
            last_generated_date=rule.last_generated_date,
            created_at_date=rule.created_at.date(),
        )

        rule.account = account
        rule.currency = currency
        rule.category_id = data.category_id
        rule.name = data.name
        rule.amount = data.amount
        rule.interval_kind = data.interval_kind
        rule.interval_count = data.interval_count
        rule.start_date = data.start_date
        rule.upfront_count = data.upfront_count
        rule.materialize_all = data.materialize_all
        rule.end_date = data.end_date
        rule.is_active = data.is_active
        rule.updated_by = user
        rule.save()

        # Sync-generate with the same call create makes. The generator
        # re-fetches its own locked instance, so `rule` here keeps the
        # pre-generation state the response serializes (wire fact, no fix).
        RecurringTransactionService._generate_for_rule(rule, timezone.now().date())
        return rule

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, rule_id: int, delete_pending: bool = False) -> None:
        """Delete a rule; with delete_pending, its pending materialized rows too.

        Done and cancelled rows always survive - they are history. All
        survivors keep existing once the rule is gone: the recurring FK's
        on_delete is SET_NULL (task 1), so they simply lose the link.
        """
        rule = RecurringTransactionService.get_recurring(rule_id, workspace_id)
        if delete_pending:
            rule.planned_transactions.filter(status='pending').delete()
        rule.delete()

    @staticmethod
    def generate_due(today: date | None = None) -> int:
        """Generate every due occurrence for every active rule in EVERY workspace.

        The one RecurringTransactionService method that deliberately crosses
        workspaces (no for_workspace): it runs from the daily Celery beat task -
        a system schedule, not a user request - so the is_active filter IS the
        scope. No API endpoint exposes it (Task 4 wires CRUD only).

        Each rule materializes in its own transaction (see _generate_for_rule),
        so a failure on one rule leaves earlier rules' rows and pointers
        committed; the task's autoretry re-runs the whole pass and every
        already-caught-up rule is a no-op thanks to the pointer plus the full
        upfront window. Safe to run any
        number of times, from beat, manually, or concurrently with itself (the
        partial unique constraint is the hard duplicate guard).

        Returns the number of planned transactions created.
        """
        if today is None:
            today = timezone.now().date()
        created = 0
        for rule in RecurringTransaction.objects.filter(is_active=True):
            created += RecurringTransactionService._generate_for_rule(rule, today)
        return created
