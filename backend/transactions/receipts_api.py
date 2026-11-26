"""Receipts API endpoints: the stored receipts of a workspace (upload, list, detail, file, retry, delete)."""

from django.http import HttpRequest, HttpResponse
from ninja import File, Router, Status
from ninja.files import UploadedFile

from common.auth import WorkspaceJWTAuth
from common.idempotency import parse_idempotency_key
from common.permissions import require_role
from common.throttle import validate_file_size
from core.schemas.common import DetailOut
from transactions.attachments import MAX_ATTACHMENT_SIZE_MB, AttachmentService
from transactions.receipts import ReceiptService
from transactions.schemas import ReceiptConfirmIn, ReceiptDetailOut, ReceiptListOut, ReceiptOut, TransactionOut
from workspaces.models import WRITE_ROLES

router = Router(tags=['Receipts'])


@router.post('', response={201: ReceiptOut, 400: DetailOut, 403: DetailOut, 503: DetailOut}, auth=WorkspaceJWTAuth())
def upload_receipt(request: HttpRequest, file: UploadedFile = File(...)):
    """Store an uploaded receipt photo or PDF (requires write access).

    Never 503 for a parser that is unconfigured or offline: the file is stored
    first and read in the background. 503 means file storage is not configured.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    validate_file_size(file, max_size_mb=MAX_ATTACHMENT_SIZE_MB)
    receipt = ReceiptService.create_from_upload(user, workspace_id, file)
    return Status(201, ReceiptService.serialize(receipt))


@router.get('', response={200: ReceiptListOut, 403: DetailOut}, auth=WorkspaceJWTAuth())
def list_receipts(request: HttpRequest):
    """List the workspace's open receipts, newest first, with per-state counts (requires write access).

    Every row carries `possible_duplicate`, computed for all listed receipts in
    one extra query.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    receipts = list(ReceiptService.list_open(workspace_id))
    flagged = ReceiptService.possible_duplicate_ids(workspace_id, receipts)
    items = []
    for receipt in receipts:
        row = ReceiptService.serialize(receipt)
        row['possible_duplicate'] = receipt.id in flagged
        items.append(row)
    return {'items': items, 'counts': ReceiptService.counts(workspace_id)}


@router.get('/{receipt_id}', response={200: ReceiptDetailOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_receipt(request: HttpRequest, receipt_id: int):
    """Get one receipt, saved ones included: `transaction_id` says where it went (requires write access).

    A ready receipt that holds a result also carries `suggestions` (what the
    workspace's history suggests) and `duplicates` (the transactions it may
    already be, D18); every other receipt answers null suggestions and an
    empty duplicates list.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    receipt = ReceiptService.get(receipt_id, workspace_id)
    data = ReceiptService.serialize(receipt)
    duplicates = ReceiptService.duplicates(workspace_id, receipt)
    data['suggestions'] = ReceiptService.suggestions(workspace_id, receipt)
    data['duplicates'] = duplicates
    data['possible_duplicate'] = bool(duplicates)
    return data


@router.get('/{receipt_id}/file', response={403: DetailOut, 404: DetailOut, 503: DetailOut}, auth=WorkspaceJWTAuth())
def download_receipt_file(request: HttpRequest, receipt_id: int):
    """Download a receipt's stored file (requires write access).

    Returns a plain HttpResponse (no Ninja response schema) with the stored
    content type and Content-Disposition - mirrors download_transaction_attachment.
    Status codes: 200 file bytes, 404 receipt not found (code 'not_found'), file
    handed over to a transaction's attachment or object gone (code 'file_missing'),
    503 storage not configured.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    receipt, content = ReceiptService.download(workspace_id, receipt_id)
    response = HttpResponse(content, content_type=receipt.content_type)
    response['Content-Disposition'] = AttachmentService.content_disposition(receipt.filename)
    return response


@router.post('/{receipt_id}/retry', response={200: ReceiptOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def retry_receipt(request: HttpRequest, receipt_id: int):
    """Queue a receipt for another read and return it as it stands (requires write access).

    A saved receipt comes back unchanged. A parser that is not configured moves
    the receipt to `waiting` instead of queueing a read.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return ReceiptService.serialize(ReceiptService.retry(user, workspace_id, receipt_id))


@router.delete('/{receipt_id}', response={204: None, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def delete_receipt(request: HttpRequest, receipt_id: int):
    """Delete a receipt and the file it still owns (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    ReceiptService.delete(workspace_id, receipt_id)
    return Status(204, None)


@router.post(
    '/{receipt_id}/confirm',
    response={201: TransactionOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def confirm_receipt(request: HttpRequest, receipt_id: int, data: ReceiptConfirmIn):
    """Save a receipt as a transaction (requires write access).

    Works from every open state (hand entry when no read succeeded) and answers
    201 with the receipt's transaction again when it is already saved. An optional
    `Idempotency-Key` header dedups the create as on POST /transactions: a key that
    already belongs to an earlier request returns that request's transaction and
    leaves this receipt untouched.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    idempotency_key, error = parse_idempotency_key(request)
    if error:
        return Status(400, error)

    return Status(201, ReceiptService.confirm(user, workspace_id, receipt_id, data, idempotency_key=idempotency_key))
