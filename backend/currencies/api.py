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


@router.get('/catalog', response=list[CurrencyCatalogOut])
def list_global_catalog(request: HttpRequest):
    """List the global currency catalog, without authentication.

    Public read-only endpoint for pre-auth screens (registration, workspace
    creation) that need the full ISO 4217 catalog before any workspace exists.
    Returns ONLY global rows (workspace__isnull=True); workspace-specific
    custom currencies are never exposed here.
    """
    return CurrencyCatalogService.list_global_catalog()
