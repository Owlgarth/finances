"""Shared utility functions."""


def get_client_ip(request) -> str | None:
    """Return the client IP, preferring X-Forwarded-For (first hop) over REMOTE_ADDR."""
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')
