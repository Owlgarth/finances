"""Public endpoints for legal documents (Terms of Service, Privacy Policy)."""

from ninja import Router
from pydantic import BaseModel

from core.legal import get_privacy, get_terms

router = Router(tags=['Legal'])


class LegalDocOut(BaseModel):
    version: str
    effective_date: str
    content: str


@router.get('/terms', response=LegalDocOut)
def legal_terms(request):
    """Return the current Terms of Service (version, effective date, markdown content)."""
    return get_terms()


@router.get('/privacy', response=LegalDocOut)
def legal_privacy(request):
    """Return the current Privacy Policy (version, effective date, markdown content)."""
    return get_privacy()
