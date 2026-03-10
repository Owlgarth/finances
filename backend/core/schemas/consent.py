"""Consent-related schemas for GDPR compliance."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class ConsentIn(BaseModel):
    """Input for granting consent."""

    consent_type: str
    version: str

    @field_validator('consent_type')
    @classmethod
    def validate_consent_type(cls, v: str) -> str:
        valid_types = ['terms_of_service', 'privacy_policy']
        if v not in valid_types:
            raise ValueError(f'consent_type must be one of: {", ".join(valid_types)}')
        return v


class ConsentOut(BaseModel):
    """Output for consent records."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    consent_type: str
    version: str
    granted_at: datetime
    withdrawn_at: datetime | None = None


class ConsentStatusOut(BaseModel):
    """Whether the user's active consents match the current document versions."""

    terms_current: bool
    privacy_current: bool
    terms_version_required: str
    privacy_version_required: str
    needs_reconsent: bool
