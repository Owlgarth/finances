"""Tests for stored receipts: ReceiptCapture, ReceiptService and the storage helpers they share.

StorageService is mocked as an enabled bucket (the TestTransactionAttachments
pattern in transactions/tests.py, which this file neither imports nor modifies).
"""

from unittest import mock

from django.contrib import admin as django_admin
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import IntegrityError, connection
from django.db import transaction as db_transaction
from django.db.migrations.recorder import MigrationRecorder
from django.test import TestCase, TransactionTestCase, override_settings
from django.urls import reverse

from common.tests.mixins import APIClientMixin, AuthMixin
from transactions.admin import ReceiptCaptureAdmin
from transactions.attachments import DOWNLOAD_URL_EXPIRY_SECONDS
from transactions.exceptions import (
    AttachmentStorageUnavailableError,
    AttachmentTypeError,
    ReceiptNotFoundError,
)
from transactions.factories import ReceiptCaptureFactory
from transactions.models import ReceiptCapture
from transactions.receipts import ReceiptService
from workspaces.factories import WorkspaceFactory


class ReceiptTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base: an authenticated workspace owner and a mocked, enabled storage."""

    def setUp(self):
        super().setUp()
        # Pretend S3 is configured; individual operations are mocked per test.
        patcher = mock.patch('transactions.attachments.StorageService')
        self.storage = patcher.start()
        self.addCleanup(patcher.stop)
        self.storage._is_enabled.return_value = True
        self.storage.get_file.return_value = b'stored-bytes'
        self.storage.save_file.side_effect = lambda bucket, key, content, content_type: key
        self.storage.delete_file.return_value = True

    def _upload(self, name='receipt.jpg', content_type='image/jpeg', content=b'fakebytes'):
        return SimpleUploadedFile(name, content, content_type=content_type)


class LongNamedUpload:
    """A file-like upload no Django normalization has touched.

    UploadedFile cuts its own name at 255 (keeping the extension), so a
    SimpleUploadedFile cannot show the service's cut.
    """

    content_type = 'application/pdf'
    name = 'x' * 300 + '.pdf'
    size = 9

    def read(self):
        return b'fakebytes'


class TestReceiptCaptureConstraints(ReceiptTestCase):
    """One valid row per constraint before its violation; each bad create sits in its own savepoint."""

    def _violates(self, constraint_name: str, **overrides):
        with self.assertRaises(IntegrityError) as caught:
            with db_transaction.atomic():  # SAVEPOINT - isolates the rollback
                ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, **overrides)
        self.assertIn(constraint_name, str(caught.exception))

    def test_file_key_is_unique_among_rows_that_own_one(self):
        ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, file_key='receipts/1/a.jpg')
        ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, file_key='receipts/1/b.jpg')
        self._violates('unique_receipt_file_key', file_key='receipts/1/a.jpg')
        # Handed-over rows all carry '' and may repeat.
        ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, file_key='', state=ReceiptCapture.SAVED)
        ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, file_key='', state=ReceiptCapture.SAVED)
        self.assertEqual(ReceiptCapture.objects.count(), 4)

    def test_saved_row_keeps_no_file(self):
        ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, file_key='', state=ReceiptCapture.SAVED)
        self._violates('receipt_saved_has_no_file', file_key='receipts/1/kept.jpg', state=ReceiptCapture.SAVED)
        self.assertEqual(ReceiptCapture.objects.count(), 1)

    def test_open_row_owns_a_file(self):
        ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)  # queued with a key: valid
        self._violates('receipt_open_has_file', file_key='')  # queued without one
        self.assertEqual(ReceiptCapture.objects.count(), 1)


class TestReceiptCreateFromUpload(ReceiptTestCase):
    def _create(self, file=None):
        return ReceiptService.create_from_upload(self.user, self.workspace.id, file or self._upload())

    def test_stores_under_receipts_prefix_and_records_the_row(self):
        with override_settings(EXTRACTION_ENABLED=True):
            receipt = self._create(self._upload(content_type='IMAGE/JPEG'))
        self.storage.save_file.assert_called_once()
        key = self.storage.save_file.call_args.args[1]
        self.assertRegex(key, rf'^receipts/{self.workspace.id}/[0-9a-f]{{32}}\.jpg$')
        self.assertEqual(receipt.file_key, key)
        self.assertEqual(receipt.workspace_id, self.workspace.id)
        self.assertEqual(receipt.created_by_id, self.user.id)
        self.assertEqual(receipt.updated_by_id, self.user.id)
        self.assertEqual(receipt.filename, 'receipt.jpg')
        self.assertEqual(receipt.content_type, 'image/jpeg')
        self.assertEqual(receipt.size, 9)
        self.assertEqual(receipt.state, ReceiptCapture.QUEUED)
        self.assertEqual(receipt.error, '')
        self.assertIsNone(receipt.result)
        self.assertIsNone(receipt.merchant_key)
        self.assertIsNone(receipt.transaction_id)

    def test_queued_when_parser_is_configured(self):
        with override_settings(EXTRACTION_ENABLED=True):
            receipt = self._create()
        self.assertEqual(receipt.state, ReceiptCapture.QUEUED)

    def test_waiting_when_parser_is_unconfigured_but_the_photo_is_kept(self):
        with override_settings(EXTRACTION_ENABLED=False):
            receipt = self._create()
        self.assertEqual(receipt.state, ReceiptCapture.WAITING)
        self.assertTrue(receipt.file_key)
        self.storage.save_file.assert_called_once()

    def test_rejected_type_stores_nothing(self):
        with self.assertRaises(AttachmentTypeError):
            self._create(self._upload(name='malware.exe', content_type='application/octet-stream'))
        self.storage.save_file.assert_not_called()
        self.assertEqual(ReceiptCapture.objects.count(), 0)

    def test_storage_write_failure_raises_and_creates_no_row(self):
        # What the real save_file returns when storage is disabled or the upload failed.
        self.storage.save_file.side_effect = None
        self.storage.save_file.return_value = None
        with self.assertRaises(AttachmentStorageUnavailableError):
            self._create()
        self.assertEqual(ReceiptCapture.objects.count(), 0)
        self.storage.delete_file.assert_not_called()

    def test_failed_row_create_removes_the_stored_object(self):
        with (
            mock.patch.object(ReceiptCapture.objects, 'create', side_effect=RuntimeError('row write failed')),
            self.assertRaises(RuntimeError),
        ):
            self._create()
        bucket, key = self.storage.save_file.call_args.args[:2]
        self.storage.delete_file.assert_called_once_with(bucket, key)
        self.assertEqual(ReceiptCapture.objects.count(), 0)

    def test_pdf_keeps_pdf_extension(self):
        receipt = self._create(self._upload(name='receipt.pdf', content_type='application/pdf'))
        self.assertTrue(receipt.file_key.endswith('.pdf'))
        self.assertEqual(receipt.content_type, 'application/pdf')

    def test_long_filename_is_cut_to_255(self):
        receipt = self._create(LongNamedUpload())
        self.assertEqual(receipt.filename, 'x' * 255)
        self.assertTrue(receipt.file_key.endswith('.pdf'))


class TestReceiptQueries(ReceiptTestCase):
    def _receipt(self, **overrides):
        return ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, **overrides)

    def test_get_returns_the_workspaces_receipt(self):
        receipt = self._receipt()
        self.assertEqual(ReceiptService.get(receipt.id, self.workspace.id).id, receipt.id)

    def test_get_hides_other_workspaces_and_missing_ids(self):
        receipt = self._receipt()
        with self.assertRaises(ReceiptNotFoundError) as caught:
            ReceiptService.get(receipt.id, WorkspaceFactory().id)
        self.assertEqual((caught.exception.http_status, caught.exception.code), (404, 'not_found'))
        with self.assertRaises(ReceiptNotFoundError):
            ReceiptService.get(0, self.workspace.id)

    def test_list_open_is_newest_first_without_saved_or_foreign_rows(self):
        oldest = self._receipt(filename='oldest.jpg')
        newest = self._receipt(filename='newest.jpg')
        self._receipt(filename='saved.jpg', file_key='', state=ReceiptCapture.SAVED)
        ReceiptCaptureFactory(filename='foreign.jpg')
        ReceiptCapture.objects.filter(id=oldest.id).update(created_at='2026-01-01T10:00:00Z')
        ReceiptCapture.objects.filter(id=newest.id).update(created_at='2026-01-02T10:00:00Z')
        listed = list(ReceiptService.list_open(self.workspace.id))
        self.assertEqual([receipt.filename for receipt in listed], ['newest.jpg', 'oldest.jpg'])

    def test_list_open_breaks_ties_by_newest_id(self):
        first = self._receipt(filename='first.jpg')
        second = self._receipt(filename='second.jpg')
        ReceiptCapture.objects.filter(id__in=[first.id, second.id]).update(created_at='2026-01-01T10:00:00Z')
        self.assertEqual(
            [receipt.id for receipt in ReceiptService.list_open(self.workspace.id)],
            [second.id, first.id],
        )

    def test_list_open_reads_uploaders_in_one_query(self):
        self._receipt()
        self._receipt()
        with self.assertNumQueries(1):
            uploaders = [receipt.created_by for receipt in ReceiptService.list_open(self.workspace.id)]
        self.assertEqual(uploaders, [self.user, self.user])


class TestReceiptBytesAndDelete(ReceiptTestCase):
    def _receipt(self, **overrides):
        return ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, **overrides)

    def test_read_bytes_returns_the_stored_object(self):
        receipt = self._receipt()
        self.assertEqual(ReceiptService.read_bytes(receipt), b'stored-bytes')
        self.assertEqual(self.storage.get_file.call_args.args[1], receipt.file_key)

    def test_read_bytes_is_none_without_a_file_or_when_the_object_is_gone(self):
        self.assertIsNone(ReceiptService.read_bytes(self._receipt(file_key='', state=ReceiptCapture.SAVED)))
        self.storage.get_file.assert_not_called()
        self.storage.get_file.return_value = None
        self.assertIsNone(ReceiptService.read_bytes(self._receipt()))

    def test_delete_removes_the_row_and_its_object(self):
        receipt = self._receipt()
        ReceiptService.delete(self.workspace.id, receipt.id)
        self.assertFalse(ReceiptCapture.objects.filter(id=receipt.id).exists())
        self.storage.delete_file.assert_called_once()
        self.assertEqual(self.storage.delete_file.call_args.args[1], receipt.file_key)

    def test_delete_of_a_handed_over_receipt_touches_no_storage(self):
        receipt = self._receipt(file_key='', state=ReceiptCapture.SAVED)
        ReceiptService.delete(self.workspace.id, receipt.id)
        self.assertFalse(ReceiptCapture.objects.filter(id=receipt.id).exists())
        self.storage.delete_file.assert_not_called()

    def test_delete_of_a_foreign_id_raises_and_keeps_everything(self):
        foreign = ReceiptCaptureFactory()
        with self.assertRaises(ReceiptNotFoundError):
            ReceiptService.delete(self.workspace.id, foreign.id)
        self.assertTrue(ReceiptCapture.objects.filter(id=foreign.id).exists())
        self.storage.delete_file.assert_not_called()

    def test_delete_storage_for_workspace_removes_only_its_keys(self):
        own_keys = {
            self._receipt(file_key=f'receipts/{self.workspace.id}/a.jpg').file_key,
            self._receipt(file_key=f'receipts/{self.workspace.id}/b.jpg').file_key,
        }
        self._receipt(file_key='', state=ReceiptCapture.SAVED)  # owns nothing: an attachment has the file
        ReceiptCaptureFactory(file_key='receipts/other/c.jpg')
        ReceiptService.delete_storage_for_workspace(self.workspace.id)
        deleted = {call.args[1] for call in self.storage.delete_file.call_args_list}
        self.assertEqual(deleted, own_keys)
        self.assertEqual(self.storage.delete_file.call_count, 2)

    def test_delete_storage_for_workspace_without_receipts_touches_no_storage(self):
        ReceiptService.delete_storage_for_workspace(self.workspace.id)
        self.storage.delete_file.assert_not_called()


class TestReceiptCaptureAdmin(ReceiptTestCase):
    """Admin change list and the presigned link, the live consumer of get_presigned_url."""

    def _model_admin(self):
        return ReceiptCaptureAdmin(ReceiptCapture, django_admin.site)

    def test_change_list_renders_for_a_superuser(self):
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save()
        self.client.force_login(self.user)
        ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, filename='queued-receipt.jpg')
        response = self.client.get(reverse('admin:transactions_receiptcapture_changelist'))
        self.assertContains(response, 'queued-receipt.jpg', status_code=200)

    def test_link_follows_file_ownership(self):
        receipt = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)
        saved = ReceiptCaptureFactory(
            workspace=self.workspace, created_by=self.user, file_key='', state=ReceiptCapture.SAVED
        )
        with mock.patch('transactions.admin.StorageService') as storage:
            storage.get_presigned_url.return_value = 'http://signed.example/admin'
            linked = self._model_admin().presigned_download_link(receipt)
            handed_over = self._model_admin().presigned_download_link(saved)
        storage.get_presigned_url.assert_called_once()
        self.assertEqual(storage.get_presigned_url.call_args.args[1], receipt.file_key)
        self.assertEqual(storage.get_presigned_url.call_args.kwargs['expiry'], DOWNLOAD_URL_EXPIRY_SECONDS)
        self.assertIn('http://signed.example/admin', linked)
        self.assertEqual(handed_over, 'file handed over to a transaction attachment')


class TestReceiptCaptureMigrationRoundTrip(TransactionTestCase):
    """The receipt capture migration applies and reverses cleanly.

    The repo's first TransactionTestCase: unlike TestCase it commits, so DDL
    (a migration) is possible. Its per-test flush truncates EVERY table,
    including the currency catalog and the legal documents that the
    session-scoped conftest fixtures seed once, so tearDownClass re-seeds
    them after the final flush. Keep this class at one test, and never rely
    in it on rows another test created.
    """

    UNAPPLY_TO = '0012_transactionitem_coverage_repair'

    @classmethod
    def tearDownClass(cls):
        call_command('seed_currencies', verbosity=0)
        call_command('seed_legal_documents', verbosity=0)
        super().tearDownClass()

    def test_unapply_and_reapply(self):
        tables = connection.introspection.table_names
        self.assertIn('receipt_captures', tables())  # not vacuous: the migration built the table
        try:
            call_command('migrate', 'transactions', self.UNAPPLY_TO, verbosity=0)
            self.assertNotIn('receipt_captures', tables())
            applied = [
                name for app, name in MigrationRecorder(connection).applied_migrations() if app == 'transactions'
            ]
            self.assertEqual(max(applied), self.UNAPPLY_TO)
        finally:
            call_command('migrate', 'transactions', verbosity=0)
        self.assertIn('receipt_captures', tables())
        ReceiptCaptureFactory()  # the table and its constraints are back
        self.assertEqual(ReceiptCapture.objects.count(), 1)
