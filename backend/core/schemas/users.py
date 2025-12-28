"""User-related schemas."""

from django.core.validators import EmailValidator
from django.core.validators import ValidationError as DjangoValidationError
from pydantic import BaseModel, field_validator


class UserBase(BaseModel):
    """User base schema."""

    email: str
    full_name: str | None = None


class UserOut(BaseModel):
    """User output schema."""

    id: int
    email: str
    full_name: str | None = None
    current_workspace_id: int | None = None
    is_active: bool
    created_at: str


class UserUpdate(BaseModel):
    """User update schema."""

    email: str | None = None
    full_name: str | None = None
    is_active: bool | None = None

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        """Validate email format using Django's email validator."""
        if v is not None:
            validator = EmailValidator()
            try:
                validator(v)
            except DjangoValidationError:
                raise ValueError('Enter a valid email address')
        return v
