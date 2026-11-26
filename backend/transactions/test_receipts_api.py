"""Tests for the receipts API: upload, list, detail, file, retry, delete and confirm."""

from decimal import Decimal
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.factories import AccountFactory
from budgeting.factories import BudgetFactory
from categories.factories import CategoryFactory
from common.auth import create_access_token
from common.tests.factories import UserFactory
from common.tests.helpers import create_other_workspace
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService
from transactions.attachments import MAX_ATTACHMENT_SIZE_MB
from transactions.factories import ReceiptCaptureFactory, TransactionFactory
from transactions.models import (
    ReceiptCapture,
    Transaction,
    TransactionAttachment,
    TransactionIdempotencyKey,
    TransactionItem,
)
from transactions.receipts import ReceiptService
from transactions.services import TransactionService
from workspaces.models import WorkspaceMember

RECEIPTS_URL = '/api/receipts'

ZERO_COUNTS = {'queued': 0, 'reading': 0, 'ready': 0, 'waiting': 0, 'failed': 0}

RECEIPT_OUT_FIELDS = [
    'id',
    'state',
    'error',
    'filename',
    'content_type',
    'size',
    'uploader_name',
    'transaction_id',
    'possible_duplicate',
    'created_at',
    'updated_at',
    'result',
]

# A parser contract v1 success document (docs/parser-contract.md), local to this file.
PARSER_RESULT = {
    'schema_version': '1',
    'merchant': 'Biedronka 4381',
    'date': '2026-06-28',
    'currency': 'PLN',
    'total': '87.43',
    'items': [
        {
            'name': 'Mleko UHT 3.2% 1L',
            'quantity': '2',
            'unit_price': '3.99',
            'line_total': '7.98',
            'confidence': 0.97,
        }
    ],
    'confidence': {'merchant': 0.88, 'date': 0.95, 'currency': 0.99, 'total': 0.97, 'items': 0.91},
    'warnings': [],
}


def _url(receipt_id=None, suffix=''):
    return f'{RECEIPTS_URL}/{receipt_id}{suffix}'


class ReceiptAPITestCase(AuthMixin, APIClientMixin, TestCase):
    """Base: storage mocked as configured, the parser as unconfigured.

    The parser patch is explicit because a developer .env may configure
    PARSER_URL: a test that needs the other setting says so itself.
    """

    def setUp(self):
        super().setUp()
        storage_patch = mock.patch('transactions.attachments.StorageService')
        self.storage = storage_patch.start()
        self.addCleanup(storage_patch.stop)
        self.storage._is_enabled.return_value = True
        self.storage.save_file.side_effect = lambda bucket, key, content, content_type: key
        self.storage.get_file.return_value = b'storedbytes'
        self.storage.delete_file.return_value = True
        parser_patch = mock.patch('transactions.parser_client.is_enabled', return_value=False)
        parser_patch.start()
        self.addCleanup(parser_patch.stop)

    def _upload(self, name='receipt.jpg', content_type='image/jpeg', content=b'fakebytes'):
        upload = SimpleUploadedFile(name, content, content_type=content_type)
        return self.client.post(RECEIPTS_URL, {'file': upload}, **self.auth_headers())

    def _storage_off(self):
        """A disabled storage as the real StorageService behaves: flag off, save and fetch answer None."""
        self.storage._is_enabled.return_value = False
        self.storage.save_file.side_effect = None
        self.storage.save_file.return_value = None
        self.storage.get_file.return_value = None

    def _saved_receipt(self):
        """A receipt that became a transaction: saved, key handed over, result still on the row."""
        account = AccountFactory(workspace=self.workspace)
        return ReceiptCaptureFactory(
            workspace=self.workspace,
            created_by=self.user,
            state=ReceiptCapture.SAVED,
            file_key='',
            transaction=TransactionFactory(account=account),
            result=PARSER_RESULT,
        )


class TestReceiptUpload(ReceiptAPITestCase):
    def test_upload_with_parser_enabled_is_201_queued(self):
        """Configured but offline is still 201: the upload never probes the parser host."""
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            mock.patch('transactions.parser_client.is_reachable', return_value=False) as reachable,
        ):
            response = self._upload()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['state'], ReceiptCapture.QUEUED)
        reachable.assert_not_called()
        self.assertEqual(ReceiptCapture.objects.get().state, ReceiptCapture.QUEUED)

    def test_upload_with_parser_unconfigured_is_201_waiting(self):
        with mock.patch('transactions.parser_client.is_enabled', return_value=False):
            response = self._upload()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['state'], ReceiptCapture.WAITING)

    def test_upload_returns_the_wire_shape_and_no_storage_key(self):
        response = self._upload()
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(list(data), RECEIPT_OUT_FIELDS)
        self.assertEqual(data['filename'], 'receipt.jpg')
        self.assertEqual(data['content_type'], 'image/jpeg')
        self.assertEqual(data['size'], len(b'fakebytes'))
        self.assertEqual(data['uploader_name'], 'Test User')
        self.assertIsNone(data['transaction_id'])
        self.assertIsNone(data['result'])
        receipt = ReceiptCapture.objects.get()
        self.assertEqual(list(ReceiptService.serialize(receipt)), RECEIPT_OUT_FIELDS)
        self.assertEqual(receipt.created_by, self.user)
        self.assertTrue(receipt.file_key.startswith(f'receipts/{self.workspace.id}/'))
        self.assertTrue(receipt.file_key.endswith('.jpg'))
        self.storage.save_file.assert_called_once()

    def test_unsupported_type_is_400_and_stores_nothing(self):
        response = self._upload(name='malware.exe', content_type='application/octet-stream')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['code'], 'unsupported_media_type')
        self.storage.save_file.assert_not_called()
        self.assertEqual(ReceiptCapture.objects.count(), 0)

    def test_oversized_upload_is_400_and_stores_nothing(self):
        # One byte over the cap, sent as real bytes: the size is read from the parsed upload.
        response = self._upload(content=b'x' * (MAX_ATTACHMENT_SIZE_MB * 1024 * 1024 + 1))
        self.assertEqual(response.status_code, 400)
        self.assertIn('File too large', response.json()['detail'])
        self.storage.save_file.assert_not_called()
        self.assertEqual(ReceiptCapture.objects.count(), 0)

    def test_storage_disabled_is_503(self):
        self._storage_off()
        response = self._upload()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['code'], 'storage_unavailable')
        self.assertEqual(ReceiptCapture.objects.count(), 0)


class TestReceiptList(ReceiptAPITestCase):
    def test_list_excludes_saved_rows_newest_first_with_counts(self):
        oldest = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)
        second = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)
        waiting = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user, state=ReceiptCapture.WAITING)
        ready = ReceiptCaptureFactory(
            workspace=self.workspace, created_by=self.user, state=ReceiptCapture.READY, result=PARSER_RESULT
        )
        self._saved_receipt()

        data = self.get(RECEIPTS_URL, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([row['id'] for row in data['items']], [ready.id, waiting.id, second.id, oldest.id])
        # Two queued rows: a GROUP BY that Meta.ordering split per receipt would count 1 here.
        self.assertEqual(data['counts'], {'queued': 2, 'reading': 0, 'ready': 1, 'waiting': 1, 'failed': 0})
        self.assertEqual(data['items'][0]['result'], PARSER_RESULT)

    def test_empty_workspace_lists_nothing_with_zero_counts(self):
        data = self.get(RECEIPTS_URL, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, {'items': [], 'counts': ZERO_COUNTS})

    def test_list_query_count_does_not_grow_with_rows(self):
        """One query for the rows (uploader included), one for the counts, whatever the row count."""
        ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)
        with CaptureQueriesContext(connection) as one_row:
            self.get(RECEIPTS_URL, **self.auth_headers())
        ReceiptCaptureFactory.create_batch(5, workspace=self.workspace, created_by=self.user)
        with CaptureQueriesContext(connection) as six_rows:
            self.get(RECEIPTS_URL, **self.auth_headers())
        self.assertEqual(len(one_row.captured_queries), len(six_rows.captured_queries))


class TestReceiptDetail(ReceiptAPITestCase):
    def test_detail_of_ready_receipt_carries_the_result(self):
        receipt = ReceiptCaptureFactory(
            workspace=self.workspace, created_by=self.user, state=ReceiptCapture.READY, result=PARSER_RESULT
        )
        data = self.get(_url(receipt.id), **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(list(data), RECEIPT_OUT_FIELDS + ['suggestions', 'duplicates'])
        self.assertEqual(list(ReceiptService.serialize(receipt)), RECEIPT_OUT_FIELDS)
        self.assertEqual(data['state'], ReceiptCapture.READY)
        self.assertEqual(data['result'], PARSER_RESULT)
        self.assertEqual(data['uploader_name'], 'Test User')
        self.assertIsNone(data['transaction_id'])

    def test_detail_of_saved_receipt_says_where_it_went(self):
        receipt = self._saved_receipt()
        data = self.get(_url(receipt.id), **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['state'], ReceiptCapture.SAVED)
        self.assertEqual(data['transaction_id'], receipt.transaction_id)
        # The row still holds its result; only a ready receipt puts it on the wire.
        self.assertIsNone(data['result'])

    def test_uploader_name_falls_back_to_the_email(self):
        uploader = UserFactory(email='bare@example.com', full_name='')
        receipt = ReceiptCaptureFactory(workspace=self.workspace, created_by=uploader)
        data = self.get(_url(receipt.id), **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['uploader_name'], 'bare@example.com')

    def test_uploader_name_is_none_when_the_uploader_is_gone(self):
        receipt = ReceiptCaptureFactory(workspace=self.workspace, created_by=None)
        data = self.get(_url(receipt.id), **self.auth_headers())
        self.assertStatus(200)
        self.assertIsNone(data['uploader_name'])

    def test_missing_id_is_404(self):
        data = self.get(_url(999999), **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(data['code'], 'not_found')


class TestReceiptFile(ReceiptAPITestCase):
    def _file(self, receipt):
        return self.client.get(_url(receipt.id, '/file'), **self.auth_headers())

    def test_file_streams_the_bytes_with_headers(self):
        receipt = ReceiptCaptureFactory(
            workspace=self.workspace, created_by=self.user, filename='receipt.jpg', content_type='image/jpeg'
        )
        response = self._file(receipt)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'storedbytes')
        self.assertEqual(response['Content-Type'], 'image/jpeg')
        disposition = response['Content-Disposition']
        self.assertTrue(disposition.startswith('attachment;'))
        self.assertIn('filename="receipt.jpg"', disposition)
        self.assertIn("filename*=UTF-8''receipt.jpg", disposition)
        self.storage.get_file.assert_called_once()

    def test_file_of_a_gone_object_is_404_file_missing(self):
        receipt = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)
        self.storage.get_file.return_value = None
        data = self.get(_url(receipt.id, '/file'), **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(data['code'], 'file_missing')

    def test_file_of_a_handed_over_receipt_is_404_file_missing(self):
        receipt = self._saved_receipt()
        data = self.get(_url(receipt.id, '/file'), **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(data['code'], 'file_missing')
        self.storage.get_file.assert_not_called()

    def test_storage_disabled_is_503(self):
        receipt = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)
        self._storage_off()
        self.get(_url(receipt.id, '/file'), **self.auth_headers())
        self.assertStatus(503)
        self.storage.get_file.assert_not_called()

    def test_missing_id_is_404(self):
        data = self.get(_url(999999, '/file'), **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(data['code'], 'not_found')


class TestReceiptRetry(ReceiptAPITestCase):
    def _failed_receipt(self):
        return ReceiptCaptureFactory(
            workspace=self.workspace,
            created_by=self.user,
            state=ReceiptCapture.FAILED,
            error='Parser returned 422: unreadable_input',
        )

    def test_retry_with_parser_enabled_queues_a_read_and_returns_the_receipt(self):
        receipt = self._failed_receipt()
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            self.captureOnCommitCallbacks(execute=False) as callbacks,
        ):
            data = self.post(_url(receipt.id, '/retry'), {}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(list(data), RECEIPT_OUT_FIELDS)
        self.assertEqual(data['state'], ReceiptCapture.QUEUED)
        self.assertEqual(data['error'], '')
        # One read is dispatched on commit. It is captured, never run, so the row stays queued.
        self.assertEqual(len(callbacks), 1)
        receipt.refresh_from_db()
        self.assertEqual(receipt.state, ReceiptCapture.QUEUED)

    def test_retry_with_parser_unconfigured_moves_to_waiting(self):
        receipt = self._failed_receipt()
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            data = self.post(_url(receipt.id, '/retry'), {}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['state'], ReceiptCapture.WAITING)
        # Nothing is dispatched while the parser is unconfigured.
        self.assertEqual(len(callbacks), 0)

    def test_retry_of_a_saved_receipt_returns_it_unchanged(self):
        receipt = self._saved_receipt()
        with (
            mock.patch('transactions.parser_client.is_enabled', return_value=True),
            self.captureOnCommitCallbacks(execute=False) as callbacks,
        ):
            data = self.post(_url(receipt.id, '/retry'), {}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['state'], ReceiptCapture.SAVED)
        self.assertEqual(data['transaction_id'], receipt.transaction_id)
        self.assertEqual(len(callbacks), 0)

    def test_missing_id_is_404(self):
        data = self.post(_url(999999, '/retry'), {}, **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(data['code'], 'not_found')


class TestReceiptDelete(ReceiptAPITestCase):
    def test_delete_returns_204_and_removes_the_row_and_its_object(self):
        receipt = ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)
        self.delete(_url(receipt.id), **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(ReceiptCapture.objects.filter(id=receipt.id).exists())
        self.storage.delete_file.assert_called_once()

    def test_delete_of_a_handed_over_receipt_touches_no_storage(self):
        receipt = self._saved_receipt()
        self.delete(_url(receipt.id), **self.auth_headers())
        self.assertStatus(204)
        self.assertFalse(ReceiptCapture.objects.filter(id=receipt.id).exists())
        self.storage.delete_file.assert_not_called()

    def test_missing_id_is_404(self):
        self.delete(_url(999999), **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(self.response.json()['code'], 'not_found')


class TestReceiptsOtherWorkspace(ReceiptAPITestCase):
    """A receipt of another workspace is indistinguishable from a missing one: 404, never 403."""

    def test_foreign_receipt_is_404_on_every_endpoint_that_takes_an_id(self):
        other_workspace, other_user, _ = create_other_workspace()
        theirs = ReceiptCaptureFactory(
            workspace=other_workspace, created_by=other_user, state=ReceiptCapture.FAILED, error='kept'
        )

        data = self.get(_url(theirs.id), **self.auth_headers())
        self.assertStatus(404)
        self.assertEqual(data['code'], 'not_found')
        data = self.get(_url(theirs.id, '/file'), **self.auth_headers())
        self.assertStatus(404)
        data = self.post(_url(theirs.id, '/retry'), {}, **self.auth_headers())
        self.assertStatus(404)
        self.delete(_url(theirs.id), **self.auth_headers())
        self.assertStatus(404)

        self.storage.get_file.assert_not_called()
        self.storage.delete_file.assert_not_called()
        theirs.refresh_from_db()
        self.assertEqual((theirs.state, theirs.error), (ReceiptCapture.FAILED, 'kept'))

    def test_foreign_receipt_is_absent_from_the_list(self):
        ReceiptCaptureFactory(workspace=self.workspace, created_by=self.user)
        _, other_user, _ = create_other_workspace()
        other_headers = {'HTTP_AUTHORIZATION': f'Bearer {create_access_token(other_user)}'}

        data = self.get(RECEIPTS_URL, **other_headers)
        self.assertStatus(200)
        self.assertEqual(data, {'items': [], 'counts': ZERO_COUNTS})


class TestReceiptsViewer(ReceiptAPITestCase):
    """Receipts belong to the members who can write: a viewer gets 403 before any lookup."""

    user_role = 'viewer'

    def setUp(self):
        super().setUp()
        self.receipt = ReceiptCaptureFactory(workspace=self.workspace)

    def test_viewer_cannot_upload(self):
        response = self._upload()
        self.assertEqual(response.status_code, 403)
        self.storage.save_file.assert_not_called()
        self.assertEqual(ReceiptCapture.objects.count(), 1)

    def test_viewer_cannot_list(self):
        self.get(RECEIPTS_URL, **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_cannot_read_the_detail(self):
        self.get(_url(self.receipt.id), **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_cannot_download_the_file(self):
        self.get(_url(self.receipt.id, '/file'), **self.auth_headers())
        self.assertStatus(403)
        self.storage.get_file.assert_not_called()

    def test_viewer_cannot_retry(self):
        self.post(_url(self.receipt.id, '/retry'), {}, **self.auth_headers())
        self.assertStatus(403)

    def test_viewer_cannot_delete(self):
        self.delete(_url(self.receipt.id), **self.auth_headers())
        self.assertStatus(403)
        self.assertTrue(ReceiptCapture.objects.filter(id=self.receipt.id).exists())
        self.storage.delete_file.assert_not_called()


class TestReceiptsRouterMounted(ReceiptAPITestCase):
    def test_unauthenticated_list_answers_401_from_the_endpoint(self):
        """401 is the endpoint's own auth. A path registered differently answers 405 with
        a foreign Allow header; a router that is not mounted answers 404.
        """
        response = self.client.get(RECEIPTS_URL)
        self.assertEqual(response.status_code, 401)
        self.assertFalse(response.has_header('Allow'))


class TestReceiptConfirm(ReceiptAPITestCase):
    """POST /api/receipts/{receipt_id}/confirm: one atomic save of a receipt as a transaction."""

    RESULT = {
        'merchant': 'Biedronka 4381',
        'date': '2026-07-14',
        'currency': 'PLN',
        'total': '50.00',
        'items': [{'name': 'Bread', 'quantity': '1', 'unit_price': '4.99', 'line_total': '4.99'}],
    }

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        self.account = AccountFactory(workspace=self.workspace, name='Main', opening_balance=Decimal('100.00'))
        self.budget = BudgetFactory(workspace=self.workspace)
        self.groceries = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Groceries')
        self.household = CategoryFactory(budget=self.budget, workspace=self.workspace, name='Household')

    def _receipt(self, **overrides):
        """A ready receipt uploaded by self.user; any factory field can be overridden."""
        kwargs = {
            'workspace': self.workspace,
            'created_by': self.user,
            'state': ReceiptCapture.READY,
            'result': self.RESULT,
        }
        return ReceiptCaptureFactory(**{**kwargs, **overrides})

    def _failed_receipt(self):
        """A hand-entry row: failed, with a stored message that a rejected confirm must preserve."""
        return self._receipt(state=ReceiptCapture.FAILED, result=None, error='scanner said no')

    def _payload(self, **overrides):
        payload = {
            'date': '2026-07-15',
            'description': 'Test expense',
            'type': 'expense',
            'amount': '50.00',
            'account_id': self.account.id,
        }
        payload.update(overrides)
        return payload

    def _confirm(self, receipt, payload=None, **headers):
        return self.post(
            f'/api/receipts/{receipt.id}/confirm',
            payload or self._payload(),
            **{**self.auth_headers(), **headers},
        )

    def _attachment(self, transaction_id):
        return TransactionAttachment.objects.get(transaction_id=transaction_id)

    def _assert_rejected(self, receipt, data, code):
        """A rejected confirm leaves nothing behind: no transaction, no attachment, the row as it was."""
        before = (receipt.state, receipt.file_key, receipt.error)
        self.assertStatus(400)
        self.assertEqual(data['code'], code)
        self.assertEqual(Transaction.objects.count(), 0)
        self.assertEqual(TransactionAttachment.objects.count(), 0)
        receipt.refresh_from_db()
        self.assertEqual((receipt.state, receipt.file_key, receipt.error), before)

    def test_confirm_from_ready_creates_transaction_and_attachment(self):
        receipt = self._receipt()
        key = receipt.file_key
        metadata = (receipt.filename, receipt.content_type, receipt.size)
        data = self._confirm(receipt)
        self.assertStatus(201)
        self.assertEqual(Transaction.objects.count(), 1)
        trans = Transaction.objects.get(id=data['id'])
        self.assertEqual(TransactionAttachment.objects.count(), 1)
        attachment = self._attachment(trans.id)
        self.assertEqual(attachment.file_key, key)
        self.assertEqual((attachment.filename, attachment.content_type, attachment.size), metadata)
        self.assertEqual(attachment.extraction_status, 'done')
        self.assertEqual(attachment.extraction_result, self.RESULT)
        self.assertEqual(attachment.extraction_error, '')
        receipt.refresh_from_db()
        self.assertEqual(
            (receipt.state, receipt.file_key, receipt.transaction_id, receipt.error), ('saved', '', trans.id, '')
        )
        self.assertEqual(receipt.updated_by_id, self.user.id)

    def test_confirm_attachment_uploader_is_the_receipt_uploader(self):
        uploader = UserFactory(email='uploader@example.com', current_workspace=self.workspace)
        receipt = self._receipt(created_by=uploader)
        data = self._confirm(receipt)
        self.assertStatus(201)
        self.assertEqual(self._attachment(data['id']).uploaded_by_id, uploader.id)
        self.assertEqual(Transaction.objects.get(id=data['id']).created_by_id, self.user.id)
        receipt.refresh_from_db()
        # The confirmer saved the receipt; the uploader only took the photo.
        self.assertEqual(receipt.updated_by_id, self.user.id)

    def test_confirm_from_unread_states_marks_extraction_none(self):
        """queued, reading and waiting rows carry no result; hand entry still saves them."""
        for state in (ReceiptCapture.QUEUED, ReceiptCapture.READING, ReceiptCapture.WAITING):
            with self.subTest(state=state):
                data = self._confirm(self._receipt(state=state, result=None))
                self.assertStatus(201)
                attachment = self._attachment(data['id'])
                self.assertEqual(
                    (attachment.extraction_status, attachment.extraction_result, attachment.extraction_error),
                    ('none', None, ''),
                )

    def test_confirm_from_failed_hand_entry_keeps_the_error_on_the_attachment(self):
        receipt = self._failed_receipt()
        data = self._confirm(receipt, self._payload(description='Hand entered'))
        self.assertStatus(201)
        attachment = self._attachment(data['id'])
        self.assertEqual(
            (attachment.extraction_status, attachment.extraction_result, attachment.extraction_error),
            ('failed', None, 'scanner said no'),
        )
        receipt.refresh_from_db()
        self.assertEqual((receipt.state, receipt.file_key, receipt.error), ('saved', '', ''))

    def test_confirm_persists_items_with_an_inheriting_remainder(self):
        receipt = self._receipt()
        items = [
            {'name': 'Bread', 'line_total': '4.99'},
            {'name': 'Milk', 'quantity': '2', 'unit_price': '3.99', 'line_total': '7.98'},
        ]
        data = self._confirm(receipt, self._payload(items=items))
        self.assertStatus(201)
        rows = TransactionItem.objects.filter(transaction_id=data['id']).order_by('position')
        self.assertEqual(
            list(rows.values_list('name', 'line_total', 'is_remainder', 'category_id')),
            [
                ('Bread', Decimal('4.99'), False, None),
                ('Milk', Decimal('7.98'), False, None),
                ('', Decimal('37.03'), True, None),
            ],
        )

    def test_confirm_applies_remainder_category(self):
        receipt = self._receipt()
        payload = self._payload(
            category_id=self.groceries.id,
            items=[{'name': 'Bread', 'line_total': '4.99'}],
            remainder_category_id=self.household.id,
        )
        data = self._confirm(receipt, payload)
        self.assertStatus(201)
        rows = list(TransactionItem.objects.filter(transaction_id=data['id']).order_by('position'))
        self.assertEqual(
            [(r.name, r.is_remainder, r.category_id) for r in rows],
            [('Bread', False, None), ('', True, self.household.id)],
        )
        self.assertEqual(rows[1].line_total, Decimal('45.01'))

    def test_confirm_over_sum_items_is_rejected_and_rolls_back(self):
        receipt = self._failed_receipt()
        data = self._confirm(receipt, self._payload(items=[{'name': 'X', 'line_total': '999.99'}]))
        self._assert_rejected(receipt, data, 'items_over_sum')

    def test_confirm_unknown_category_is_rejected_and_rolls_back(self):
        receipt = self._failed_receipt()
        data = self._confirm(receipt, self._payload(category_id=999999))
        self._assert_rejected(receipt, data, 'category_not_found')

    def test_confirm_unknown_remainder_category_is_rejected_and_rolls_back(self):
        # Fails inside replace_items, after the transaction row was written: the
        # clearest proof that the whole confirm rolls back.
        receipt = self._failed_receipt()
        data = self._confirm(receipt, self._payload(category_id=self.groceries.id, remainder_category_id=999999))
        self._assert_rejected(receipt, data, 'category_not_found')

    def test_confirm_twice_returns_the_one_transaction(self):
        receipt = self._receipt()
        first = self._confirm(receipt)
        self.assertStatus(201)
        second = self._confirm(receipt)
        self.assertStatus(201)
        self.assertEqual(second['id'], first['id'])
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(TransactionAttachment.objects.count(), 1)

    def test_confirm_twice_with_the_same_key_returns_the_one_transaction(self):
        receipt = self._receipt()
        headers = {'HTTP_IDEMPOTENCY_KEY': 'confirm-once'}
        first = self._confirm(receipt, **headers)
        self.assertStatus(201)
        second = self._confirm(receipt, **headers)
        self.assertStatus(201)
        self.assertEqual(second['id'], first['id'])
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(TransactionAttachment.objects.count(), 1)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 1)

    def test_confirm_with_a_key_owned_by_another_receipt_leaves_this_one_open(self):
        first, second = self._receipt(), self._receipt()
        key = second.file_key
        headers = {'HTTP_IDEMPOTENCY_KEY': 'reused-key'}
        first_data = self._confirm(first, **headers)
        self.assertStatus(201)
        second_data = self._confirm(second, **headers)
        self.assertStatus(201)
        self.assertEqual(second_data['id'], first_data['id'])
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 1)
        self.assertEqual(TransactionAttachment.objects.count(), 1)
        self.assertEqual(TransactionAttachment.objects.get().file_key, first.file_key)
        second.refresh_from_db()
        self.assertEqual((second.state, second.file_key, second.transaction_id), (ReceiptCapture.READY, key, None))

    def test_confirm_losing_a_key_race_leaves_this_receipt_open(self):
        """The helper's race-loss branch returns the winner's transaction; this
        receipt must not be attached to it (forced through the lookup seam)."""
        first, second = self._receipt(), self._receipt()
        key = second.file_key
        headers = {'HTTP_IDEMPOTENCY_KEY': 'raced-key'}
        winner = self._confirm(first, **headers)
        self.assertStatus(201)
        record = TransactionIdempotencyKey.objects.get(key='raced-key')
        # Three lookups, in order: confirm's replay guard, the helper's lookup before
        # its insert, and the helper's re-read after the unique constraint rejects it.
        # A list side effect returns its items as they are: the third is the record.
        with mock.patch.object(TransactionService, '_lookup_idempotency_key', side_effect=[None, None, record]):
            data = self._confirm(second, **headers)
        self.assertStatus(201)
        self.assertEqual(data['id'], winner['id'])
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(TransactionIdempotencyKey.objects.count(), 1)
        self.assertEqual(TransactionAttachment.objects.filter(transaction_id=winner['id']).count(), 1)
        self.assertEqual(
            list(ReceiptCapture.objects.filter(transaction_id=winner['id']).values_list('id', flat=True)),
            [first.id],
        )
        second.refresh_from_db()
        self.assertEqual((second.state, second.file_key, second.transaction_id), (ReceiptCapture.READY, key, None))

    def test_confirm_with_too_long_key_returns_400(self):
        receipt = self._receipt()
        data = self._confirm(receipt, **{'HTTP_IDEMPOTENCY_KEY': 'x' * 101})
        self.assertStatus(400)
        self.assertIn('detail', data)
        self.assertEqual(Transaction.objects.count(), 0)
        receipt.refresh_from_db()
        self.assertEqual(receipt.state, ReceiptCapture.READY)

    def test_confirm_never_touches_storage(self):
        """The object keeps its key: no copy and no delete on a save, a replay or a rejected payload."""
        self.storage.reset_mock()
        saved = self._receipt()
        self._confirm(saved)
        self.assertStatus(201)
        self._confirm(saved)
        self.assertStatus(201)
        self._confirm(self._receipt(), self._payload(category_id=999999))
        self.assertStatus(400)
        self.storage.save_file.assert_not_called()
        self.storage.delete_file.assert_not_called()

    def test_confirm_other_workspace_receipt_returns_404(self):
        self._confirm(ReceiptCaptureFactory())
        self.assertStatus(404)
        self.assertEqual(Transaction.objects.count(), 0)

    def test_confirm_as_viewer_returns_403(self):
        WorkspaceMember.objects.filter(user=self.user).update(role='viewer')
        self._confirm(self._receipt())
        self.assertStatus(403)
        self.assertEqual(Transaction.objects.count(), 0)
