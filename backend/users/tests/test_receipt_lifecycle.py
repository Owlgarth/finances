"""Receipt captures in the GDPR export/import and the deletion storage sweeps.

Storage is patched at transactions.attachments.StorageService (the attachment
tests' idiom). ReceiptService never imports StorageService: it reaches storage
only through AttachmentService, which looks the name up in that module.
"""

import base64
import uuid
from unittest import mock

from django.test import TestCase

from accounts.factories import AccountFactory
from common.tests.helpers import create_other_workspace
from common.tests.mixins import AuthMixin
from transactions.attachments import ALLOWED_CONTENT_TYPES, MAX_ATTACHMENT_SIZE_MB
from transactions.factories import ReceiptCaptureFactory, TransactionFactory
from transactions.models import ReceiptCapture
from transactions.receipts import normalize_merchant
from users.services import UserService
from workspaces.factories import WorkspaceMemberFactory
from workspaces.models import Workspace
from workspaces.services import WorkspaceService

PNG = b'\x89PNG fake image bytes'
JPEG = b'\xff\xd8\xff\xe0 fake image bytes'
# A cut-down parser contract document: only `merchant` matters to the import.
RESULT = {
    'merchant': 'Biedronka 4381',
    'total': '87.43',
    'date': '2026-11-02',
    'items': [{'name': 'Chleb wiejski 500g', 'quantity': '1', 'unit_price': '4.49', 'line_total': '4.49'}],
}


class ReceiptStorageMixin:
    """Patches storage the way the attachment tests do; the fake bucket is a dict keyed by file key."""

    def setUp(self):
        super().setUp()
        self.contents: dict[str, bytes] = {}
        patcher = mock.patch('transactions.attachments.StorageService')
        self.storage = patcher.start()
        self.addCleanup(patcher.stop)
        self.storage._is_enabled.return_value = True
        self.storage.save_file.side_effect = lambda bucket, key, content, content_type: key
        self.storage.get_file.side_effect = lambda bucket, key: self.contents.get(key)
        self.storage.delete_file.return_value = True

    def _key(self, workspace, content_type='image/png') -> str:
        return f'receipts/{workspace.id}/{uuid.uuid4().hex}{ALLOWED_CONTENT_TYPES[content_type]}'

    def _receipt(self, content=PNG, content_type='image/png', **overrides):
        """An open receipt in the AuthMixin workspace that owns a stored object."""
        fields = {
            'workspace': self.workspace,
            'created_by': self.user,
            'file_key': self._key(self.workspace, content_type),
            'filename': 'receipt' + ALLOWED_CONTENT_TYPES[content_type],
            'content_type': content_type,
            'size': len(content),
            'state': 'ready',
            'transaction': None,
        }
        fields.update(overrides)
        self.contents[fields['file_key']] = content
        return ReceiptCaptureFactory(**fields)

    def _saved_receipt(self, transaction):
        """A saved receipt: empty file_key, its file is the transaction's attachment."""
        return ReceiptCaptureFactory(
            workspace=self.workspace,
            created_by=self.user,
            file_key='',
            filename='saved.png',
            content_type='image/png',
            size=10,
            state='saved',
            transaction=transaction,
        )

    def _deleted_keys(self) -> set[str]:
        return {call.args[1] for call in self.storage.delete_file.call_args_list}

    def _saved_files(self) -> list[tuple[str, bytes, str]]:
        """One (key, content, content_type) tuple per storage write."""
        saved = []
        for call in self.storage.save_file.call_args_list:
            content_type = call.args[3] if len(call.args) > 3 else call.kwargs['content_type']
            saved.append((call.args[1], call.args[2], content_type))
        return saved


class ReceiptExportTests(ReceiptStorageMixin, AuthMixin, TestCase):
    """The v3 export's receipts section: open receipts with their files."""

    def _exported_receipts(self) -> list[dict]:
        data = UserService.export_all_data(self.user)
        section = next(ws for ws in data['workspaces'] if ws['workspace_id'] == self.workspace.id)
        return section['receipts']

    def test_export_carries_open_receipts_with_content_and_result(self):
        ready = self._receipt(result=RESULT)
        waiting = self._receipt(content=JPEG, content_type='image/jpeg', state='waiting')

        receipts = self._exported_receipts()

        self.assertEqual([r['filename'] for r in receipts], [ready.filename, waiting.filename])
        self.assertEqual(set(receipts[0]), {'filename', 'content_type', 'size', 'result', 'content_b64'})
        self.assertEqual(receipts[0]['content_type'], 'image/png')
        self.assertEqual(receipts[0]['size'], len(PNG))
        self.assertEqual(receipts[0]['result'], RESULT)
        self.assertEqual(receipts[0]['content_b64'], base64.b64encode(PNG).decode('ascii'))
        self.assertEqual(receipts[1]['content_b64'], base64.b64encode(JPEG).decode('ascii'))

    def test_export_content_is_none_when_storage_is_off_or_object_is_gone(self):
        present = self._receipt()
        gone = self._receipt(content=JPEG, content_type='image/jpeg')
        del self.contents[gone.file_key]

        receipts = self._exported_receipts()

        self.assertIsNone(receipts[1]['content_b64'])
        self.assertEqual(receipts[1]['filename'], gone.filename)
        self.assertEqual(receipts[0]['content_b64'], base64.b64encode(PNG).decode('ascii'))

        self.storage.get_file.reset_mock()
        self.storage._is_enabled.return_value = False
        receipts = self._exported_receipts()

        self.assertEqual([r['content_b64'] for r in receipts], [None, None])
        self.assertEqual([r['filename'] for r in receipts], [present.filename, gone.filename])
        self.storage.get_file.assert_not_called()

    def test_export_excludes_saved_receipts(self):
        trans = TransactionFactory(account=AccountFactory(workspace=self.workspace), workspace=self.workspace)
        self._saved_receipt(trans)
        open_receipt = self._receipt()

        receipts = self._exported_receipts()

        self.assertEqual([r['filename'] for r in receipts], [open_receipt.filename])

    def test_export_emits_empty_list_when_there_are_none(self):
        self.assertEqual(self._exported_receipts(), [])
        self.storage.get_file.assert_not_called()


class ReceiptImportTests(ReceiptStorageMixin, AuthMixin, TestCase):
    """The v3 import's receipts section: restore, skip, tolerate older files."""

    def _import(self, export):
        from core.schemas import FullImportIn

        return UserService.import_all_data(self.user, FullImportIn(data=export))

    def _v3(self, **ws_extra):
        ws = {'workspace_name': 'Imported Workspace', 'enabled_currencies': [], 'accounts': [], 'budgets': []}
        ws.update(ws_extra)
        return {'export_version': '3.0', 'workspaces': [ws]}

    def _imported_workspace(self) -> Workspace:
        return Workspace.objects.get(owner=self.user, name='Imported Workspace')

    @staticmethod
    def _entry(filename='receipt.png', content=PNG, content_type='image/png', **extra) -> dict:
        entry = {
            'filename': filename,
            'content_type': content_type,
            'size': len(content) if content is not None else 0,
            'result': None,
            'content_b64': base64.b64encode(content).decode('ascii') if content is not None else None,
        }
        entry.update(extra)
        return entry

    def test_round_trip_restores_ready_and_waiting_receipts(self):
        self._receipt(result=RESULT)
        self._receipt(content=JPEG, content_type='image/jpeg', state='waiting')
        export = UserService.export_all_data(self.user)
        export['workspaces'][0]['workspace_name'] = 'Imported Workspace'

        result = self._import(export)

        self.assertEqual(result['imported_receipts'], 2)
        self.assertEqual(result['skipped']['errors'], [])
        ws = self._imported_workspace()
        ready, waiting = ReceiptCapture.objects.for_workspace(ws.id).order_by('id')
        self.assertEqual((ready.state, waiting.state), ('ready', 'waiting'))
        self.assertEqual(ready.result, RESULT)
        self.assertEqual(ready.merchant_key, normalize_merchant(RESULT['merchant']))
        self.assertIsNotNone(ready.merchant_key)
        self.assertEqual((ready.filename, ready.content_type, ready.size), ('receipt.png', 'image/png', len(PNG)))
        self.assertEqual(ready.created_by, self.user)
        self.assertIsNone(ready.transaction)
        self.assertTrue(ready.file_key.startswith(f'receipts/{ws.id}/'))
        self.assertTrue(ready.file_key.endswith('.png'))
        self.assertFalse(waiting.merchant_key)
        self.assertEqual(
            self._saved_files(),
            [(ready.file_key, PNG, 'image/png'), (waiting.file_key, JPEG, 'image/jpeg')],
        )

    def test_import_skips_entries_without_content(self):
        no_key = self._entry(filename='no-key.png')
        del no_key['content_b64']
        export = self._v3(
            receipts=[
                self._entry(filename='no-bytes.png', content=None),
                no_key,
                self._entry(filename='kept.png'),
            ]
        )

        result = self._import(export)

        self.assertEqual(result['imported_receipts'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        ws = self._imported_workspace()
        rows = ReceiptCapture.objects.for_workspace(ws.id)
        self.assertEqual(list(rows.values_list('filename', flat=True)), ['kept.png'])
        self.assertEqual(len(self._saved_files()), 1)

    def test_import_tolerates_export_without_receipts_key(self):
        for export in (self._v3(), self._v3(receipts=None)):
            result = self._import(export)
            self.assertEqual(result['imported_receipts'], 0)
            self.assertEqual(result['skipped']['errors'], [])

        self.assertEqual(ReceiptCapture.objects.count(), 0)
        self.storage.save_file.assert_not_called()

    def test_import_skips_unusable_entries(self):
        over_cap = 'A' * (MAX_ATTACHMENT_SIZE_MB * 1024 * 1024 * 4 // 3 + 5)
        export = self._v3(
            receipts=[
                self._entry(filename='html.png', content_type='text/html'),
                self._entry(filename='corrupt.png', content_b64='not base64!!'),
                self._entry(filename='huge.png', content_b64=over_cap),
            ]
        )

        result = self._import(export)

        self.assertEqual(result['imported_receipts'], 0)
        self.assertEqual(result['skipped']['errors'], [])
        self.assertEqual(ReceiptCapture.objects.count(), 0)
        self.storage.save_file.assert_not_called()

    def test_import_skips_entry_when_storage_refuses_the_write(self):
        # save_file returning None makes store_file raise AttachmentStorageUnavailableError.
        self.storage.save_file.side_effect = None
        self.storage.save_file.return_value = None
        export = self._v3(receipts=[self._entry(filename='refused.png'), self._entry(filename='also-refused.png')])

        result = self._import(export)

        self.assertEqual(result['imported_receipts'], 0)
        self.assertEqual(result['imported_workspaces'], 1)
        self.assertEqual(result['skipped']['errors'], [])
        self.assertEqual(ReceiptCapture.objects.count(), 0)
        # The loop went on past the first refused write.
        self.assertEqual(self.storage.save_file.call_count, 2)


class ReceiptDeletionTests(ReceiptStorageMixin, AuthMixin, TestCase):
    """Deletion paths sweep receipt files before the rows cascade."""

    def _seed_owned_receipts(self) -> set[str]:
        """Two open receipts plus a saved one (no file of its own) in the owned workspace."""
        first = self._receipt()
        second = self._receipt(content=JPEG, content_type='image/jpeg')
        trans = TransactionFactory(account=AccountFactory(workspace=self.workspace), workspace=self.workspace)
        self._saved_receipt(trans)
        return {first.file_key, second.file_key}

    def test_delete_workspace_removes_receipt_objects_and_rows(self):
        owned_keys = self._seed_owned_receipts()
        other_ws, other_owner, _ = create_other_workspace(
            owner_email='owner@test.com', workspace_name='Other Workspace'
        )
        foreign = ReceiptCaptureFactory(
            workspace=other_ws,
            created_by=other_owner,
            file_key=self._key(other_ws, 'image/jpeg'),
            filename='foreign.jpg',
            content_type='image/jpeg',
            size=10,
            state='waiting',
        )
        workspace_id = self.workspace.id

        WorkspaceService.delete_workspace(user=self.user, workspace_id=workspace_id)

        self.assertEqual(self._deleted_keys(), owned_keys)
        self.assertFalse(ReceiptCapture.objects.filter(workspace_id=workspace_id).exists())
        self.assertTrue(ReceiptCapture.objects.filter(id=foreign.id).exists())

    def test_delete_account_removes_receipt_objects_and_rows(self):
        owned_keys = self._seed_owned_receipts()
        workspace_id = self.workspace.id

        UserService.delete_account(self.user, self.user_password)

        self.assertEqual(self._deleted_keys(), owned_keys)
        self.assertFalse(ReceiptCapture.objects.filter(workspace_id=workspace_id).exists())

    def test_reset_account_removes_receipt_objects_and_rows(self):
        owned_keys = self._seed_owned_receipts()
        workspace_id = self.workspace.id

        UserService.reset_account(self.user, self.user_password, 'Fresh Start')

        self.assertEqual(self._deleted_keys(), owned_keys)
        self.assertFalse(ReceiptCapture.objects.filter(workspace_id=workspace_id).exists())
        self.assertEqual(ReceiptCapture.objects.count(), 0)

    def test_receipt_in_shared_workspace_survives_uploaders_account_deletion(self):
        shared_ws, _, _ = create_other_workspace(owner_email='owner@test.com', workspace_name='Shared Workspace')
        WorkspaceMemberFactory(workspace=shared_ws, user=self.user, role='member')
        key = self._key(shared_ws)
        self.contents[key] = PNG
        receipt = ReceiptCaptureFactory(
            workspace=shared_ws,
            created_by=self.user,
            file_key=key,
            filename='shared.png',
            content_type='image/png',
            size=len(PNG),
            state='ready',
        )

        UserService.delete_account(self.user, self.user_password)

        receipt.refresh_from_db()
        self.assertIsNone(receipt.created_by)
        self.assertEqual(receipt.file_key, key)
        self.assertNotIn(key, self._deleted_keys())
        self.assertTrue(Workspace.objects.filter(id=shared_ws.id).exists())
