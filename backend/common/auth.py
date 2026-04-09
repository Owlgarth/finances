"""JWT authentication utilities for Django-Ninja API."""

import datetime
import uuid

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from ninja.errors import HttpError
from ninja.security import HttpBearer

from core.schemas import UserOut

User = get_user_model()


class JWTAuth(HttpBearer):
    """JWT authentication for Django-Ninja."""

    def authenticate(self, request, token: str) -> User | None:
        """Authenticate request using JWT token."""
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            if payload.get('type') == '2fa_pending':
                return None
            user_id = payload.get('user_id')
            if user_id is None:
                return None
            user = User.objects.get(id=user_id)
            if not user.is_active:
                return None
            return user
        except (jwt.PyJWTError, User.DoesNotExist):
            return None


class WorkspaceJWTAuth(JWTAuth):
    """
    Same JWT validation as JWTAuth, but additionally requires the user
    to have an active current_workspace. Use on all workspace-scoped endpoints.
    Returns 400 (not 401) because the token is valid — the workspace state is missing.
    """

    def authenticate(self, request, token: str):
        from workspaces.models import WorkspaceMember

        user = super().authenticate(request, token)
        if user is None:
            return None
        if not user.current_workspace_id:
            raise HttpError(400, 'No active workspace. Please create or join a workspace.')
        try:
            member = WorkspaceMember.objects.get(workspace_id=user.current_workspace_id, user=user)
        except WorkspaceMember.DoesNotExist:
            raise HttpError(403, 'Not a member of this workspace')
        user._workspace_member_role = member.role
        return user


def create_access_token(user: User) -> str:
    """Create JWT access token for user."""
    now = datetime.datetime.now(datetime.timezone.utc)
    exp = now + datetime.timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        'user_id': str(user.id),
        'email': user.email,
        'current_workspace_id': str(user.current_workspace_id) if user.current_workspace_id else None,
        'iat': now.timestamp(),
        'exp': exp.timestamp(),
    }

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """Decode and validate access token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


def create_temp_token(user: User) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        'user_id': str(user.id),
        'type': '2fa_pending',
        'jti': str(uuid.uuid4()),
        'iat': now.timestamp(),
        'exp': (now + datetime.timedelta(minutes=5)).timestamp(),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_temp_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get('type') != '2fa_pending':
            return None
        return payload
    except jwt.PyJWTError:
        return None


def _ttl_from_exp(exp: float) -> int:
    """Return seconds remaining until the given Unix timestamp, minimum 0."""
    now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    remaining = int(exp - now)
    return max(remaining, 0)


def consume_temp_token(token: str) -> dict | None:
    """Decode a temp token and mark it as consumed via its JTI claim.

    Decodes the JWT, validates it's a 2FA temp token, then checks the
    Django cache for its JTI. If the JTI is already cached, the token
    was already used — returns None. Otherwise caches the JTI for the
    token's remaining lifetime (derived from the exp claim) and returns
    the payload.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None

    if payload.get('type') != '2fa_pending':
        return None

    jti = payload.get('jti')
    if not jti:
        return None

    cache_key = f'2fa_temp_token_used:{jti}'
    ttl = _ttl_from_exp(payload.get('exp', 0))
    if ttl == 0:
        return None

    if not cache.add(cache_key, True, ttl):
        return None
    return payload


def user_to_schema(user: User) -> UserOut:
    """Convert User model to UserOut schema."""
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        current_workspace_id=user.current_workspace_id if user.current_workspace_id else None,
        is_active=user.is_active,
        email_verified=user.email_verified,
        created_at=user.created_at.isoformat(),
    )
