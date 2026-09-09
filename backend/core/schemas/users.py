"""User-related schemas."""

from pydantic import BaseModel


class UserOut(BaseModel):
    """User output schema."""

    id: int
    email: str
    full_name: str | None = None
    current_workspace_id: int | None = None
    is_active: bool
    email_verified: bool = False
    created_at: str


class UserUpdate(BaseModel):
    """User update schema."""

    full_name: str | None = None
    is_active: bool | None = None


class UserPreferencesOut(BaseModel):
    """User preferences output schema."""

    calendar_start_day: int
    font_family: str
    language: str
    number_format: str


class UserPreferencesUpdate(BaseModel):
    """User preferences update schema.

    Plain optional fields: semantic validation (registry membership, weekday
    range) lives in UserService.update_preferences and raises a translated
    400; Pydantic still rejects wrong-typed payloads with 422.
    """

    calendar_start_day: int | None = None
    font_family: str | None = None
    language: str | None = None
    number_format: str | None = None
