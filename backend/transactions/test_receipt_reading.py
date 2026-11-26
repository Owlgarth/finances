"""Background reading of stored receipts: the read task, retry, resume and the merchant key."""

from datetime import timedelta
from unittest import mock

from celery.schedules import crontab
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from accounts.factories import AccountFactory
from common.tests.mixins import AuthMixin
from transactions.exceptions import ReceiptNotFoundError
from transactions.factories import ReceiptCaptureFactory, TransactionFactory
from transactions.models import ReceiptCapture
from transactions.parser_client import ParserServiceError, ParserUnavailableError
from transactions.receipts import RESUME_INTERVAL_SECONDS, ReceiptService, normalize_merchant
from transactions.tasks import read_receipt, resume_waiting_receipts
from workspaces.factories import WorkspaceFactory

PARSER_RESULT = {
    'schema_version': '1',
    'merchant': 'Lidl',
    'date': '2026-06-14',
    'currency': 'PLN',
    'total': '20.47',
    'items': [{'name': 'Bread', 'quantity': '1', 'unit_price': '4.49', 'line_total': '4.49', 'confidence': 0.98}],
    'confidence': {'merchant': 0.9, 'date': 0.95, 'currency': 0.99, 'total': 0.98, 'items': 0.8},
    'warnings': [],
}
REJECTED = 'Parser returned 422: unreadable'
UNREADABLE = 'The stored file could not be read.'
STALE = timedelta(days=1)  # far older than the in-flight threshold (115 minutes with the defaults)


class ReceiptReadingTestCase(AuthMixin, TestCase):
    """A configured parser and a storage that holds every receipt file."""

    def setUp(self):
        super().setUp()
        storage_patcher = mock.patch('transactions.attachments.StorageService')
        self.storage = storage_patcher.start()
        self.addCleanup(storage_patcher.stop)
        self.storage._is_enabled.return_value = True
        self.storage.save_file.side_effect = lambda bucket, key, content, content_type: key
        self.storage.get_file.return_value = b'imagebytes'
        enabled_patcher = mock.patch('transactions.parser_client.is_enabled', return_value=True)
        enabled_patcher.start()
        self.addCleanup(enabled_patcher.stop)

    def _receipt(self, **overrides):
        return ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, **overrides)

    def _saved_receipt(self):
        transaction = TransactionFactory(account=AccountFactory(workspace=self.workspace))
        return self._receipt(state=ReceiptCapture.SAVED, file_key='', transaction=transaction)

    def _state(self, receipt):
        receipt.refresh_from_db()
        return receipt.state


class TestReadReceiptDirect(ReceiptReadingTestCase):
    """`read_receipt.apply()` runs the retries, so the parser's behavior is the whole story."""

    def test_missing_receipt_is_a_no_op(self):
        with mock.patch('transactions.tasks.parse_receipt') as parse:
            read_receipt.apply(args=[999_999])
        parse.assert_not_called()

    def test_ready_receipt_is_left_alone(self):
        receipt = self._receipt(state=ReceiptCapture.READY, result=PARSER_RESULT, merchant_key='lidl')
        with mock.patch('transactions.tasks.parse_receipt') as parse:
            read_receipt.apply(args=[receipt.id])
        parse.assert_not_called()
        self.assertEqual(self._state(receipt), ReceiptCapture.READY)
        self.assertEqual(receipt.result, PARSER_RESULT)

    def test_saved_receipt_is_left_alone(self):
        receipt = self._saved_receipt()
        with mock.patch('transactions.tasks.parse_receipt') as parse:
            read_receipt.apply(args=[receipt.id])
        parse.assert_not_called()
        self.assertEqual(self._state(receipt), ReceiptCapture.SAVED)

    def test_success_stores_result_merchant_key_and_ready(self):
        receipt = self._receipt()
        with mock.patch('transactions.tasks.parse_receipt', return_value=PARSER_RESULT) as parse:
            read_receipt.apply(args=[receipt.id])
        parse.assert_called_once_with(b'imagebytes', receipt.filename, receipt.content_type)
        self.assertEqual(self._state(receipt), ReceiptCapture.READY)
        self.assertEqual(receipt.result, PARSER_RESULT)
        self.assertEqual(receipt.merchant_key, 'lidl')
        self.assertEqual(receipt.error, '')
        # A read never deletes: the photo stays for the confirm step.
        self.assertEqual(ReceiptCapture.objects.count(), 1)
        self.storage.delete_file.assert_not_called()

    def test_unconfigured_parser_leaves_the_receipt_waiting(self):
        receipt = self._receipt(error='stale message')
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=False),
            mock.patch('transactions.tasks.parse_receipt') as parse,
        ):
            read_receipt.apply(args=[receipt.id])
        parse.assert_not_called()
        self.assertEqual(self._state(receipt), ReceiptCapture.WAITING)
        self.assertEqual(receipt.error, '')

    def test_unreadable_bytes_fail_the_receipt(self):
        receipt = self._receipt()
        self.storage.get_file.return_value = None
        with mock.patch('transactions.tasks.parse_receipt') as parse:
            read_receipt.apply(args=[receipt.id])
        parse.assert_not_called()
        self.assertEqual(self._state(receipt), ReceiptCapture.FAILED)
        self.assertEqual(receipt.error, UNREADABLE)

    def test_rejected_file_fails_immediately_without_retrying(self):
        receipt = self._receipt()
        with mock.patch('transactions.tasks.parse_receipt', side_effect=ParserServiceError(REJECTED)) as parse:
            read_receipt.apply(args=[receipt.id])
        parse.assert_called_once()  # retrying sends identical bytes
        self.assertEqual(self._state(receipt), ReceiptCapture.FAILED)
        self.assertEqual(receipt.error, REJECTED)

    def test_unavailable_then_back_succeeds_on_the_retry(self):
        """Scanner off, then on: the receipt is read without user action."""
        receipt = self._receipt()
        with mock.patch(
            'transactions.tasks.parse_receipt', side_effect=[ParserUnavailableError('host down'), PARSER_RESULT]
        ) as parse:
            read_receipt.apply(args=[receipt.id])
        self.assertEqual(parse.call_count, 2)
        self.assertEqual(self._state(receipt), ReceiptCapture.READY)
        self.assertEqual(receipt.result, PARSER_RESULT)

    def test_exhausted_retries_leave_the_receipt_waiting(self):
        """A scanner that stays off is never a failure: beat picks the receipt up later."""
        receipt = self._receipt()
        with (
            mock.patch.object(read_receipt, 'max_retries', 1),
            mock.patch('transactions.tasks.parse_receipt', side_effect=ParserUnavailableError('host down')) as parse,
        ):
            read_receipt.apply(args=[receipt.id])  # initial attempt + one retry, nothing is raised
        self.assertEqual(parse.call_count, 2)
        self.assertEqual(self._state(receipt), ReceiptCapture.WAITING)
        self.assertEqual(receipt.error, '')

    def test_result_arriving_after_the_receipt_was_saved_is_discarded(self):
        receipt = self._receipt()

        def parse_while_the_user_saves(content, filename, content_type):
            ReceiptCapture.objects.filter(id=receipt.id).update(state=ReceiptCapture.SAVED, file_key='')
            return PARSER_RESULT

        with mock.patch('transactions.tasks.parse_receipt', side_effect=parse_while_the_user_saves):
            read_receipt.apply(args=[receipt.id])
        self.assertEqual(self._state(receipt), ReceiptCapture.SAVED)
        self.assertIsNone(receipt.result)
        self.assertIsNone(receipt.merchant_key)

    def test_failure_arriving_after_the_receipt_was_saved_changes_nothing(self):
        receipt = self._receipt()

        def parse_while_the_user_saves(content, filename, content_type):
            ReceiptCapture.objects.filter(id=receipt.id).update(state=ReceiptCapture.SAVED, file_key='')
            raise ParserServiceError(REJECTED)

        with mock.patch('transactions.tasks.parse_receipt', side_effect=parse_while_the_user_saves):
            read_receipt.apply(args=[receipt.id])
        self.assertEqual(self._state(receipt), ReceiptCapture.SAVED)

    def test_failure_arriving_after_the_receipt_was_deleted_is_discarded(self):
        receipt = self._receipt()
        receipt_id = receipt.id

        def parse_while_the_user_deletes(content, filename, content_type):
            ReceiptCapture.objects.filter(id=receipt_id).delete()
            raise ParserServiceError(REJECTED)

        with mock.patch('transactions.tasks.parse_receipt', side_effect=parse_while_the_user_deletes):
            read_receipt.apply(args=[receipt_id])
        self.assertFalse(ReceiptCapture.objects.filter(id=receipt_id).exists())


class TestReadReceiptDispatch(ReceiptReadingTestCase):
    """Upload and retry queue a read; the dispatch waits for the commit."""

    def _upload(self):
        return SimpleUploadedFile('r.jpg', b'bytes', content_type='image/jpeg')

    def test_upload_dispatches_one_read_on_commit(self):
        # The capture context is the innermost item on purpose: its exit runs the callbacks,
        # so every patch above it is still live while the eager read runs.
        with (
            mock.patch('transactions.tasks.parse_receipt', return_value=PARSER_RESULT) as parse,
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            receipt = ReceiptService.create_from_upload(self.user, self.workspace.id, self._upload())
        self.assertEqual(len(callbacks), 1)
        parse.assert_called_once()
        self.assertEqual(receipt.state, ReceiptCapture.QUEUED)  # the caller sees the row before the worker runs
        self.assertEqual(self._state(receipt), ReceiptCapture.READY)

    def test_upload_with_an_unconfigured_parser_dispatches_nothing(self):
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=False),
            mock.patch('transactions.tasks.parse_receipt') as parse,
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            receipt = ReceiptService.create_from_upload(self.user, self.workspace.id, self._upload())
        self.assertEqual(len(callbacks), 0)
        parse.assert_not_called()
        self.assertEqual(self._state(receipt), ReceiptCapture.WAITING)

    def test_retry_from_failed_queues_a_read(self):
        receipt = self._receipt(state=ReceiptCapture.FAILED, error=REJECTED)
        with (
            mock.patch('transactions.tasks.read_receipt') as read,
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            ReceiptService.retry(self.user, self.workspace.id, receipt.id)
        self.assertEqual(len(callbacks), 1)
        read.delay.assert_called_once_with(receipt.id)
        self.assertEqual(self._state(receipt), ReceiptCapture.QUEUED)
        self.assertEqual(receipt.error, '')

    def test_retry_requeues_a_ready_receipt(self):
        receipt = self._receipt(state=ReceiptCapture.READY, result=PARSER_RESULT)
        with (
            mock.patch('transactions.tasks.read_receipt') as read,
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            ReceiptService.retry(self.user, self.workspace.id, receipt.id)
        self.assertEqual(len(callbacks), 1)
        read.delay.assert_called_once_with(receipt.id)
        self.assertEqual(self._state(receipt), ReceiptCapture.QUEUED)

    def test_retry_with_an_unconfigured_parser_leaves_the_receipt_waiting(self):
        receipt = self._receipt(state=ReceiptCapture.FAILED, error=REJECTED)
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=False),
            mock.patch('transactions.tasks.read_receipt') as read,
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            ReceiptService.retry(self.user, self.workspace.id, receipt.id)
        self.assertEqual(len(callbacks), 0)
        read.delay.assert_not_called()
        self.assertEqual(self._state(receipt), ReceiptCapture.WAITING)
        self.assertEqual(receipt.error, '')

    def test_retry_on_a_saved_receipt_changes_nothing(self):
        receipt = self._saved_receipt()
        with (
            mock.patch('transactions.tasks.read_receipt') as read,
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            returned = ReceiptService.retry(self.user, self.workspace.id, receipt.id)
        self.assertEqual(len(callbacks), 0)
        read.delay.assert_not_called()
        self.assertEqual(self._state(receipt), ReceiptCapture.SAVED)
        self.assertEqual(returned.state, ReceiptCapture.SAVED)

    def test_retry_for_a_foreign_workspace_is_not_found(self):
        receipt = self._receipt(state=ReceiptCapture.FAILED)
        with self.assertRaises(ReceiptNotFoundError) as caught:
            ReceiptService.retry(self.user, WorkspaceFactory().id, receipt.id)
        self.assertEqual(caught.exception.http_status, 404)
        self.assertEqual(self._state(receipt), ReceiptCapture.FAILED)


class TestReadReceiptConfig(TestCase):
    """Task registration, retry settings and the beat entry."""

    def test_task_names_match_their_schedule_entry(self):
        self.assertEqual(read_receipt.name, 'transactions.tasks.read_receipt')
        self.assertEqual(resume_waiting_receipts.name, 'transactions.tasks.resume_waiting_receipts')
        self.assertEqual(
            settings.CELERY_BEAT_SCHEDULE['resume-waiting-receipts']['task'],
            'transactions.tasks.resume_waiting_receipts',
        )

    def test_beat_schedule_runs_every_fifteen_minutes(self):
        schedule = settings.CELERY_BEAT_SCHEDULE['resume-waiting-receipts']['schedule']
        self.assertIsInstance(schedule, crontab)
        self.assertEqual(schedule.minute, {0, 15, 30, 45})

    def test_resume_interval_equals_the_beat_schedule(self):
        self.assertEqual(RESUME_INTERVAL_SECONDS, 900)

    def test_read_retry_config(self):
        self.assertEqual(read_receipt.autoretry_for, (ParserUnavailableError,))
        self.assertEqual(read_receipt.max_retries, settings.PARSER_EXTRACT_MAX_RETRIES)
        self.assertEqual(read_receipt.retry_backoff, settings.PARSER_EXTRACT_RETRY_BACKOFF)
        self.assertEqual(read_receipt.retry_backoff_max, settings.PARSER_EXTRACT_RETRY_BACKOFF_MAX)
        self.assertTrue(read_receipt.retry_jitter)


class TestResumeWaiting(ReceiptReadingTestCase):
    """The beat job queues reads again once the parser answers, and deletes nothing."""

    def _resume(self):
        """Run the beat job with a reachable parser. The read task is a mock, so rows stay `queued`."""
        with (
            mock.patch('transactions.parser_client.is_reachable', return_value=True),
            mock.patch('transactions.tasks.read_receipt') as read,
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            dispatched = resume_waiting_receipts.apply().result
        return dispatched, callbacks, read

    def test_unreachable_parser_resumes_nothing(self):
        receipt = self._receipt(state=ReceiptCapture.WAITING)
        with (
            mock.patch('transactions.parser_client.is_reachable', return_value=False),
            mock.patch('transactions.tasks.read_receipt') as read,
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            dispatched = resume_waiting_receipts.apply().result
        self.assertEqual(dispatched, 0)
        self.assertEqual(len(callbacks), 0)
        read.delay.assert_not_called()
        self.assertEqual(self._state(receipt), ReceiptCapture.WAITING)

    def test_waiting_receipts_are_queued_oldest_first_within_the_batch(self):
        newest = self._receipt(state=ReceiptCapture.WAITING)
        oldest = self._receipt(state=ReceiptCapture.WAITING, error='scanning service offline')
        middle = self._receipt(state=ReceiptCapture.WAITING)
        ReceiptCapture.objects.filter(id=oldest.id).update(created_at=timezone.now() - timedelta(days=3))
        ReceiptCapture.objects.filter(id=middle.id).update(created_at=timezone.now() - timedelta(days=2))
        before = ReceiptCapture.objects.count()
        with override_settings(RECEIPT_RESUME_BATCH_SIZE=2):
            dispatched, callbacks, read = self._resume()
        self.assertEqual(dispatched, 2)
        self.assertEqual(len(callbacks), 2)
        self.assertEqual(read.delay.call_args_list, [mock.call(oldest.id), mock.call(middle.id)])
        self.assertEqual(self._state(oldest), ReceiptCapture.QUEUED)
        self.assertEqual(oldest.error, '')
        self.assertEqual(self._state(middle), ReceiptCapture.QUEUED)
        self.assertEqual(self._state(newest), ReceiptCapture.WAITING)
        # The job queues reads and nothing else: no receipt, no file.
        self.assertEqual(ReceiptCapture.objects.count(), before)
        self.storage.delete_file.assert_not_called()

    def test_failed_receipts_are_never_resumed(self):
        failed = self._receipt(state=ReceiptCapture.FAILED, error=REJECTED)
        waiting = self._receipt(state=ReceiptCapture.WAITING)
        dispatched, _, read = self._resume()
        self.assertEqual(dispatched, 1)
        read.delay.assert_called_once_with(waiting.id)
        self.assertEqual(self._state(failed), ReceiptCapture.FAILED)
        self.assertEqual(failed.error, REJECTED)

    def test_resume_covers_every_workspace(self):
        mine = self._receipt(state=ReceiptCapture.WAITING)
        theirs = ReceiptCaptureFactory(state=ReceiptCapture.WAITING)
        dispatched, _, read = self._resume()
        self.assertEqual(dispatched, 2)
        self.assertCountEqual(read.delay.call_args_list, [mock.call(mine.id), mock.call(theirs.id)])

    def test_stale_in_flight_receipts_are_resumed(self):
        """A worker crash or a lost queue message leaves a receipt in flight for good."""
        stale_reading = self._receipt(state=ReceiptCapture.READING)
        stale_queued = self._receipt(state=ReceiptCapture.QUEUED)
        ReceiptCapture.objects.filter(id__in=[stale_reading.id, stale_queued.id]).update(
            updated_at=timezone.now() - STALE
        )
        dispatched, _, read = self._resume()
        self.assertEqual(dispatched, 2)
        self.assertEqual(read.delay.call_args_list, [mock.call(stale_reading.id), mock.call(stale_queued.id)])
        self.assertEqual(self._state(stale_reading), ReceiptCapture.QUEUED)
        self.assertEqual(self._state(stale_queued), ReceiptCapture.QUEUED)

    def test_fresh_in_flight_receipts_are_left_alone(self):
        """Inside the threshold a worker may still be reading them."""
        queued = self._receipt(state=ReceiptCapture.QUEUED)
        reading = self._receipt(state=ReceiptCapture.READING)
        dispatched, callbacks, read = self._resume()
        self.assertEqual(dispatched, 0)
        self.assertEqual(len(callbacks), 0)
        read.delay.assert_not_called()
        self.assertEqual(self._state(queued), ReceiptCapture.QUEUED)
        self.assertEqual(self._state(reading), ReceiptCapture.READING)

    def test_a_receipt_that_moved_on_between_pick_and_flip_is_not_dispatched(self):
        receipt = self._receipt(state=ReceiptCapture.WAITING)
        real_filter = ReceiptCapture.objects.filter

        def filter_with_a_race(*args, **kwargs):
            if 'state' in kwargs:
                # The compare-and-set is about to run (the pick passes one positional Q); the user wins.
                ReceiptCapture._base_manager.filter(id=receipt.id).update(state=ReceiptCapture.READY)
            return real_filter(*args, **kwargs)

        with mock.patch.object(ReceiptCapture.objects, 'filter', side_effect=filter_with_a_race):
            dispatched, callbacks, read = self._resume()
        self.assertEqual(dispatched, 0)
        self.assertEqual(len(callbacks), 0)
        read.delay.assert_not_called()
        self.assertEqual(self._state(receipt), ReceiptCapture.READY)


class TestNormalizeMerchant(SimpleTestCase):
    """The key two receipts from one shop share."""

    def test_vectors(self):
        vectors = [
            ('Biedronka 4381', 'biedronka'),
            ('  Żabka   #12 ', 'żabka'),
            ('LIDL', 'lidl'),
            ('Lidl sp. z o.o. Warszawa', 'lidl sp. z o.o. warszawa'),
            ('Shop no. 12', 'shop'),
            ('Shell Station 76', 'shell station'),
            ('7-Eleven', '7-eleven'),
            ('Tesco 24/7', 'tesco 24/7'),
            ('', None),
            (None, None),
            ('   ', None),
        ]
        for merchant, expected in vectors:
            with self.subTest(merchant=merchant):
                self.assertEqual(normalize_merchant(merchant), expected)

    def test_store_number_marker_must_start_a_word(self):
        # A name that merely ends in "no" is not a store-number marker.
        self.assertEqual(normalize_merchant('Casino 12'), 'casino')
        self.assertEqual(normalize_merchant('Domino 5'), 'domino')

    def test_key_is_cut_to_the_column_width(self):
        self.assertEqual(len(normalize_merchant('x' * 300 + ' 12')), 255)
        self.assertIsNone(normalize_merchant('#12'))
