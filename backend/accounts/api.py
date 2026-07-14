"""Django-Ninja API endpoints for the accounts app."""

from django.http import HttpRequest
from ninja import Query, Router

from accounts.schemas import AccountArchive, AccountBalanceOut, AccountCreate, AccountOut, AccountUpdate
from accounts.services import AccountService
from common.auth import WorkspaceJWTAuth
from common.permissions import require_role
from core.schemas.common import DetailOut
from workspaces.models import ADMIN_ROLES

router = Router(tags=['Accounts'])


@router.get('', response=list[AccountOut], auth=WorkspaceJWTAuth())
def list_accounts(request: HttpRequest, include_archived: bool = Query(False)):
    """List all accounts in the current workspace."""
    workspace_id = request.auth.current_workspace_id
    return AccountService.list(workspace_id, include_archived)


@router.get('/{account_id}', response={200: AccountOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_account(request: HttpRequest, account_id: int):
    """Get a specific account."""
    workspace_id = request.auth.current_workspace_id
    return AccountService.get(account_id, workspace_id)


@router.post('', response={201: AccountOut, 400: DetailOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def create_account(request: HttpRequest, data: AccountCreate):
    """Create a new account (requires owner or admin role)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return 201, AccountService.create(user, workspace_id, data)


@router.put(
    '/{account_id}', response={200: AccountOut, 400: DetailOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def update_account(request: HttpRequest, account_id: int, data: AccountUpdate):
    """Update an account (requires owner or admin role). Currency is immutable."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return AccountService.update(user, workspace_id, account_id, data)


@router.patch(
    '/{account_id}/archive', response={200: AccountOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def set_account_archive_status(request: HttpRequest, account_id: int, data: AccountArchive):
    """Archive or unarchive an account."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, ADMIN_ROLES)
    return AccountService.set_archive_status(user, workspace_id, account_id, data)


@router.delete(
    '/{account_id}', response={204: None, 400: DetailOut, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def delete_account(request: HttpRequest, account_id: int):
    """Delete an account with no records (requires owner or admin role)."""
    workspace_id = request.auth.current_workspace_id
    require_role(request.auth, workspace_id, ADMIN_ROLES)
    AccountService.delete(workspace_id, account_id)
    return 204, None


@router.get('/{account_id}/balance', response={200: AccountBalanceOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_account_balance(request: HttpRequest, account_id: int):
    """Get the computed balance of an account."""
    workspace_id = request.auth.current_workspace_id
    account = AccountService.get(account_id, workspace_id)
    return AccountBalanceOut(
        account_id=account.id,
        currency_code=account.currency.code,
        balance=AccountService.balance(account),
    )
