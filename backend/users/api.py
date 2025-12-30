"""Django-Ninja API endpoints for user management."""

from ninja import Router

from common.auth import JWTAuth, user_to_schema
from core.schemas import DetailOut, MessageOut, UserOut, UserPasswordUpdate, UserUpdate

router = Router(tags=['Users'])


@router.get('/me', auth=JWTAuth(), response={200: UserOut, 401: DetailOut})
def get_me(request):
    """Get current authenticated user's information."""
    return 200, user_to_schema(request.auth)


@router.patch('/me', auth=JWTAuth(), response={200: UserOut, 401: DetailOut})
def update_me(request, data: UserUpdate):
    """Update current user's profile information."""
    user = request.auth

    if data.email is not None:
        user.email = data.email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.is_active is not None:
        user.is_active = data.is_active

    user.save()

    return 200, user_to_schema(user)


@router.put('/me/password', auth=JWTAuth(), response={200: MessageOut, 401: DetailOut})
def update_my_password(request, data: UserPasswordUpdate):
    """
    Change current user's password.

    User must provide current password to set new password.
    """
    user = request.auth

    if not user.check_password(data.current_password):
        return 401, {'detail': 'Invalid current password'}

    user.set_password(data.new_password)
    user.save()

    return 200, {'message': 'Password updated successfully'}
