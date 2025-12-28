"""Pydantic schemas for categories API."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CategoryCreate(BaseModel):
    """Schema for creating a category."""

    name: str = Field(..., max_length=100)
    budget_period_id: int


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""

    name: Optional[str] = Field(None, max_length=100)


class CategoryOut(BaseModel):
    """Schema for category response."""

    model_config = ConfigDict(
        from_attributes=True,
        arbitrary_types_allowed=True,
    )

    id: int
    budget_period_id: int
    name: str
    created_by: Optional[Any] = None
    updated_by: Optional[Any] = None
    created_at: datetime

    @field_validator('created_by', 'updated_by', mode='before')
    @classmethod
    def validate_user_id(cls, value: Any) -> Optional[int]:
        """Extract user ID from Django User ForeignKey field."""
        if value is None:
            return None
        if hasattr(value, 'id'):
            return value.id
        if isinstance(value, int):
            return value
        return None
