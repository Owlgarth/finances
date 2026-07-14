"""Bearer-token auth dependency.

When PARSER_API_TOKEN is unset the check is disabled (local dev / tests only).
Set it in every real deployment.
"""

from __future__ import annotations

import hmac

from fastapi import Header

from app.config import settings
from app.errors import Unauthorized


def require_token(authorization: str | None = Header(default=None)) -> None:
    if not settings.api_token:
        return
    expected = f'Bearer {settings.api_token}'
    if authorization is None or not hmac.compare_digest(authorization, expected):
        raise Unauthorized('Missing or invalid bearer token.')
