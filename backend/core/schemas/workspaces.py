"""Workspace-related schemas.

These schemas are re-exported from the workspaces app for backward compatibility.
The actual implementations are in workspaces.schemas.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class WorkspaceOut(BaseModel):
    """Schema for workspace response - matches frontend Workspace interface."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    owner_id: Optional[int] = None
    created_at: datetime


class WorkspaceMemberOut(BaseModel):
    """Member information with user details returned in API responses - matches frontend WorkspaceMember interface."""

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


class WorkspaceMemberAdd(BaseModel):
    """Request to add a new member to workspace with direct account creation - matches frontend AddMemberRequest."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=255)
    role: str = Field(..., pattern=r'^(admin|member|viewer)$')
    full_name: Optional[str] = Field(None, max_length=100)


class MemberPasswordReset(BaseModel):
    """Request to reset a member's password (admin action)."""

    new_password: str = Field(..., min_length=8, max_length=255)
