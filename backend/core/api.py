"""Django-Ninja API endpoints for authentication (register, login)."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from ninja import Router

from budget_accounts.models import BudgetAccount
from common.auth import create_access_token
from common.throttle import rate_limit
from core.demo_fixtures import create_demo_fixtures
from core.schemas import DetailOut, ErrorOut, LoginIn, RegisterIn, Token
from workspaces.models import Workspace, WorkspaceMember

router = Router(tags=['Auth'])
User = get_user_model()


@router.post('/register', response={201: Token, 400: ErrorOut, 403: DetailOut, 429: DetailOut})
@rate_limit('register', limit=5, period=60)
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

    if User.objects.filter(email=data.email).exists():
        return 400, {'error': 'User with this email already exists'}

    with transaction.atomic():
        # Create workspace
        workspace = Workspace.objects.create(name=data.workspace_name)

        # Create user
        user = User.objects.create_user(
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


@router.post('/login', response={200: Token, 401: DetailOut, 429: DetailOut})
@rate_limit('login', limit=10, period=60)
def login(request, data: LoginIn):
    """
    Login user and return JWT token.

    The token includes:
    - user_id
    - email
    - current_workspace_id
    """
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
