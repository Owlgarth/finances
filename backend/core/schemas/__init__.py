"""Pydantic schemas for Django-Ninja API.

This module re-exports all schemas for backward compatibility.
Schemas are organized by domain in separate modules:
- auth: Token, LoginIn, RegisterIn, UserPasswordUpdate, RefreshToken
- users: UserBase, UserOut, UserUpdate
- workspaces: WorkspaceOut, WorkspaceMemberOut, WorkspaceMemberAdd, MemberPasswordReset
- common: MessageOut, ErrorOut, DetailOut
- consent: ConsentIn, ConsentOut
- gdpr: AccountDeleteIn, AccountDeleteCheckOut, AccountDeleteOut
"""

# =============================================================================
# Auth Schemas
# =============================================================================

from core.schemas.auth import (
    LoginIn,
    RefreshToken,
    RegisterIn,
    Token,
    UserPasswordUpdate,
)

# =============================================================================
# Common Schemas
# =============================================================================
from core.schemas.common import (
    DetailOut,
    ErrorOut,
    MessageOut,
)

# =============================================================================
# Consent Schemas
# =============================================================================
from core.schemas.consent import ConsentIn, ConsentOut, ConsentStatusOut

# =============================================================================
# GDPR Schemas
# =============================================================================
from core.schemas.gdpr import AccountDeleteCheckOut, AccountDeleteIn, AccountDeleteOut

# =============================================================================
# User Schemas
# =============================================================================
from core.schemas.users import (
    UserBase,
    UserOut,
    UserPreferencesOut,
    UserPreferencesUpdate,
    UserUpdate,
)

# =============================================================================
# Workspace Schemas
# =============================================================================
from core.schemas.workspaces import (
    MemberPasswordReset,
    WorkspaceMemberAdd,
    WorkspaceMemberOut,
    WorkspaceOut,
)

__all__ = [
    # Auth
    'Token',
    'RefreshToken',
    'LoginIn',
    'RegisterIn',
    'UserPasswordUpdate',
    # Users
    'UserBase',
    'UserOut',
    'UserUpdate',
    'UserPreferencesOut',
    'UserPreferencesUpdate',
    # Workspaces
    'WorkspaceOut',
    'WorkspaceMemberOut',
    'WorkspaceMemberAdd',
    'MemberPasswordReset',
    # Common
    'MessageOut',
    'ErrorOut',
    'DetailOut',
    # Consent
    'ConsentIn',
    'ConsentOut',
    'ConsentStatusOut',
    # GDPR
    'AccountDeleteIn',
    'AccountDeleteCheckOut',
    'AccountDeleteOut',
]
