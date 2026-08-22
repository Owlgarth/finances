"""Shared utility functions."""

from django.conf import settings


def get_client_ip(request) -> str | None:
    """
    Return the client IP, honoring settings.TRUSTED_PROXY_COUNT.

    Each trusted reverse proxy APPENDS the IP it received the connection from
    to X-Forwarded-For, so the real client is TRUSTED_PROXY_COUNT entries from
    the RIGHT of the list — never the first entry, which is client-controlled
    and trivially spoofed. Do not "simplify" this back to first-hop parsing.

    TRUSTED_PROXY_COUNT <= 0 (default): X-Forwarded-For is ignored entirely and
    REMOTE_ADDR is returned — spoof-proof when the API is exposed directly
    (uvicorn on API_PORT, no proxy in front).
    """
    count = settings.TRUSTED_PROXY_COUNT
    if count <= 0:
        return request.META.get('REMOTE_ADDR')

    xff = [ip.strip() for ip in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if ip.strip()]
    if not xff:
        return request.META.get('REMOTE_ADDR')
    if len(xff) >= count:
        return xff[-count]
    return xff[0]  # fewer entries than trusted proxies: sole entry was appended by our own proxy
