"""Authentication and authorization schemas."""

from django.core.validators import EmailValidator
from django.core.validators import ValidationError as DjangoValidationError
from pydantic import BaseModel, Field, field_validator


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

    email: str
    password: str

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        """Validate email format using Django's email validator."""
        validator = EmailValidator()
        try:
            validator(v)
        except DjangoValidationError:
            raise ValueError('Enter a valid email address')
        return v


class RegisterIn(BaseModel):
    """User registration input schema."""

    email: str
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

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        """Validate email format using Django's email validator."""
        validator = EmailValidator()
        try:
            validator(v)
        except DjangoValidationError:
            raise ValueError('Enter a valid email address')
        return v


class UserPasswordUpdate(BaseModel):
    """User password update schema."""

    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
