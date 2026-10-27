"""Schemas for workspaces app."""

from datetime import datetime
from typing import Literal

from django.utils.translation import gettext as _
from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.schemas.auth import ValidatedEmail
from currencies.schemas import CurrencyCode


class WorkspaceUpdate(BaseModel):
    """Schema for updating a workspace."""

    name: str | None = Field(None, max_length=100)

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError(_('Name cannot be empty'))
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
    """Schema for creating a workspace.

    ``currency_codes`` wins when present: exactly those codes are enabled
    (first = primary/Main account currency), no silent extras. When absent
    (or null), ``currency_code`` is the primary and the service silently
    enables the DEFAULT_WORKSPACE_EXTRA_CURRENCIES alongside it.
    """

    name: str = Field(..., max_length=100)
    currency_code: str = Field(default='PLN', pattern=r'^[A-Z]{3,8}$')
    currency_codes: list[CurrencyCode] | None = Field(None, min_length=1, max_length=20)

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Name cannot be empty'))
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
            raise ValueError(_('Password cannot be blank'))
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


# --- Member settings (personal per-workspace page defaults) ---
#
# The enum sets are the pinned wire contract and mirror the frontend option
# arrays (Planned.tsx STATUS_OPTIONS/SORT_OPTIONS/view, Transactions.tsx
# TYPE_OPTIONS/SORT_OPTIONS). They are schema-level Literals - NOT
# service-validated registry sets like fonts/languages - because they are
# stable page-intrinsic vocabularies that change only in a coordinated
# deploy; UserWorkspaceSettingsService derives its read-side allowlists
# from these same aliases via typing.get_args, so each set is written once.

PlannedStatus = Literal['all', 'pending', 'done', 'cancelled']
PlannedView = Literal['planned', 'recurring']
RangePreset = Literal['month', 'week', 'year', 'all']
PlannedOrdering = Literal['planned_date', '-planned_date', '-amount', 'amount', 'name']
TransactionsOrdering = Literal['-date', 'date', '-amount', 'amount', 'description']
TransactionsTypeValue = Literal['income', 'expense', 'adjustment']


class PlannedSettingsOut(BaseModel):
    """Planned page defaults in the GET/PATCH response.

    Every facet is required (never defaulted) so a response built from a
    dict missing a key fails loudly - the full-shape, never-partial rule.
    """

    status: PlannedStatus | None
    range: RangePreset | None
    view: PlannedView | None
    ordering: PlannedOrdering | None


class TransactionsSettingsOut(BaseModel):
    """Transactions page defaults; type is a deduped non-empty list or null."""

    range: RangePreset | None
    type: list[TransactionsTypeValue] | None
    ordering: TransactionsOrdering | None


class TransfersSettingsOut(BaseModel):
    """Transfers page defaults (range only)."""

    range: RangePreset | None


class UserWorkspaceSettingsOut(BaseModel):
    """Full member-settings response shape (GET and PATCH both return it).

    Endpoints land in task 3; task 2's service returns the equivalent dict
    and this model re-validates it as defense in depth.
    """

    version: int
    planned: PlannedSettingsOut
    transactions: TransactionsSettingsOut
    transfers: TransfersSettingsOut


class PlannedSettingsUpdate(BaseModel):
    """PATCH body for the planned page: full-replace semantics.

    A facet omitted here resets to null (the service dumps the whole page
    model, not exclude_unset); null means "no preference" - the page falls
    back to its built-in. Unknown keys inside the page object are ignored
    (Pydantic default) and can never persist.
    """

    status: PlannedStatus | None = None
    range: RangePreset | None = None
    view: PlannedView | None = None
    ordering: PlannedOrdering | None = None


class TransactionsSettingsUpdate(BaseModel):
    """PATCH body for the transactions page: full-replace semantics."""

    range: RangePreset | None = None
    type: list[TransactionsTypeValue] | None = None
    ordering: TransactionsOrdering | None = None

    @field_validator('type', mode='before')
    @classmethod
    def normalize_type(cls, v):
        """Dedupe preserving first occurrence; empty list (and null) -> null.

        Deliberately does NOT drop unknown literals: an unknown value in a
        PATCH is a client bug and must 422 from the item Literal type.
        Silent garbage degradation is the READ side's job
        (UserWorkspaceSettingsService._types_or_none).
        """
        if isinstance(v, list):
            try:
                deduped = list(dict.fromkeys(v))
            except TypeError:
                # Unhashable member (object/array) - return it untouched so
                # the Literal item validation rejects it with 422, not 500.
                return v
            return deduped or None
        return v


class TransfersSettingsUpdate(BaseModel):
    """PATCH body for the transfers page: full-replace semantics."""

    range: RangePreset | None = None


class UserWorkspaceSettingsUpdate(BaseModel):
    """PATCH body: only the page keys being changed.

    Page-level exclude_unset via model_fields_set: an absent page key is
    untouched; a PRESENT page key replaces that page's whole sub-object
    (facets omitted inside it reset to null - each page model's own dump
    carries explicit None for them); an explicit null page value is a
    defensive no-op the client never sends.
    """

    planned: PlannedSettingsUpdate | None = None
    transactions: TransactionsSettingsUpdate | None = None
    transfers: TransfersSettingsUpdate | None = None
