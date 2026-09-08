"""Domain exceptions for the core app."""

from django.utils.translation import gettext_lazy

from common.exceptions import ServiceError


class LegalDocumentUnavailableError(ServiceError):
    """No active legal document is configured. Maps to HTTP 503."""

    http_status = 503
    default_message = gettext_lazy('Legal documents are not configured. Run: python manage.py seed_legal_documents')
    default_code = 'legal_documents_unavailable'
