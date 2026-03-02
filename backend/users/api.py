"""Django-Ninja API endpoints for user management."""

from ninja import Router

from common.auth import JWTAuth, user_to_schema
from core.schemas import (
    DetailOut,
    MessageOut,
    UserOut,
    UserPasswordUpdate,
    UserPreferencesOut,
    UserPreferencesUpdate,
    UserUpdate,
)
from users import services

router = Router(tags=['Users'])


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
    return 200, {'calendar_start_day': preferences.calendar_start_day}


@router.patch('/me/preferences', auth=JWTAuth(), response={200: UserPreferencesOut, 401: DetailOut})
def update_preferences(request, data: UserPreferencesUpdate):
    """Update current user's preferences."""
    preferences = services.UserService.update_preferences(request.auth, data)
    return 200, {'calendar_start_day': preferences.calendar_start_day}
