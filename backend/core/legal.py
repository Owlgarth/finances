"""Reads and renders legal documents (Privacy Policy, Terms of Service)."""

from django.conf import settings
from django.template.loader import render_to_string
from ninja.errors import HttpError

from core.models import LegalDocument


def _get_legal_context() -> dict:
    """Build template context from Django settings."""
    return {
        'operator_name': settings.LEGAL_OPERATOR_NAME,
        'operator_type': settings.LEGAL_OPERATOR_TYPE,
        'contact_email': settings.LEGAL_CONTACT_EMAIL,
        'contact_address': settings.LEGAL_CONTACT_ADDRESS,
        'jurisdiction': settings.LEGAL_JURISDICTION,
        'is_individual': settings.LEGAL_OPERATOR_TYPE == 'individual',
        'is_company': settings.LEGAL_OPERATOR_TYPE == 'company',
    }


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Split YAML frontmatter from content. Returns (meta_dict, content_str)."""
    if not text.startswith('---\n'):
        return {}, text

    try:
        end = text.index('\n---\n', 4)
    except ValueError:
        return {}, text

    meta: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ':' in line:
            key, _, value = line.partition(':')
            meta[key.strip()] = value.strip().strip('"\'')

    return meta, text[end + 5 :].strip()


def render_from_template(template_name: str) -> dict:
    """Render a legal document template. Used only by the seed command."""
    rendered = render_to_string(template_name, _get_legal_context())
    meta, content = _parse_frontmatter(rendered)
    return {
        'version': meta.get('version', '1.0'),
        'effective_date': meta.get('effective_date', ''),
        'content': content,
    }


def _get_active(doc_type: str) -> dict:
    """Return active document from DB. Raises if none found."""
    try:
        doc = LegalDocument.objects.get(doc_type=doc_type, is_active=True)
    except LegalDocument.DoesNotExist:
        raise HttpError(
            503,
            'Legal documents are not configured. Run: python manage.py seed_legal_documents',
        )
    return {
        'version': doc.version,
        'effective_date': str(doc.effective_date),
        'content': doc.content,
    }


def get_terms() -> dict:
    """Return Terms of Service from database."""
    return _get_active(LegalDocument.DocType.TERMS_OF_SERVICE)


def get_privacy() -> dict:
    """Return Privacy Policy from database."""
    return _get_active(LegalDocument.DocType.PRIVACY_POLICY)
