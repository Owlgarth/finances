"""Schemas for workspaces app."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.schemas.auth import CurrencyCode, ValidatedEmail
from currencies.schemas import DEFAULT_WORKSPACE_CURRENCIES


class WorkspaceUpdate(BaseModel):
    """Schema for updating a workspace."""

    name: str | None = Field(None, max_length=100)

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
    owner_id: int | None = None
    default_budget_id: int | None = None
    created_at: datetime
    user_role: str | None = None


class WorkspaceDefaultBudgetIn(BaseModel):
    """Request to set (or clear) the workspace's default budget."""

    budget_id: int | None = None


class WorkspaceCreate(BaseModel):
    """Schema for creating a workspace."""

    name: str = Field(..., max_length=100)
    currency_codes: list[CurrencyCode] = Field(
        default_factory=lambda: list(DEFAULT_WORKSPACE_CURRENCIES),
        min_length=1,
        max_length=20,
        description='Currencies to enable for the new workspace; the FIRST code becomes the Main account currency.',
    )

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()


class WorkspaceMemberAdd(BaseModel):
    """Request to add a new member to workspace with direct account creation.

    password is optional. For a new user: when provided it becomes their
    initial password (shared with them out-of-band); when omitted the new
    user instead receives a set-password link by email. When adding an
    existing user, password is ignored.
    """

    email: ValidatedEmail
    password: str | None = Field(None, min_length=8, max_length=255)
    role: str = Field(..., pattern=r'^(admin|member|viewer)$')
    full_name: str | None = Field(None, max_length=100)

    @field_validator('password')
    @classmethod
    def password_not_blank(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Password cannot be blank')
        return v


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
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime
