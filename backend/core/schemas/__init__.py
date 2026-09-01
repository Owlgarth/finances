"""Pydantic schemas for Django-Ninja API.

This module re-exports all schemas for backward compatibility.
Schemas are organized by domain in separate modules:
- auth: Token, LoginIn, RegisterIn, UserPasswordUpdate
- users: UserOut, UserUpdate
- common: MessageOut, ErrorOut, DetailOut
- consent: ConsentIn, ConsentOut
- gdpr: AccountDeleteIn, AccountDeleteCheckOut, AccountDeleteOut
"""

# =============================================================================
# Auth Schemas
# =============================================================================

from core.schemas.auth import (
    EmailChangeConfirmIn,
    EmailChangeRequestIn,
    ForgotPasswordIn,
    LoginIn,
    LoginOut,
    RefreshTokenIn,
    RegisterIn,
    ResendVerificationIn,
    ResetPasswordIn,
    Token,
    TwoFADisableIn,
    TwoFARegenerateIn,
    TwoFARegenerateOut,
    TwoFASetupOut,
    TwoFAStatusOut,
    TwoFAVerifySetupIn,
    TwoFAVerifySetupOut,
    UserPasswordUpdate,
    Verify2FAIn,
    VerifyEmailIn,
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
from core.schemas.gdpr import (
    AccountDeleteCheckOut,
    AccountDeleteIn,
    AccountDeleteOut,
    AccountResetIn,
    AccountResetOut,
    FullImportIn,
    ImportResultOut,
    LegacyImportIn,
    LegacyImportResultOut,
)

# =============================================================================
# User Schemas
# =============================================================================
from core.schemas.users import (
    UserOut,
    UserPreferencesOut,
    UserPreferencesUpdate,
    UserUpdate,
)

__all__ = [
    # Auth
    'Token',
    'RefreshTokenIn',
    'LoginIn',
    'LoginOut',
    'RegisterIn',
    'UserPasswordUpdate',
    'Verify2FAIn',
    'TwoFAStatusOut',
    'TwoFASetupOut',
    'TwoFAVerifySetupIn',
    'TwoFAVerifySetupOut',
    'TwoFADisableIn',
    'TwoFARegenerateIn',
    'TwoFARegenerateOut',
    'VerifyEmailIn',
    'ResendVerificationIn',
    'ForgotPasswordIn',
    'ResetPasswordIn',
    'EmailChangeRequestIn',
    'EmailChangeConfirmIn',
    # Users
    'UserOut',
    'UserUpdate',
    'UserPreferencesOut',
    'UserPreferencesUpdate',
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
    'AccountResetIn',
    'AccountResetOut',
    'FullImportIn',
    'ImportResultOut',
    'LegacyImportIn',
    'LegacyImportResultOut',
]
