"""Stored receipts: a photo kept before any transaction exists.

Bytes live in the private media bucket under `receipts/<workspace_id>/<uuid hex><ext>`;
the row (ReceiptCapture) holds the metadata and the reading state. Every storage
interaction goes through the AttachmentService helpers, so this module never imports
StorageService and one patch of transactions.attachments.StorageService isolates both
services in tests.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction as db_transaction
from django.db.models import Count, F, Func, Q, TextField, Value, Window
from django.db.models.functions import Coalesce, Lower, RowNumber, Trim
from django.utils import timezone

from accounts.models import Account
from transactions import parser_client
from transactions.attachments import ALLOWED_CONTENT_TYPES, AttachmentService
from transactions.exceptions import (
    AttachmentFileMissingError,
    AttachmentStorageUnavailableError,
    ReceiptNotFoundError,
)
from transactions.models import ReceiptCapture, Transaction, TransactionAttachment, TransactionItem
from transactions.schemas import ReceiptConfirmIn, TransactionCreate
from transactions.services import EFFECTIVE_CATEGORY_ID, TransactionService

RESUME_INTERVAL_SECONDS = 15 * 60  # equals the beat interval of resume-waiting-receipts

# A trailing store number: 1 to 6 digits, optionally behind a standalone "#", "no" or "nr".
_STORE_NUMBER_SUFFIX = re.compile(r'(?<!\S)(?:#|no\.?|nr)\s*\d{1,6}$|\s+\d{1,6}$')


def normalize_merchant(merchant: str | None) -> str | None:
    """The key two receipts from one shop share: the merchant name, folded and trimmed.

    NFKC-normalized, case-folded, whitespace collapsed, a trailing store number dropped, at
    most 255 characters (the width of `ReceiptCapture.merchant_key`), None when nothing is left.
    """
    if not merchant:
        return None
    text = unicodedata.normalize('NFKC', merchant).casefold()
    text = _STORE_NUMBER_SUFFIX.sub('', ' '.join(text.split())).strip()
    return text[:255] or None


DUPLICATE_LIMIT = 3  # the newest transactions the duplicates list carries (D18)

# SQL twin of normalize_item_name(): lower-cased, every whitespace run collapsed
# to one space, then trimmed. Collapsing comes first on purpose: trim alone
# strips spaces only, so a leading or trailing tab or newline would survive it.
# One expression object serves both the filter and the window partition of the
# item lookup. PostgreSQL only; Django ships no RegexpReplace, hence the raw Func.
NORMALIZED_ITEM_NAME = Trim(
    Func(Lower('name'), Value(r'\s+'), Value(' '), Value('g'), function='regexp_replace', output_field=TextField())
)

# Whether an item row's effective category (its own, else its transaction's) is
# archived; None when the row has no effective category.
EFFECTIVE_CATEGORY_ARCHIVED = Coalesce(F('category__is_archived'), F('transaction__category__is_archived'))


def normalize_item_name(value: str | None) -> str:
    """Key that pairs a receipt line item with stored ones: case and whitespace do not matter.

    Lower-case, collapse every whitespace run to one space, trim: '  Mleko\tUHT\n '
    and 'mleko uht' are the same item. A blank or missing name gives '' so it
    never matches a stored row (remainder rows are stored with name '').
    NORMALIZED_ITEM_NAME computes the same key in SQL for the stored side, in
    the same order: collapse first, then trim.
    """
    return ' '.join(value.split()).lower() if isinstance(value, str) else ''


class ReceiptService:
    @staticmethod
    def _build_key(workspace_id: int, content_type: str) -> str:
        ext = ALLOWED_CONTENT_TYPES[content_type]
        return f'receipts/{workspace_id}/{uuid.uuid4().hex}{ext}'

    @staticmethod
    def _dispatch_read(receipt_id: int) -> None:
        # Imported in the body: tasks.py imports this module, so a module-level import would be circular.
        from transactions.tasks import read_receipt

        # on_commit: a worker must not start a read before the row it fetches is committed.
        # Outside an atomic block (the beat job) the callback runs at once.
        db_transaction.on_commit(lambda: read_receipt.delay(receipt_id))

    @staticmethod
    def _inflight_stuck_before():
        """Before this instant, a `queued` or `reading` row is a read nobody is running.

        A worker crash or a lost queue message leaves a receipt in flight for good. The
        threshold outlasts any legitimate wait: a full resume batch read one after the
        other, plus one beat interval. Settings are read here, at call time.
        """
        return timezone.now() - timedelta(
            seconds=settings.RECEIPT_RESUME_BATCH_SIZE * settings.PARSER_TIMEOUT_SECONDS + RESUME_INTERVAL_SECONDS
        )

    @staticmethod
    def _holds_result(receipt: ReceiptCapture) -> bool:
        """True for a ready receipt whose result is the parser document.

        Ready is also the state in which `serialize` puts `result` on the wire,
        so nothing is computed from a result the client cannot see: not for a
        saved row, and not for one queued again by a retry (the column keeps the
        old result until the new read lands).
        """
        return receipt.state == ReceiptCapture.READY and isinstance(receipt.result, dict) and bool(receipt.result)

    @staticmethod
    def _parse_decimal(value) -> Decimal | None:
        """A parser money string as a Decimal; anything missing or malformed is None."""
        if value is None:
            return None
        try:
            amount = Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return None
        return amount if amount.is_finite() else None

    @staticmethod
    def _parse_date(value) -> date | None:
        """A parser ISO date string as a date; anything else is None.

        The two range-end dates go too: they have no one-day window on both sides.
        """
        if not isinstance(value, str):
            return None
        try:
            day = date.fromisoformat(value)
        except ValueError:
            return None
        return None if day in (date.min, date.max) else day

    @staticmethod
    def _result_currency(result: dict) -> str | None:
        """The result's currency code as read (the contract sends uppercase), or None when it is missing."""
        code = result.get('currency')
        return code if isinstance(code, str) and code else None

    @staticmethod
    def _merchant_history(workspace_id: int, merchant_key: str | None) -> tuple[str | None, int | None]:
        """(description, category id) of the latest save with this merchant key.

        Latest = max updated_at, tiebreak max id (decision A13). A transaction
        without a category, or with an archived one, gives None for the id.
        """
        if not merchant_key:
            return None, None
        latest = (
            ReceiptCapture.objects.for_workspace(workspace_id)
            .filter(state=ReceiptCapture.SAVED, merchant_key=merchant_key)
            .select_related('transaction__category')
            .order_by('-updated_at', '-id')
            .first()
        )
        if latest is None or latest.transaction is None:
            return None, None
        category = latest.transaction.category
        keep = category is not None and not category.is_archived
        return latest.transaction.description, category.id if keep else None

    @staticmethod
    def _suggest_account(workspace_id: int, code: str | None) -> int | None:
        """The active account flagged default for the currency code, else the only active one (D109).

        One query serves both rules: the flagged row sorts first, so it is the
        answer when it exists; without one, a single active account is.
        """
        if code is None:
            return None
        accounts = list(
            Account.objects.for_workspace(workspace_id)
            .filter(currency__code=code, is_archived=False)
            .order_by('-is_default_for_currency', 'id')
            .values_list('id', 'is_default_for_currency')
        )
        if not accounts:
            return None
        account_id, is_default = accounts[0]
        return account_id if is_default or len(accounts) == 1 else None

    @staticmethod
    def _item_category_ids(workspace_id: int, result: dict) -> list[int | None]:
        """Per receipt line item, the category of the newest stored item with the same normalized name.

        One window-function query however many items there are (the shape of
        TransactionService._last_transactions_by_group): row_number() per
        normalized name, newest first, rn == 1 rows kept in Python because
        Django disallows filtering on a window. None for an item nothing
        matches, and when the match's effective category is archived.
        """
        items = result.get('items')
        if not isinstance(items, list):
            items = []
        names = [normalize_item_name(item.get('name') if isinstance(item, dict) else None) for item in items]
        lookup = {name for name in names if name}
        by_name: dict[str, int | None] = {}
        if lookup:
            rows = (
                TransactionItem.objects.filter(transaction__workspace_id=workspace_id)
                .annotate(
                    normalized_name=NORMALIZED_ITEM_NAME,
                    effective_category_id=EFFECTIVE_CATEGORY_ID,
                    effective_category_archived=EFFECTIVE_CATEGORY_ARCHIVED,
                    rn=Window(
                        expression=RowNumber(),
                        partition_by=[NORMALIZED_ITEM_NAME],
                        order_by=[F('transaction__date').desc(), F('transaction_id').desc(), F('id').desc()],
                    ),
                )
                # order_by() clears TransactionItem.Meta.ordering ('position', 'id').
                .filter(normalized_name__in=lookup)
                .order_by()
                .values('normalized_name', 'effective_category_id', 'effective_category_archived', 'rn')
            )
            for row in rows:
                if row['rn'] == 1:
                    keep = row['effective_category_id'] is not None and not row['effective_category_archived']
                    by_name[row['normalized_name']] = row['effective_category_id'] if keep else None
        return [by_name.get(name) if name else None for name in names]

    @staticmethod
    def _duplicate_key(receipt: ReceiptCapture) -> tuple[Decimal, str, date] | None:
        """What a duplicate must match: (total, currency code, purchase date).

        None when the receipt has no usable result.
        """
        if not ReceiptService._holds_result(receipt):
            return None
        total = ReceiptService._parse_decimal(receipt.result.get('total'))
        code = ReceiptService._result_currency(receipt.result)
        day = ReceiptService._parse_date(receipt.result.get('date'))
        if total is None or code is None or day is None:
            return None
        return total, code, day

    @staticmethod
    def _duplicate_condition(key: tuple[Decimal, str, date]) -> Q:
        """D18 as a filter: same currency code, same absolute amount, dated within one day on both sides."""
        total, code, day = key
        return Q(
            currency__code=code,
            amount__in=[total, -total],
            date__gte=day - timedelta(days=1),
            date__lte=day + timedelta(days=1),
        )

    @staticmethod
    @db_transaction.atomic
    def create_from_upload(user, workspace_id: int, file) -> ReceiptCapture:
        """Store the uploaded photo and record it; nothing is read yet.

        The photo is saved whether or not the parser is configured, so hand
        entry stays possible. A failing row write removes the object it
        would have referenced before the error propagates.
        """
        content_type = AttachmentService.validate_content_type(file)
        key = ReceiptService._build_key(workspace_id, content_type)
        stored_key = AttachmentService.store_file(key, file.read(), content_type)
        try:
            receipt = ReceiptCapture.objects.create(
                workspace_id=workspace_id,
                created_by=user,
                updated_by=user,
                file_key=stored_key,
                filename=(file.name or 'receipt')[:255],
                content_type=content_type,
                size=file.size,
                state=ReceiptCapture.QUEUED if parser_client.is_enabled() else ReceiptCapture.WAITING,
            )
        except Exception:
            # The row never landed, so nothing references the object any more.
            AttachmentService.delete_storage_objects([stored_key])
            raise
        if receipt.state == ReceiptCapture.QUEUED:
            ReceiptService._dispatch_read(receipt.id)
        return receipt

    @staticmethod
    def get(receipt_id: int, workspace_id: int) -> ReceiptCapture:
        """The receipt of this workspace; a foreign id reads as missing (ReceiptNotFoundError)."""
        receipt = ReceiptCapture.objects.for_workspace(workspace_id).filter(id=receipt_id).first()
        if not receipt:
            raise ReceiptNotFoundError()
        return receipt

    @staticmethod
    def list_open(workspace_id: int):
        """Every receipt of the workspace that has not become a transaction, newest first."""
        return (
            ReceiptCapture.objects.for_workspace(workspace_id)
            .exclude(state=ReceiptCapture.SAVED)
            .select_related('created_by')
        )

    @staticmethod
    def serialize(receipt: ReceiptCapture) -> dict:
        """The `ReceiptOut` wire shape, in field order.

        `result` travels only for a ready receipt: the column keeps its value
        after a retry from ready and after a save, and the client renders by state.
        """
        uploader = receipt.created_by
        return {
            'id': receipt.id,
            'state': receipt.state,
            'error': receipt.error,
            'filename': receipt.filename,
            'content_type': receipt.content_type,
            'size': receipt.size,
            'uploader_name': (uploader.full_name or uploader.email) if uploader else None,
            'transaction_id': receipt.transaction_id,
            'possible_duplicate': False,  # the list and detail overwrite it
            'created_at': receipt.created_at,
            'updated_at': receipt.updated_at,
            'result': receipt.result if receipt.state == ReceiptCapture.READY else None,
        }

    @staticmethod
    def counts(workspace_id: int) -> dict:
        """Per-state counts of the workspace's open receipts: one query, every open state present."""
        # .order_by() clears Meta.ordering: left in, its columns join the GROUP BY and
        # every receipt becomes its own group (a count of 1 per receipt, never per state).
        by_state = dict(
            ReceiptCapture.objects.for_workspace(workspace_id)
            .exclude(state=ReceiptCapture.SAVED)
            .values_list('state')
            .annotate(total=Count('id'))
            .order_by()
        )
        return {state: by_state.get(state, 0) for state in ReceiptCapture.OPEN_STATES}

    @staticmethod
    def download(workspace_id: int, receipt_id: int) -> tuple[ReceiptCapture, bytes]:
        """A receipt's row and stored bytes for API download.

        Raises ReceiptNotFoundError when the id is missing or foreign,
        AttachmentStorageUnavailableError when storage is off, and
        AttachmentFileMissingError when the row owns no file any more (a saved
        receipt handed it to its transaction's attachment) or the object is gone.
        """
        receipt = ReceiptService.get(receipt_id, workspace_id)
        if not AttachmentService.storage_enabled():
            raise AttachmentStorageUnavailableError()
        content = ReceiptService.read_bytes(receipt)
        if content is None:
            raise AttachmentFileMissingError()
        return receipt, content

    @staticmethod
    def read_bytes(receipt: ReceiptCapture) -> bytes | None:
        """The stored photo; None once the file was handed over or the object is unreachable."""
        if not receipt.file_key:
            return None
        return AttachmentService.fetch_file(receipt.file_key)

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, receipt_id: int) -> None:
        """Delete the row and, only while it still owned one, its storage object."""
        receipt = ReceiptService.get(receipt_id, workspace_id)
        file_key = receipt.file_key
        receipt.delete()
        if file_key:
            AttachmentService.delete_storage_objects([file_key])

    @staticmethod
    def delete_storage_for_workspace(workspace_id: int) -> None:
        """Remove the stored objects of every receipt in the workspace that still owns one.

        Call BEFORE deleting the rows: the FK cascade removes them, and S3
        objects would otherwise be orphaned. Handed-over receipts (file_key
        is '') are skipped because their object belongs to an attachment.
        """
        keys = list(
            ReceiptCapture.objects.for_workspace(workspace_id).exclude(file_key='').values_list('file_key', flat=True)
        )
        AttachmentService.delete_storage_objects(keys)

    @staticmethod
    @db_transaction.atomic
    def begin_reading(receipt_id: int) -> ReceiptCapture | None:
        """Claim a receipt for one read. None when the row is gone, `ready` or `saved`.

        The lock covers this short section only. The parser answers after it, with no lock held.
        """
        try:
            receipt = ReceiptCapture.objects.select_for_update().get(id=receipt_id)
        except ReceiptCapture.DoesNotExist:
            return None
        if receipt.state in (ReceiptCapture.READY, ReceiptCapture.SAVED):
            return None
        receipt.state = ReceiptCapture.READING
        receipt.save(update_fields=['state', 'updated_at'])
        return receipt

    @staticmethod
    def mark_waiting(receipt: ReceiptCapture) -> None:
        """Park a receipt for the scanner. It stays open, so hand entry still works.

        A compare-and-set out of `reading`, the state `begin_reading` left: a read that ends
        after the receipt was saved, retried or deleted changes nothing.
        """
        ReceiptCapture.objects.filter(id=receipt.id, state=ReceiptCapture.READING).update(
            state=ReceiptCapture.WAITING, error='', updated_at=timezone.now()
        )

    @staticmethod
    def mark_failed(receipt: ReceiptCapture, message: str) -> None:
        """Record a read the same bytes could never pass. The receipt stays open and retryable."""
        ReceiptCapture.objects.filter(id=receipt.id, state=ReceiptCapture.READING).update(
            state=ReceiptCapture.FAILED, error=message, updated_at=timezone.now()
        )

    @staticmethod
    @db_transaction.atomic
    def store_result(receipt_id: int, result: dict) -> bool:
        """Keep a read's result. False when the receipt moved on and nothing was written."""
        try:
            receipt = ReceiptCapture.objects.select_for_update().get(id=receipt_id)
        except ReceiptCapture.DoesNotExist:
            return False
        if receipt.state == ReceiptCapture.SAVED or not receipt.file_key:
            return False
        receipt.result = result
        receipt.merchant_key = normalize_merchant(result.get('merchant'))
        receipt.error = ''
        receipt.state = ReceiptCapture.READY
        receipt.save(update_fields=['result', 'merchant_key', 'error', 'state', 'updated_at'])
        return True

    @staticmethod
    @db_transaction.atomic
    def retry(user, workspace_id: int, receipt_id: int) -> ReceiptCapture:
        """Queue a fresh read. Works from every open state; a `saved` receipt is returned as it is.

        A saved receipt no longer owns a file, so nothing is read and nothing is dispatched.
        Without a configured parser the receipt waits instead of queueing.
        """
        try:
            receipt = ReceiptCapture.objects.select_for_update().for_workspace(workspace_id).get(id=receipt_id)
        except ReceiptCapture.DoesNotExist:
            raise ReceiptNotFoundError()
        if receipt.state == ReceiptCapture.SAVED:
            return receipt

        receipt.error = ''
        receipt.updated_by = user
        if parser_client.is_enabled():
            receipt.state = ReceiptCapture.QUEUED
        else:
            receipt.state = ReceiptCapture.WAITING
        receipt.save(update_fields=['state', 'error', 'updated_by', 'updated_at'])
        if receipt.state == ReceiptCapture.QUEUED:
            ReceiptService._dispatch_read(receipt.id)
        return receipt

    @staticmethod
    def resume_waiting() -> int:
        """Queue reads for every receipt that waits, oldest first. Returns how many were queued.

        Run by beat once the parser answers again. Also picks up reads lost in flight. A
        `failed` receipt is never picked: the same bytes would be rejected again. Nothing is deleted.
        """
        stuck_before = ReceiptService._inflight_stuck_before()
        picked = list(
            ReceiptCapture.objects.filter(
                Q(state=ReceiptCapture.WAITING)
                | Q(state__in=(ReceiptCapture.QUEUED, ReceiptCapture.READING), updated_at__lt=stuck_before)
            )
            .order_by('created_at', 'id')
            .values_list('id', 'state')[: settings.RECEIPT_RESUME_BATCH_SIZE]
        )

        dispatched = 0
        for receipt_id, state in picked:
            # Compare-and-set: the pick ran without a lock, so flip only a row still as picked.
            changed = ReceiptCapture.objects.filter(id=receipt_id, state=state).update(
                state=ReceiptCapture.QUEUED, error='', updated_at=timezone.now()
            )
            if not changed:
                continue
            ReceiptService._dispatch_read(receipt_id)
            dispatched += 1
        return dispatched

    @staticmethod
    @db_transaction.atomic
    def confirm(
        user, workspace_id: int, receipt_id: int, data: ReceiptConfirmIn, idempotency_key: str | None = None
    ) -> Transaction:
        """Save an open receipt as a transaction, or return the one it already is (D14).

        One database transaction. The receipt row is locked first, so two confirms
        of one receipt serialize and the second finds it `saved`. The stored object
        is not copied: the new attachment row takes over the receipt's key and the
        receipt's key is blanked. Any failure rolls back everything, including the
        transaction, and leaves the receipt as it was.
        """
        try:
            receipt = ReceiptCapture.objects.select_for_update().for_workspace(workspace_id).get(id=receipt_id)
        except ReceiptCapture.DoesNotExist:
            raise ReceiptNotFoundError()

        if receipt.state == ReceiptCapture.SAVED:
            return TransactionService.get_transaction(receipt.transaction_id, workspace_id)

        if idempotency_key:
            record = TransactionService._lookup_idempotency_key(user, workspace_id, idempotency_key)
            if record is not None and record.transaction_id is not None:
                # The key belongs to an earlier request: same key, same result. This
                # receipt is not handed over to that request's transaction.
                return TransactionService.get_transaction(record.transaction_id, workspace_id)

        transaction_data = TransactionCreate(**data.model_dump(exclude={'remainder_category_id'}))
        trans = TransactionService.create(user, workspace_id, transaction_data, idempotency_key=idempotency_key)
        if (
            idempotency_key
            and ReceiptCapture.objects.filter(transaction_id=trans.id, state=ReceiptCapture.SAVED).exists()
        ):
            # Lost race on this key: the helper returned the winner's transaction, which this receipt must not join.
            return trans
        if data.remainder_category_id is not None:
            TransactionService.replace_items(
                workspace_id, trans.id, transaction_data.items, remainder_category_id=data.remainder_category_id
            )

        if receipt.result is not None:
            extraction_status, extraction_error = TransactionAttachment.EXTRACTION_DONE, ''
        elif receipt.state == ReceiptCapture.FAILED:
            extraction_status, extraction_error = TransactionAttachment.EXTRACTION_FAILED, receipt.error
        else:
            extraction_status, extraction_error = TransactionAttachment.EXTRACTION_NONE, ''
        TransactionAttachment.objects.create(
            transaction=trans,
            file_key=receipt.file_key,
            filename=receipt.filename,
            content_type=receipt.content_type,
            size=receipt.size,
            uploaded_by_id=receipt.created_by_id,
            extraction_status=extraction_status,
            extraction_result=receipt.result,
            extraction_error=extraction_error,
        )

        receipt.state = ReceiptCapture.SAVED
        receipt.transaction = trans
        receipt.file_key = ''
        receipt.error = ''
        receipt.updated_by = user
        receipt.save(update_fields=['state', 'transaction', 'file_key', 'error', 'updated_by', 'updated_at'])
        return trans

    @staticmethod
    def suggestions(workspace_id: int, receipt: ReceiptCapture) -> dict | None:
        """What the workspace's history suggests for a ready receipt; None in any other state or without a result.

        Computed on every call and never stored. description and category_id
        come from the latest save with the same merchant key, account_id from
        the account rule (D109), item_category_ids lines up with
        result['items'] by position. A None inside the dict is "no suggestion".
        """
        if not ReceiptService._holds_result(receipt):
            return None
        description, category_id = ReceiptService._merchant_history(workspace_id, receipt.merchant_key)
        code = ReceiptService._result_currency(receipt.result)
        return {
            'description': description,
            'category_id': category_id,
            'account_id': ReceiptService._suggest_account(workspace_id, code),
            'item_category_ids': ReceiptService._item_category_ids(workspace_id, receipt.result),
        }

    @staticmethod
    def duplicates(workspace_id: int, receipt: ReceiptCapture) -> list[dict]:
        """Up to DUPLICATE_LIMIT transactions that may already be this purchase (D18), newest first.

        Each row is {id, date, description, amount}. Empty unless the receipt is
        ready and holds a result with a total, a currency and a parseable date.
        No type filter: the decision says "a transaction".
        """
        key = ReceiptService._duplicate_key(receipt)
        if key is None:
            return []
        rows = (
            Transaction.objects.for_workspace(workspace_id)
            .filter(ReceiptService._duplicate_condition(key))
            .order_by('-date', '-id')
            .values('id', 'date', 'description', 'amount')[:DUPLICATE_LIMIT]
        )
        return list(rows)

    @staticmethod
    def possible_duplicate_ids(workspace_id: int, receipts) -> set[int]:
        """Ids of the receipts that have at least one duplicate, from one query over all of them.

        Every ready receipt with a usable result adds one OR group; the matching
        transactions are then paired back to their receipts in Python, because
        one transaction can satisfy several groups.
        """
        keys = []
        for receipt in receipts:
            key = ReceiptService._duplicate_key(receipt)
            if key is not None:
                keys.append((receipt.id, key))
        if not keys:
            return set()
        condition = Q()
        for _, key in keys:
            condition = condition | ReceiptService._duplicate_condition(key)
        rows = (
            Transaction.objects.for_workspace(workspace_id).filter(condition).values('date', 'amount', 'currency__code')
        )
        flagged = set()
        for row in rows:
            for receipt_id, (total, code, day) in keys:
                same_money = row['currency__code'] == code and row['amount'] in (total, -total)
                if same_money and abs((row['date'] - day).days) <= 1:
                    flagged.add(receipt_id)
        return flagged
