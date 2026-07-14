---
name: auth-security
description: Denarly's security model and auth patterns — JWT auth classes, role permissions, workspace scoping, rate limiting, temp/refresh token consumption, verification tokens, anti-enumeration. Use when working on authentication, authorization, tokens, 2FA, password reset, rate limits, or any security-sensitive endpoint.
---

# Security Model & Auth Patterns

## Four Security Layers

1. **Authentication**: `auth=JWTAuth()` on endpoints (or `auth=WorkspaceJWTAuth()` for workspace-scoped endpoints)
2. **Workspace Membership**: Guaranteed by `WorkspaceJWTAuth` — raises 400 if `current_workspace_id` is unset
3. **Role-Based Permissions**: `require_role(user, workspace_id, WRITE_ROLES)`
4. **Resource Ownership**: Filter queries by workspace ID using `Model.objects.for_workspace(workspace_id)`

`WorkspaceJWTAuth` returns 400 (not 401) if no workspace is selected, because the token is valid — the workspace state is missing.

## List Endpoints Return Empty Arrays for Cross-Workspace Resources

When a list endpoint receives an `account_id`, `budget_id`, or similar filter referencing a resource in another workspace, it returns `[]` rather than 404. This is a deliberate security choice to prevent leaking whether resource IDs exist in other workspaces. Do not "fix" these to return 404 — the empty array behavior is intentional.

## Rate Limiting

Two decorators in `common/throttle.py`:

- **`rate_limit(key_prefix, limit, period)`** — Keys by client IP only. Use for most endpoints.
- **`rate_limit_by_key(key_prefix, key_extractor, limit, period)`** — Keys by client IP + custom key (e.g., `user_id` from a temp token). Use when an attacker could rotate IPs to bypass IP-only limits.

Both use atomic cache operations (`cache.add()` + `cache.incr()`) via `_atomic_increment()` to eliminate TOCTOU races. Do not use `cache.get()` → `cache.set()` patterns in rate limiting.

Key extractors for tokens must return a unique value (e.g., `str(uuid.uuid4())`) for invalid tokens, not a fixed string like `'invalid'` — a fixed string lets attackers on a shared IP exhaust the bucket and block legitimate users.

All rate limit `limit` and `period` values **must** be configured via Django settings backed by env vars, not hardcoded. Each setting needs an inline comment explaining its purpose:

```python
# Max 2FA verification attempts per IP+user within the period window
RATE_LIMIT_VERIFY_2FA = int(os.getenv('RATE_LIMIT_VERIFY_2FA', '10'))
# Time window (seconds) for 2FA verification rate limiting
RATE_LIMIT_VERIFY_2FA_PERIOD = int(os.getenv('RATE_LIMIT_VERIFY_2FA_PERIOD', '60'))
```

Reference in endpoints:

```python
@router.post('/verify-2fa', response={200: Token, 401: DetailOut, 404: DetailOut, 429: DetailOut})
@rate_limit_by_key('verify_2fa', _extract_2fa_rate_key, limit=settings.RATE_LIMIT_VERIFY_2FA, period=settings.RATE_LIMIT_VERIFY_2FA_PERIOD)
def verify_2fa(request, data: Verify2FAIn):
    ...
```

## Temp & Refresh Token Consumption

Two functions in `common/auth.py` for temp tokens:

- **`decode_temp_token(token)`** — Peeks at the payload without side effects. Use when you need claims without consuming (e.g., extracting `user_id` for rate limiting).
- **`consume_temp_token(token)`** — Consumes the token (marks its JTI as used in cache). Returns `None` on replay. Use when the token should be single-use (e.g., `verify_2fa`).

Never use `decode_temp_token` where `consume_temp_token` is appropriate — a consumed token must not be replayable.

For refresh tokens:

- **`create_refresh_token(user)`** — Issues a JWT with `type: 'refresh'`, a unique `jti`, expiry via `JWT_REFRESH_TOKEN_EXPIRE_DAYS` (default 7 days). Does not include `email` or `current_workspace_id` (unlike access tokens).
- **`consume_refresh_token(token)`** — Decodes, validates `type == 'refresh'`, atomically marks the `jti` as consumed with `cache.add()`. Returns `None` on replay, expiry, or invalid signature.

Both consume functions: validate token type, derive cache TTL from `exp` via `_ttl_from_exp()`, atomically mark JTI with `cache.add()`. Cache TTL always matches remaining token lifetime; if `ttl == 0` (already expired), `None` is returned without caching.

`JWTAuth.authenticate` rejects tokens with `type` in `('2fa_pending', 'refresh')` — this prevents refresh tokens from being used as access tokens.

## Verification & Reset Token Patterns

- **Email verification / generic tokens**: `TimestampSigner` (stateless, expiry via `TOKEN_MAX_AGE` setting):
  ```python
  from common.tokens import generate_verification_token, verify_verification_token
  token = generate_verification_token(user.id)
  user_id = verify_verification_token(token)  # Returns int or None
  ```

- **Password reset tokens**: Django's built-in `PasswordResetTokenGenerator` (one-time-use, invalidated on password change):
  ```python
  from django.contrib.auth.tokens import default_token_generator
  token = default_token_generator.make_token(user)
  valid = default_token_generator.check_token(user, token)
  ```

- **Email change tokens**: `TimestampSigner` with `sign_object`:
  ```python
  from common.tokens import generate_email_change_token, verify_email_change_token
  token = generate_email_change_token(user.id, new_email)
  result = verify_email_change_token(token)  # Returns (uid, email) tuple or None
  ```

## Anti-Enumeration

These endpoints always return 200 with the same generic message regardless of input:
- `POST /api/auth/forgot-password` — "If an account exists with this email, a reset link has been sent."
- `POST /api/auth/resend-verification` — "If your email is unverified, a new verification email has been sent."

Never reveal whether an email address is registered.

**Timing normalization:** Anti-enumeration endpoints can still leak via response timing (the "send email" path is slower than the early-return path). Mitigate with `time.sleep(random.uniform(0.1, 0.3))` on early-return paths:

```python
import random
import time

@router.post('/forgot-password', response={200: MessageOut})
def forgot_password(request, data: ForgotPasswordIn):
    user = User.objects.filter(email=data.email).first()
    if not user:
        time.sleep(random.uniform(0.1, 0.3))  # Normalize response time to reduce timing side-channel
        return 200, {'message': 'If an account exists with this email, a reset link has been sent.'}
    # ... send reset email (naturally slow) ...
```

Import `random` and `time` at module level (stdlib imports, before Django/third-party).
