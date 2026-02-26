"""Schemas for workspaces app."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class CurrencyCreate(BaseModel):
    """Schema for creating a currency."""

    name: str = Field(..., max_length=50)
    symbol: str = Field(..., min_length=3, max_length=3, pattern=r'^[A-Z]{3}$')

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()


class CurrencyOut(BaseModel):
    """Schema for currency response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    symbol: str
    created_at: datetime


class WorkspaceUpdate(BaseModel):
    """Schema for updating a workspace."""

    name: Optional[str] = Field(None, max_length=100)

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip() if v is not None else v


class WorkspaceOut(BaseModel):
    """Schema for workspace response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    owner_id: Optional[int] = None
    created_at: datetime


class WorkspaceMemberAdd(BaseModel):
    """Request to add a new member to workspace with direct account creation."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=255)
    role: str = Field(..., pattern=r'^(admin|member|viewer)$')
    full_name: Optional[str] = Field(None, max_length=100)


class WorkspaceMemberRoleUpdate(BaseModel):
    """Request to update member's role."""

    role: str = Field(..., pattern=r'^(admin|member|viewer)$')


class MemberPasswordReset(BaseModel):
    """Request to reset a member's password (admin action)."""

    new_password: str = Field(..., min_length=8, max_length=255)


class WorkspaceMemberOut(BaseModel):
    """Member information with user details returned in API responses."""

    model_config = ConfigDict(
        from_attributes=True,
        arbitrary_types_allowed=True,
    )

    id: int
    workspace_id: int
    user_id: int
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
