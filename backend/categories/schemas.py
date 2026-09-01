"""Pydantic schemas for categories."""

from datetime import datetime

from django.utils.translation import gettext as _
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CategoryCreate(BaseModel):
    """Schema for creating a category under a budget."""

    name: str = Field(..., max_length=100)

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip()


class CategoryUpdate(BaseModel):
    """Schema for renaming a category."""

    name: str | None = Field(None, max_length=100)

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip() if v is not None else v


class CategoryArchive(BaseModel):
    """Schema for archiving/unarchiving a category."""

    is_archived: bool


class CategoryMerge(BaseModel):
    """Schema for merging another category into this one."""

    source_category_id: int


class CategoryOut(BaseModel):
    """Schema for category response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    budget_id: int
    name: str
    is_archived: bool
    created_at: datetime
