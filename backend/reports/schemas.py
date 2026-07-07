"""Pydantic schemas for reports API."""

from decimal import Decimal

from pydantic import BaseModel

# Budget-summary schemas were deleted with the legacy allocation app in B4.
# Rebuilt in B8 on budgeting models.


class CurrentBalancesResponse(BaseModel):
    """Schema for current balances response."""

    balances: dict[str, Decimal]
