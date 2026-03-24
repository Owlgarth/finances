"""User-related schemas."""

from django.core.validators import EmailValidator
from django.core.validators import ValidationError as DjangoValidationError
from pydantic import BaseModel, field_validator

from users.models import FontChoices


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


class UserPreferencesOut(BaseModel):
    """User preferences output schema."""

    calendar_start_day: int
    font_family: str


class UserPreferencesUpdate(BaseModel):
    """User preferences update schema."""

    calendar_start_day: int | None = None
    font_family: str | None = None

    @field_validator('calendar_start_day')
    @classmethod
    def validate_calendar_start_day(cls, v: int | None) -> int | None:
        if v is not None and (v < 1 or v > 7):
            raise ValueError('calendar_start_day must be between 1 and 7')
        return v

    @field_validator('font_family')
    @classmethod
    def validate_font_family(cls, v: str | None) -> str | None:
        if v is not None:
            valid_fonts = [choice[0] for choice in FontChoices.choices]
            if v not in valid_fonts:
                raise ValueError(f'font_family must be one of: {", ".join(valid_fonts)}')
        return v
