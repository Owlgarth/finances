"""Django-Ninja API endpoints for the transfers app."""

from datetime import date

from django.http import HttpRequest
from ninja import Query, Router

from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from core.schemas.common import DetailOut
from core.schemas.pagination import ALLOWED_PAGE_SIZES, PaginatedOut
from transfers.schemas import TransferCreate, TransferOut
from transfers.services import TransferService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Transfers'])

# Upper bound for page_size on list endpoints — derived from the pagination
# module's allowed sizes so the API cap stays in lockstep with the service layer.
MAX_PAGE_SIZE = max(ALLOWED_PAGE_SIZES)


@router.get('', response=PaginatedOut[TransferOut], auth=WorkspaceJWTAuth())
def list_transfers(
    request: HttpRequest,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    account_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
):
    """List transfers for the current workspace (account_id matches either side)."""
    workspace_id = request.auth.current_workspace_id
    return TransferService.list(
        workspace_id=workspace_id,
        date_from=date_from,
        date_to=date_to,
        account_id=account_id,
        page=page,
        page_size=page_size,
    )


@router.get('/{transfer_id}', response={200: TransferOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_transfer(request: HttpRequest, transfer_id: int):
    """Get a specific transfer by ID."""
    workspace_id = request.auth.current_workspace_id
    return TransferService.get(transfer_id, workspace_id)


@router.post('', response={201: TransferOut, 400: DetailOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def create_transfer(request: HttpRequest, data: TransferCreate):
    """Create a transfer between two accounts (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return 201, TransferService.create(user, workspace_id, data)


@router.put(
    '/{transfer_id}',
    response={200: TransferOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def update_transfer(request: HttpRequest, transfer_id: int, data: TransferCreate):
    """Update a transfer (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return TransferService.update(user, workspace_id, transfer_id, data)


@router.delete('/{transfer_id}', response={204: None, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def delete_transfer(request: HttpRequest, transfer_id: int):
    """Delete a transfer (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    TransferService.delete(workspace_id, transfer_id)
    return 204, None
