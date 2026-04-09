"""Rate limiting decorator for Django Ninja endpoints."""

from functools import wraps

from django.core.cache import cache
from ninja.errors import HttpError

from common.utils import get_client_ip


def _atomic_increment(cache_key: str, period: int) -> int:
    """
    Atomically increment a cache counter.

    Uses cache.add() (atomic "create if not exists") to seed the key with TTL,
    then cache.incr() for subsequent increments. The incr fallback to set handles
    the edge case where the key expired between add and incr.
    """
    added = cache.add(cache_key, 1, period)
    if added:
        return 1
    try:
        return cache.incr(cache_key)
    except ValueError:
        cache.set(cache_key, 1, period)
        return 1


def rate_limit(key_prefix: str, limit: int = 10, period: int = 60):
    """
    Simple rate limiter using Django cache.

    Args:
        key_prefix: Unique prefix for this rate limit (e.g., 'login', 'import')
        limit: Maximum number of requests allowed within the period
        period: Time window in seconds

    Usage:
        @router.post('/login')
        @rate_limit('login', limit=10, period=60)
        def login(request, data: LoginIn):
            ...
    """

    def decorator(func):
        @wraps(func)
        def wrapper(request, *args, **kwargs):
            ip = get_client_ip(request) or 'unknown'

            cache_key = f'ratelimit:{key_prefix}:{ip}'
            count = _atomic_increment(cache_key, period)

            if count > limit:
                raise HttpError(429, 'Too many requests. Please try again later.')

            return func(request, *args, **kwargs)

        return wrapper

    return decorator


def rate_limit_by_key(key_prefix: str, key_extractor, limit: int = 10, period: int = 60):
    """
    Rate limiter using Django cache with a custom key extractor.

    Combines the client IP with a key extracted from the request (e.g. user_id
    from a temp token) so that rotating IPs alone does not bypass the limit.

    Args:
        key_prefix: Unique prefix for this rate limit (e.g., 'verify_2fa')
        key_extractor: Callable(request, *args, **kwargs) -> str
        limit: Maximum number of requests allowed within the period
        period: Time window in seconds
    """

    def decorator(func):
        @wraps(func)
        def wrapper(request, *args, **kwargs):
            key_part = key_extractor(request, *args, **kwargs)
            ip = get_client_ip(request) or 'unknown'

            cache_key = f'ratelimit:{key_prefix}:{ip}:{key_part}'
            count = _atomic_increment(cache_key, period)

            if count > limit:
                raise HttpError(429, 'Too many requests. Please try again later.')

            return func(request, *args, **kwargs)

        return wrapper

    return decorator


def validate_file_size(file, max_size_mb: int = 5):
    """
    Validate uploaded file size.

    Args:
        file: The uploaded file object
        max_size_mb: Maximum file size in megabytes

    Raises:
        HttpError: If file exceeds the maximum size
    """
    max_size_bytes = max_size_mb * 1024 * 1024
    if file.size > max_size_bytes:
        raise HttpError(400, f'File too large. Maximum {max_size_mb}MB allowed.')
