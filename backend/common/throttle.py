"""Rate limiting decorator for Django Ninja endpoints."""

from functools import wraps

from django.core.cache import cache
from ninja.errors import HttpError


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
            # Get client IP address
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                ip = x_forwarded_for.split(',')[0].strip()
            else:
                ip = request.META.get('REMOTE_ADDR', 'unknown')

            cache_key = f'ratelimit:{key_prefix}:{ip}'
            count = cache.get(cache_key, 0)

            if count >= limit:
                raise HttpError(429, 'Too many requests. Please try again later.')

            cache.set(cache_key, count + 1, period)
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
