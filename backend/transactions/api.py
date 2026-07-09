"""Django-Ninja API endpoints for transactions app."""

import json
from datetime import date
from decimal import Decimal

from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.files import UploadedFile

from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from common.throttle import validate_file_size
from core.schemas.common import DetailOut
from core.schemas.pagination import PaginatedOut
from transactions import parser_client
from transactions.attachments import MAX_ATTACHMENT_SIZE_MB, AttachmentService
from transactions.schemas import (
    ExtractionConfigOut,
    ExtractionResultOut,
    FrequentDescriptionsResponse,
    TransactionAttachmentOut,
    TransactionBulkAccountIn,
    TransactionBulkAccountOut,
    TransactionCreate,
    TransactionItemsOut,
    TransactionItemsReplace,
    TransactionOut,
    TransactionTotalsResponse,
)
from transactions.services import TransactionService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Transactions'])

ORDERING_PATTERN = r'^(-?(date|description|amount|type|category__name|account__name|account__currency__code))$'


@router.get('', response=PaginatedOut[TransactionOut], auth=WorkspaceJWTAuth())
def list_transactions(
    request: HttpRequest,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    account_id: int | None = Query(None),
    category_id: list[int] | None = Query(None),
    budget_id: int | None = Query(None),
    transaction_type: list[str] | None = Query(None),
    search: str | None = Query(None),
    amount_gte: Decimal | None = Query(None),
    amount_lte: Decimal | None = Query(None),
    ordering: str | None = Query(None, pattern=ORDERING_PATTERN),
    page: int = Query(1, ge=1),
    page_size: int = Query(25),
):
    """List transactions for the current workspace with optional filters."""
    workspace_id = request.auth.current_workspace_id
    return TransactionService.list(
        workspace_id=workspace_id,
        date_from=date_from,
        date_to=date_to,
        account_id=account_id,
        category_id=category_id,
        budget_id=budget_id,
        transaction_type=transaction_type,
        search=search,
        amount_gte=amount_gte,
        amount_lte=amount_lte,
        ordering=ordering,
        page=page,
        page_size=page_size,
    )


@router.get('/totals', response=TransactionTotalsResponse, auth=WorkspaceJWTAuth())
def get_transaction_totals(
    request: HttpRequest,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    account_id: int | None = Query(None),
    category_id: list[int] | None = Query(None),
    budget_id: int | None = Query(None),
    transaction_type: list[str] | None = Query(None),
    search: str | None = Query(None),
    amount_gte: Decimal | None = Query(None),
    amount_lte: Decimal | None = Query(None),
    group_by: str = Query('type', pattern=r'^(type|category|type,category)$'),
):
    """Get aggregated transaction totals grouped by type or category (adjustments excluded)."""
    workspace_id = request.auth.current_workspace_id
    common_kwargs = dict(
        workspace_id=workspace_id,
        date_from=date_from,
        date_to=date_to,
        account_id=account_id,
        category_id=category_id,
        budget_id=budget_id,
        transaction_type=transaction_type,
        search=search,
        amount_gte=amount_gte,
        amount_lte=amount_lte,
    )
    if group_by == 'type,category':
        return TransactionService.totals_combined(**common_kwargs)
    totals = TransactionService.totals(**common_kwargs, group_by=group_by)
    return {'totals': totals}


@router.get('/export/', auth=WorkspaceJWTAuth())
def export_transactions(
    request: HttpRequest,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    transaction_type: str | None = Query(None, pattern=r'^(expense|income|adjustment)$'),
):
    """Export transactions in a date range as JSON."""
    workspace_id = request.auth.current_workspace_id
    export_data = TransactionService.export(workspace_id, date_from, date_to, transaction_type)
    response = HttpResponse(json.dumps(export_data, indent=2), content_type='application/json')
    response['Content-Disposition'] = 'attachment; filename=transactions_export.json'
    return response


@router.get('/frequent-descriptions', response=FrequentDescriptionsResponse, auth=WorkspaceJWTAuth())
def frequent_descriptions(
    request: HttpRequest,
    transaction_type: list[str] | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
):
    """Get the most frequent transaction descriptions grouped by description + currency."""
    workspace_id = request.auth.current_workspace_id
    return TransactionService.frequent_descriptions(
        workspace_id=workspace_id,
        transaction_type=transaction_type,
        limit=limit,
    )


@router.post('/import', response={201: dict, 400: dict, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def import_transactions(
    request: HttpRequest,
    account_id: int = Form(...),
    budget_id: int | None = Form(None),
    file: UploadedFile = File(...),
):
    """Import transactions from a JSON file into an account (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    validate_file_size(file, max_size_mb=5)

    try:
        data = json.loads(file.read())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return 400, {'detail': 'Invalid JSON file.'}

    count = TransactionService.import_data(user, workspace_id, account_id, data, budget_id)

    if count == 0:
        return 201, {'message': 'No new transactions to import.'}
    return 201, {'message': f'Successfully imported {count} new transactions.'}


@router.post(
    '/bulk-account',
    response={200: TransactionBulkAccountOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def bulk_set_account(request: HttpRequest, data: TransactionBulkAccountIn):
    """Reassign a set of transactions to another account (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    updated = TransactionService.bulk_set_account(user, workspace_id, data.transaction_ids, data.account_id)
    return {'updated': updated}


@router.get('/{transaction_id}', response={200: TransactionOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_transaction(request: HttpRequest, transaction_id: int):
    """Get a specific transaction by ID."""
    workspace_id = request.auth.current_workspace_id
    return TransactionService.get_transaction(transaction_id, workspace_id)


@router.post('', response={201: TransactionOut, 400: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def create_transaction(request: HttpRequest, data: TransactionCreate):
    """Create a new transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    trans = TransactionService.create(user, workspace_id, data)
    return 201, trans


@router.put(
    '/{transaction_id}', response={200: TransactionOut, 400: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def update_transaction(request: HttpRequest, transaction_id: int, data: TransactionCreate):
    """Update a transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return TransactionService.update(user, workspace_id, transaction_id, data)


@router.delete('/{transaction_id}', response={204: None, 404: DetailOut}, auth=WorkspaceJWTAuth())
def delete_transaction(request: HttpRequest, transaction_id: int):
    """Delete a transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    TransactionService.delete(workspace_id, transaction_id)
    return 204, None


@router.get('/{transaction_id}/items', response={200: TransactionItemsOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def list_transaction_items(request: HttpRequest, transaction_id: int):
    """List a transaction's line items with their sum (informational; amount stays authoritative)."""
    workspace_id = request.auth.current_workspace_id
    return TransactionService.list_items(workspace_id, transaction_id)


@router.put(
    '/{transaction_id}/items',
    response={200: TransactionItemsOut, 400: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def replace_transaction_items(request: HttpRequest, transaction_id: int, data: TransactionItemsReplace):
    """Replace the transaction's full ordered item list (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return TransactionService.replace_items(workspace_id, transaction_id, data.items)


@router.get(
    '/{transaction_id}/attachments',
    response={200: list[TransactionAttachmentOut], 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def list_transaction_attachments(request: HttpRequest, transaction_id: int):
    """List a transaction's attachments with short-lived download URLs."""
    workspace_id = request.auth.current_workspace_id
    trans = TransactionService.get_transaction(transaction_id, workspace_id)
    return AttachmentService.list_with_urls(trans)


@router.post(
    '/{transaction_id}/attachments',
    response={201: TransactionAttachmentOut, 400: DetailOut, 404: DetailOut, 503: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def upload_transaction_attachment(request: HttpRequest, transaction_id: int, file: UploadedFile = File(...)):
    """Attach a receipt image/PDF to a transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    validate_file_size(file, max_size_mb=MAX_ATTACHMENT_SIZE_MB)
    trans = TransactionService.get_transaction(transaction_id, workspace_id)
    attachment = AttachmentService.upload(user, trans, file)
    result = AttachmentService.list_with_urls(trans)
    created = next(a for a in result if a['id'] == attachment.id)
    return 201, created


@router.delete(
    '/{transaction_id}/attachments/{attachment_id}',
    response={204: None, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def delete_transaction_attachment(request: HttpRequest, transaction_id: int, attachment_id: int):
    """Delete an attachment and its stored file (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    trans = TransactionService.get_transaction(transaction_id, workspace_id)
    AttachmentService.delete(trans, attachment_id)
    return 204, None


@router.get('/extraction/config', response=ExtractionConfigOut, auth=WorkspaceJWTAuth())
def extraction_config(request: HttpRequest):
    """Report whether receipt extraction is configured (drives UI affordance visibility)."""
    return ExtractionConfigOut(enabled=parser_client.is_enabled())


@router.post(
    '/{transaction_id}/attachments/{attachment_id}/extract',
    response={202: ExtractionResultOut, 400: DetailOut, 404: DetailOut, 503: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def extract_attachment(request: HttpRequest, transaction_id: int, attachment_id: int):
    """Queue receipt extraction for an attachment (requires write access + configured parser)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    if not parser_client.is_enabled():
        return 503, {'detail': 'Receipt extraction is not configured.'}
    trans = TransactionService.get_transaction(transaction_id, workspace_id)
    attachment = AttachmentService.get_attachment(trans, attachment_id)
    AttachmentService.dispatch_extraction(attachment)
    return 202, ExtractionResultOut(status=attachment.extraction_status, error='', result=None)


@router.get(
    '/{transaction_id}/attachments/{attachment_id}/extraction',
    response={200: ExtractionResultOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def get_extraction(request: HttpRequest, transaction_id: int, attachment_id: int):
    """Poll extraction state and fetch the parser result when done."""
    workspace_id = request.auth.current_workspace_id
    trans = TransactionService.get_transaction(transaction_id, workspace_id)
    attachment = AttachmentService.get_attachment(trans, attachment_id)
    return ExtractionResultOut(
        status=attachment.extraction_status,
        error=attachment.extraction_error,
        result=attachment.extraction_result,
    )
