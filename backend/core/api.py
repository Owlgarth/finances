"""Django-Ninja API configuration and endpoints."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from ninja import NinjaAPI

from budget_accounts.models import BudgetAccount
from common.auth import JWTAuth, create_access_token, user_to_schema
from core.demo_fixtures import create_demo_fixtures
from core.schemas import (
    DetailOut,
    ErrorOut,
    LoginIn,
    MessageOut,
    RegisterIn,
    Token,
    UserOut,
    UserPasswordUpdate,
    UserUpdate,
)
from workspaces.models import Workspace, WorkspaceMember

api = NinjaAPI(title='Budget Tracker API', version='1.0.0')


# =============================================================================
# Auth Endpoints
# =============================================================================


@api.post('/auth/register', response={201: Token, 400: ErrorOut, 403: DetailOut}, tags=['Auth'])
def register(request, data: RegisterIn):
    """
    Register a new user with workspace and default data.

    Creates:
    - User account
    - Workspace with user as owner
    - Workspace membership
    - Default budget account
    - Demo data for the previous month

    Returns JWT token for automatic login.
    """
    if settings.DEMO_MODE:
        return 403, {'detail': 'Registration is disabled in demo mode'}

    if get_user_model().objects.filter(email=data.email).exists():
        return 400, {'error': 'User with this email already exists'}

    with transaction.atomic():
        # Create workspace
        workspace = Workspace.objects.create(name=data.workspace_name)

        # Create user
        user = get_user_model().objects.create_user(
            email=data.email,
            password=data.password,
            full_name=data.full_name,
            current_workspace=workspace,
        )

        # Update workspace owner
        workspace.owner = user
        workspace.save(update_fields=['owner'])

        # Create workspace membership with owner role
        WorkspaceMember.objects.create(
            workspace=workspace,
            user=user,
            role='owner',
        )

        # Create default budget account
        BudgetAccount.objects.create(
            workspace=workspace,
            name='General',
            description='General budget account',
            default_currency='PLN',
            is_active=True,
            display_order=0,
            created_by=user,
        )

        # Create demo fixtures (creates its own "Example Account")
        create_demo_fixtures(
            workspace_id=workspace.id,
            user_id=user.id,
        )

    # Generate JWT token for automatic login
    access_token = create_access_token(user)

    return 201, {
        'access_token': access_token,
        'token_type': 'bearer',
    }


@api.post('/auth/login', response={200: Token, 401: DetailOut}, tags=['Auth'])
def login(request, data: LoginIn):
    """
    Login user and return JWT token.

    The token includes:
    - user_id
    - email
    - current_workspace_id
    """
    User = get_user_model()
    try:
        user = User.objects.get(email=data.email)
    except User.DoesNotExist:
        return 401, {'detail': 'Invalid email or password'}

    if not user.check_password(data.password):
        return 401, {'detail': 'Invalid email or password'}

    if not user.is_active:
        return 401, {'detail': 'User account is disabled'}

    access_token = create_access_token(user)

    return 200, {
        'access_token': access_token,
        'token_type': 'bearer',
    }


@api.get('/auth/me', auth=JWTAuth(), response={200: UserOut, 401: DetailOut}, tags=['Auth'])
def get_me(request):
    """Get current authenticated user's information."""
    return 200, user_to_schema(request.auth)


@api.patch('/auth/me', auth=JWTAuth(), response={200: UserOut, 401: DetailOut}, tags=['Auth'])
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


@api.put('/auth/me/password', auth=JWTAuth(), response={200: MessageOut, 401: DetailOut}, tags=['Auth'])
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
