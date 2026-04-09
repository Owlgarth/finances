"""Django-Ninja API endpoints for currency_exchanges app."""

import json

from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.files import UploadedFile

from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from common.throttle import validate_file_size
from core.schemas.common import DetailOut
from currency_exchanges.schemas import (
    CurrencyExchangeCreate,
    CurrencyExchangeOut,
    CurrencyExchangeUpdate,
)
from currency_exchanges.services import CurrencyExchangeService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Currency Exchanges'])


@router.get('', response=list[CurrencyExchangeOut], auth=WorkspaceJWTAuth())
def list_exchanges(
    request: HttpRequest,
    budget_period_id: int | None = Query(None),
):
    """List currency exchanges for the current workspace."""
    workspace_id = request.auth.current_workspace_id
    return CurrencyExchangeService.list(workspace_id, budget_period_id)


@router.post('', response={201: CurrencyExchangeOut, 400: DetailOut}, auth=WorkspaceJWTAuth())
def create_exchange(request: HttpRequest, data: CurrencyExchangeCreate):
    """Create a new currency exchange (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    exchange = CurrencyExchangeService.create(user, workspace_id, data)
    return 201, exchange


@router.get('/export/', auth=WorkspaceJWTAuth())
def export_exchanges(
    request: HttpRequest,
    budget_period_id: int = Query(...),
):
    """Export currency exchanges from a budget period to a JSON file."""
    workspace_id = request.auth.current_workspace_id
    export_data = CurrencyExchangeService.export(workspace_id, budget_period_id)
    response = HttpResponse(
        json.dumps(export_data, indent=2),
        content_type='application/json',
    )
    response['Content-Disposition'] = f'attachment; filename=currency_exchanges_export_{budget_period_id}.json'
    return response


@router.post('/import', response={201: dict, 400: dict}, auth=WorkspaceJWTAuth())
def import_exchanges(
    request: HttpRequest,
    budget_period_id: int = Form(...),
    file: UploadedFile = File(...),
):
    """Import currency exchanges from a JSON file into a budget period (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    validate_file_size(file, max_size_mb=5)

    try:
        data = json.loads(file.read())
    except json.JSONDecodeError:
        return 400, {'detail': 'Invalid JSON file.'}
    except Exception as e:
        return 400, {'detail': f'Invalid data format: {e}'}

    count = CurrencyExchangeService.import_data(user, workspace_id, budget_period_id, data)

    if count == 0:
        return 201, {'message': 'No new currency exchanges to import.'}
    return 201, {'message': f'Successfully imported {count} new currency exchanges.'}


@router.get('/{exchange_id}', response=CurrencyExchangeOut, auth=WorkspaceJWTAuth())
def get_exchange(request: HttpRequest, exchange_id: int):
    """Get a specific currency exchange."""
    workspace_id = request.auth.current_workspace_id
    return CurrencyExchangeService.get_exchange(exchange_id, workspace_id)


@router.put('/{exchange_id}', response=CurrencyExchangeOut, auth=WorkspaceJWTAuth())
def update_exchange(request: HttpRequest, exchange_id: int, data: CurrencyExchangeUpdate):
    """Update a currency exchange (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return CurrencyExchangeService.update(user, workspace_id, exchange_id, data)


@router.delete('/{exchange_id}', response={204: None}, auth=WorkspaceJWTAuth())
def delete_exchange(request: HttpRequest, exchange_id: int):
    """Delete a currency exchange (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    CurrencyExchangeService.delete(workspace_id, exchange_id)
    return 204, None
