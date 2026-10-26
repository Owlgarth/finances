"""Pydantic schemas for the bookmarks API (endpoints land in task 3)."""

from typing import Annotated

from django.utils.translation import gettext as _
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

# One filter-param value: the pages write CSV lists inside a single string.
ParamValue = Annotated[str, Field(max_length=500)]

# Pinned params limits (design contract): at most 20 entries, each value at
# most 500 chars, at most 4000 serialized characters across keys + values -
# comfortably above every filter combination the transactions/planned pages
# can write into the URL query string.
PARAMS_MAX_ENTRIES = 20
PARAMS_MAX_TOTAL_LENGTH = 4000


class BookmarkCreate(BaseModel):
    """Schema for creating a bookmark.

    Target shape per kind: budget bookmarks carry budget_id + currency_code
    and no params; transactions/planned bookmarks carry params (possibly
    empty - a plain page link) and neither target field. Kind coherence and
    budget/currency resolution are validated in the service
    (BookmarkService._validate_target), not here.
    """

    kind: str = Field(..., pattern=r'^(budget|transactions|planned)$')
    name: str = Field(..., max_length=100)
    # Kebab-case lucide icon key (frontend registry), or null.
    icon: str | None = Field(None, max_length=50, pattern=r'^[a-z0-9-]+$')
    # Swatch KEY ('neutral', 'positive', ...), never a hex value: the pattern
    # rejects '#RRGGBB' by construction. The palette itself is frontend CSS
    # variables; the backend validates format only.
    color: str | None = Field(None, max_length=20, pattern=r'^[a-z][a-z0-9-]*$')
    budget_id: int | None = None
    # 3-char ISO code, matching the model column (CharField(3)). Deliberately
    # NOT the shared currencies CurrencyCode type, which allows custom 3-8
    # char codes this column cannot store.
    currency_code: str | None = Field(None, max_length=3, pattern=r'^[A-Z]{3}$')
    params: dict[str, ParamValue] = Field(default_factory=dict, max_length=PARAMS_MAX_ENTRIES)

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip()

    @model_validator(mode='after')
    def params_total_length(self):
        total = sum(len(key) + len(value) for key, value in self.params.items())
        if total > PARAMS_MAX_TOTAL_LENGTH:
            raise ValueError(_('params total length must not exceed 4000 characters'))
        return self


class BookmarkUpdate(BaseModel):
    """Schema for updating a bookmark: full replace of the editable fields.

    name is required; icon/color are direct-assignment fields, so an omitted
    key stores None (clears the field) - full-replace semantics, pinned by
    test. Target fields (kind, budget_id, currency_code, params, position)
    are NOT members of this schema: recreating the bookmark is the
    documented way to change the target.
    """

    name: str = Field(..., max_length=100)
    icon: str | None = Field(None, max_length=50, pattern=r'^[a-z0-9-]+$')
    color: str | None = Field(None, max_length=20, pattern=r'^[a-z][a-z0-9-]*$')

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip()


class BookmarkVisibility(BaseModel):
    """Partial visibility update: an omitted toggle is left unchanged."""

    is_active: bool | None = None
    is_archived: bool | None = None


class BookmarkMove(BaseModel):
    """Schema for moving a bookmark one slot (neighbor swap)."""

    direction: str = Field(..., pattern=r'^(up|down)$')


class BookmarkOut(BaseModel):
    """Schema for bookmark responses (flat; budget_name joined from the FK)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    name: str
    icon: str | None
    color: str | None
    position: int
    is_active: bool
    is_archived: bool
    budget_id: int | None
    # Reads the model's `budget` FK; the validator reduces it to its name
    # (CategoryBudgetOut currency_code precedent).
    budget_name: str | None = Field(None, validation_alias=AliasChoices('budget_name', 'budget'))
    currency_code: str | None
    params: dict[str, str]

    @field_validator('budget_name', mode='before')
    @classmethod
    def extract_budget_name(cls, value):
        if hasattr(value, 'name'):
            return value.name
        return value
