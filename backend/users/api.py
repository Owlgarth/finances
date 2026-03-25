"""Django-Ninja API endpoints for user management."""

from typing import Literal

from ninja import Router

from common.auth import JWTAuth, user_to_schema
from common.throttle import rate_limit
from common.utils import get_client_ip
from core.schemas import (
    AccountDeleteCheckOut,
    AccountDeleteIn,
    AccountDeleteOut,
    ConsentIn,
    ConsentOut,
    ConsentStatusOut,
    DetailOut,
    FullImportIn,
    ImportResultOut,
    MessageOut,
    UserOut,
    UserPasswordUpdate,
    UserPreferencesOut,
    UserPreferencesUpdate,
    UserUpdate,
)
from users import services

router = Router(tags=['Users'])

ConsentTypeLiteral = Literal['terms_of_service', 'privacy_policy']


@router.get('/me', auth=JWTAuth(), response={200: UserOut, 401: DetailOut})
def get_me(request):
    """Get current authenticated user's information."""
    return 200, user_to_schema(request.auth)


@router.patch('/me', auth=JWTAuth(), response={200: UserOut, 401: DetailOut})
def update_me(request, data: UserUpdate):
    """Update current user's profile information."""
    user = services.UserService.update_profile(request.auth, data)
    return 200, user_to_schema(user)


@router.put('/me/password', auth=JWTAuth(), response={200: MessageOut, 401: DetailOut})
def update_my_password(request, data: UserPasswordUpdate):
    """
    Change current user's password.

    User must provide current password to set new password.
    """
    services.UserService.change_password(request.auth, data.current_password, data.new_password)
    return 200, {'message': 'Password updated successfully'}


@router.get('/me/preferences', auth=JWTAuth(), response={200: UserPreferencesOut, 401: DetailOut})
def get_preferences(request):
    """Get current user's preferences."""
    preferences = services.UserService.get_or_create_preferences(request.auth)
    return 200, {'calendar_start_day': preferences.calendar_start_day, 'font_family': preferences.font_family}


@router.patch('/me/preferences', auth=JWTAuth(), response={200: UserPreferencesOut, 401: DetailOut})
def update_preferences(request, data: UserPreferencesUpdate):
    """Update current user's preferences."""
    preferences = services.UserService.update_preferences(request.auth, data)
    return 200, {'calendar_start_day': preferences.calendar_start_day, 'font_family': preferences.font_family}


@router.get('/me/consents', auth=JWTAuth(), response={200: list[ConsentOut]})
def list_consents(request):
    """List all active consents for the current user."""
    return 200, services.UserService.get_active_consents(request.auth)


@router.post('/me/consents', auth=JWTAuth(), response={201: ConsentOut})
def grant_consent(request, data: ConsentIn):
    """Record a new consent (e.g., after accepting updated terms)."""
    ip = get_client_ip(request)
    consent = services.UserService.record_consent(request.auth, data.consent_type, data.version, ip)
    return 201, consent


@router.get('/me/consent-status', auth=JWTAuth(), response={200: ConsentStatusOut})
def get_consent_status(request):
    """
    Check whether the user's active consents match the current document versions.

    Returns needs_reconsent=True when the user must re-accept updated terms or
    privacy policy before continuing to use the application.
    """
    return 200, services.UserService.get_consent_status(request.auth)


@router.delete('/me/consents/{consent_type}', auth=JWTAuth(), response={200: ConsentOut, 404: DetailOut})
def withdraw_consent(request, consent_type: ConsentTypeLiteral):
    """Withdraw consent of a specific type."""
    consent = services.UserService.withdraw_consent(request.auth, consent_type)
    return 200, consent


@router.get('/me/deletion-check', auth=JWTAuth(), response={200: AccountDeleteCheckOut})
def check_account_deletion(request):
    """
    Pre-check what would happen if the user deletes their account.

    Returns information about:
    - Whether deletion is possible (blocked if user owns shared workspaces)
    - Which workspaces would be deleted
    - How many records would be affected

    Use this to show a confirmation dialog before actual deletion.
    """
    result = services.UserService.check_deletion(request.auth)
    return 200, result


@router.delete('/me', auth=JWTAuth(), response={200: AccountDeleteOut, 400: DetailOut, 401: DetailOut})
def delete_account(request, data: AccountDeleteIn):
    """
    Permanently delete the user's account and all associated data.

    This action is IRREVERSIBLE. Requires password confirmation.

    Solo-owned workspaces are fully deleted. Memberships in other users'
    workspaces are removed (but the workspaces and their data remain).
    """
    result = services.UserService.delete_account(request.auth, data.password)
    return 200, {
        'message': 'Account and all associated data deleted successfully.',
        'deleted_workspaces': result['deleted_workspaces'],
    }


@router.get('/me/export', auth=JWTAuth())
@rate_limit('data_export', limit=3, period=3600)
def export_my_data(request):
    """
    Export all personal data as a JSON file (GDPR Articles 15 & 20).

    Downloads a comprehensive JSON file containing the user's profile,
    preferences, consent records, and all financial data across all workspaces.

    Rate limited to 3 exports per hour.
    """
    import json

    from django.http import HttpResponse

    from common.json_encoder import GDPREncoder

    export_data = services.UserService.export_all_data(request.auth)

    response = HttpResponse(
        json.dumps(export_data, indent=2, cls=GDPREncoder, ensure_ascii=False),
        content_type='application/json; charset=utf-8',
    )
    response['Content-Disposition'] = f'attachment; filename="monie_data_export_{request.auth.id}.json"'
    return response


@router.post('/me/import', auth=JWTAuth(), response={200: ImportResultOut, 400: DetailOut})
@rate_limit('data_import', limit=3, period=3600)
def import_my_data(request, data: FullImportIn):
    """
    Import all data from GDPR export.

    Restores workspaces, accounts, periods, and all financial records.
    Rate limited to 3 imports per hour.
    """
    result = services.UserService.import_all_data(request.auth, data)
    return 200, result
