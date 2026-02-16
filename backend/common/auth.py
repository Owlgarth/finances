"""JWT authentication utilities for Django-Ninja API."""

import datetime
from typing import Optional

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from ninja.security import HttpBearer

from core.schemas import UserOut
from workspaces.models import ROLE_HIERARCHY, Role

User = get_user_model()


class JWTAuth(HttpBearer):
    """JWT authentication for Django-Ninja."""

    def authenticate(self, request, token: str) -> Optional[User]:
        """Authenticate request using JWT token."""
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            user_id = payload.get('user_id')
            if user_id is None:
                return None
            user = User.objects.get(id=user_id)
            if not user.is_active:
                return None
            return user
        except (jwt.PyJWTError, User.DoesNotExist):
            return None


def create_access_token(user: User) -> str:
    """Create JWT access token for user."""
    now = datetime.datetime.now(datetime.timezone.utc)
    exp = now + datetime.timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        'user_id': str(user.id),
        'email': user.email,
        'current_workspace_id': str(user.current_workspace.id) if user.current_workspace else None,
        'iat': now.timestamp(),
        'exp': exp.timestamp(),
    }

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate access token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


def user_to_schema(user: User) -> UserOut:
    """Convert User model to UserOut schema."""
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        current_workspace_id=user.current_workspace.id if user.current_workspace else None,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
    )


def can_reset_password(admin_role: str, target_role: str, is_same_user: bool) -> bool:
    """
    Check if admin can reset password for target user.

    Rules:
    - Owner can reset: admin, member, viewer (NOT other owners or themselves)
    - Admin can reset: member, viewer (NOT other admins, owners, or themselves)
    - Cannot reset own password (use self-service endpoint)
    """
    if is_same_user:
        return False

    if admin_role not in ROLE_HIERARCHY or target_role not in ROLE_HIERARCHY:
        return False

    # Owner can reset admin, member, viewer
    if admin_role == Role.OWNER and target_role in (Role.ADMIN, Role.MEMBER, Role.VIEWER):
        return True

    # Admin can reset member, viewer
    if admin_role == Role.ADMIN and target_role in (Role.MEMBER, Role.VIEWER):
        return True

    return False
