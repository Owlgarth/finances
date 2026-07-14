"""Django-Ninja API endpoints for the currencies app."""

from django.http import HttpRequest
from ninja import Router

from common.auth import WorkspaceJWTAuth
from currencies.schemas import CurrencyCatalogOut
from currencies.services import CurrencyCatalogService

router = Router(tags=['Currencies'])


@router.get('', response=list[CurrencyCatalogOut], auth=WorkspaceJWTAuth())
def list_catalog(request: HttpRequest):
    """List the global currency catalog plus the current workspace's custom currencies."""
    return CurrencyCatalogService.list_catalog(request.auth.current_workspace_id)
