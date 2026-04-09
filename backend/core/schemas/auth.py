"""Authentication and authorization schemas."""

from typing import Annotated

from django.core.validators import EmailValidator
from django.core.validators import ValidationError as DjangoValidationError
from pydantic import BaseModel, BeforeValidator, Field, field_validator


def _validate_email(v: str) -> str:
    v = v.lower().strip()
    validator = EmailValidator()
    try:
        validator(v)
    except DjangoValidationError:
        raise ValueError('Enter a valid email address')
    return v


ValidatedEmail = Annotated[str, BeforeValidator(_validate_email)]


class Token(BaseModel):
    """Token response schema."""

    access_token: str
    token_type: str = 'bearer'


class RefreshToken(BaseModel):
    """Refresh token response schema."""

    access_token: str
    refresh_token: str
    token_type: str = 'bearer'


class LoginIn(BaseModel):
    """User login input schema."""

    email: ValidatedEmail
    password: str


class RegisterIn(BaseModel):
    """User registration input schema."""

    email: ValidatedEmail
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None
    workspace_name: str
    accepted_terms_version: str = Field(..., description='Version of Terms of Service accepted')
    accepted_privacy_version: str = Field(..., description='Version of Privacy Policy accepted')

    @field_validator('accepted_terms_version')
    @classmethod
    def validate_terms_version(cls, v: str) -> str:
        from core.legal import get_terms

        required = get_terms()['version']
        if v != required:
            raise ValueError(f'Must accept current Terms of Service version ({required})')
        return v

    @field_validator('accepted_privacy_version')
    @classmethod
    def validate_privacy_version(cls, v: str) -> str:
        from core.legal import get_privacy

        required = get_privacy()['version']
        if v != required:
            raise ValueError(f'Must accept current Privacy Policy version ({required})')
        return v


class VerifyEmailIn(BaseModel):
    token: str


class ResendVerificationIn(BaseModel):
    email: ValidatedEmail


class ForgotPasswordIn(BaseModel):
    email: ValidatedEmail


class ResetPasswordIn(BaseModel):
    uidb64: str
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class EmailChangeRequestIn(BaseModel):
    password: str
    new_email: ValidatedEmail


class EmailChangeConfirmIn(BaseModel):
    token: str


class UserPasswordUpdate(BaseModel):
    """User password update schema."""

    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class LoginOut(BaseModel):
    access_token: str | None = None
    token_type: str = 'bearer'
    requires_2fa: bool = False
    temp_token: str | None = None


class Verify2FAIn(BaseModel):
    temp_token: str
    code: str = Field(min_length=6, max_length=9)


class TwoFAStatusOut(BaseModel):
    enabled: bool
    remaining_recovery_codes: int
    last_used_at: str | None = None


class TwoFASetupOut(BaseModel):
    qr_code_svg: str
    secret_key: str


class TwoFAVerifySetupIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class TwoFAVerifySetupOut(BaseModel):
    recovery_codes: list[str]


class TwoFADisableIn(BaseModel):
    password: str


class TwoFARegenerateIn(BaseModel):
    password: str


class TwoFARegenerateOut(BaseModel):
    recovery_codes: list[str]
