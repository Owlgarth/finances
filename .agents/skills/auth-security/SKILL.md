---
name: auth-security
description: Owlgarth Finances' security model and auth patterns — JWT auth classes, role permissions, workspace scoping, rate limiting, temp/refresh token consumption, verification tokens, anti-enumeration. Use when working on authentication, authorization, tokens, 2FA, password reset, rate limits, or any security-sensitive endpoint.
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

Three decorators in `common/throttle.py`:

- **`rate_limit(key_prefix, limit, period)`** — Keys by client IP only. Use for most endpoints.
- **`rate_limit_by_key(key_prefix, key_extractor, limit, period)`** — Keys by client IP + custom key (e.g., `user_id` from a temp token).
- **`rate_limit_account(key_prefix, key_extractor, limit, period)`** — Keys by the extracted account identifier ONLY (e.g., login email, 2FA `user_id` from a temp token) — no IP in the cache key, so IP rotation or X-Forwarded-For spoofing cannot reset the counter. Login, register, and verify-2fa stack it as a second decorator under the IP-keyed one (IP-keyed outermost, account-keyed closest to the function). Accepted tradeoff: an attacker who knows a victim's account identifier can intentionally exhaust the victim's allowance (login lockout DoS) — accepted because the window is short and IP-only limits are bypassable anyway.

All three use atomic cache operations (`cache.add()` + `cache.incr()`) via `_atomic_increment()` to eliminate TOCTOU races. Do not use `cache.get()` → `cache.set()` patterns in rate limiting.

**Client IP derivation** (`get_client_ip` in `common/utils.py`) honors `TRUSTED_PROXY_COUNT` (default 0): X-Forwarded-For is ignored entirely and `REMOTE_ADDR` is returned — correct for direct uvicorn exposure with no proxy in front. Behind N trusted proxies, set it to N; the client is then the Nth entry from the RIGHT of the XFF list (each trusted proxy appends the IP it saw). Never trust the first XFF hop or "simplify" to first-entry parsing — that entry is client-controlled, so trusting it makes every IP-keyed rate limit bypassable with a spoofed header.

Key extractors for tokens must return a unique value (e.g., `str(uuid.uuid4())`) for invalid tokens, not a fixed string like `'invalid'` — a fixed string lets attackers on a shared IP exhaust the bucket and block legitimate users.

Key extractors are named module-level functions defined **before** the endpoint that uses them — decorators resolve the name at decoration time. The house defensive signature is `(request, data: SchemaIn = None, **kwargs)` because endpoint kwargs are forwarded to the extractor.

All rate limit `limit` and `period` values **must** be configured via Django settings backed by env vars, not hardcoded. Each setting needs an inline comment explaining its purpose:

```python
# Max 2FA verification attempts per IP+user within the period window
RATE_LIMIT_VERIFY_2FA = int(os.getenv('RATE_LIMIT_VERIFY_2FA', '10'))
# Time window (seconds) for 2FA verification rate limiting
RATE_LIMIT_VERIFY_2FA_PERIOD = int(os.getenv('RATE_LIMIT_VERIFY_2FA_PERIOD', '60'))
```

Reference in endpoints (verify-2fa, with the account-keyed backstop stacked under the IP+user-keyed limit):

```python
@router.post('/verify-2fa', response={200: Token, 401: DetailOut, 404: DetailOut, 429: DetailOut})
@rate_limit_by_key('verify_2fa', _extract_2fa_user_key, limit=settings.RATE_LIMIT_VERIFY_2FA, period=settings.RATE_LIMIT_VERIFY_2FA_PERIOD)
@rate_limit_account('verify_2fa_user', _extract_2fa_user_key, limit=settings.RATE_LIMIT_VERIFY_2FA_USER, period=settings.RATE_LIMIT_VERIFY_2FA_USER_PERIOD)
def verify_2fa(request, data: Verify2FAIn):
    ...
```

### 2FA Per-User Lockout & TOTP Replay Guard

`verify-2fa` stacks `rate_limit_account('verify_2fa_user', ...)` keyed by the temp token's `user_id`. Without it, an attacker holding the password can rotate the claimed IP per request (or re-login for a fresh single-use temp token each attempt), landing every request in a fresh bucket; the per-user cap bounds the 6-digit TOTP space at 10 attempts / 15 min (`RATE_LIMIT_VERIFY_2FA_USER(_PERIOD)` — the window is deliberately long because the brute-force ceiling scales with it). One extractor (`_extract_2fa_user_key`) serves both stacked decorators; for invalid tokens it returns a random `uuid4()` per request, never a fixed string.

TOTP codes are single-use via `UserTwoFactor.last_used_timestep`: `TwoFactorService.verify_code` accepts a code only when its timestep is strictly greater than the last used one (null = first use passes). Never reintroduce bare `totp.verify()` there without timestep tracking — `verify_and_enable` intentionally keeps bare `verify` because it checks a not-yet-enabled setup record for the already-authenticated user, not a live credential.

## Temp & Refresh Token Consumption

Two functions in `common/auth.py` for temp tokens:

- **`decode_temp_token(token)`** — Peeks at the payload without side effects. Use when you need claims without consuming (e.g., extracting `user_id` for rate limiting).
- **`consume_temp_token(token)`** — Consumes the token (marks its JTI as used in cache). Returns `None` on replay. Use when the token should be single-use (e.g., `verify_2fa`).

Never use `decode_temp_token` where `consume_temp_token` is appropriate — a consumed token must not be replayable.

For refresh tokens:

- **`create_refresh_token(user)`** — Issues a JWT with `type: 'refresh'`, a unique `jti`, expiry via `JWT_REFRESH_TOKEN_EXPIRE_DAYS` (default 7 days). Does not include `email` or `current_workspace_id` (unlike access tokens).
- **`consume_refresh_token(token)`** — Decodes, validates `type == 'refresh'`, atomically marks the `jti` as consumed with `cache.add()`. Returns `None` on replay, expiry, or invalid signature.

Both consume functions: validate token type, derive cache TTL from `exp` via `_ttl_from_exp()`, atomically mark JTI with `cache.add()`. Cache TTL always matches remaining token lifetime; if `ttl == 0` (already expired), `None` is returned without caching.

**Password changes invalidate refresh tokens:** `AuthService.refresh` rejects any refresh token whose `iat` is earlier than `user.password_changed_at`, reusing the generic invalid-token detail (no new oracle about which check fired). Missing `iat` → 0 → rejected (fail-closed); a null stamp → 0 → treated as no cutoff. The stamp is written by the `User.set_password` override — the single choke point every password-save path funnels through. Two rules:

- Any `save(update_fields=[...])` list containing `'password'` must also contain `'password_changed_at'` — `update_fields` silently drops the in-memory stamp the override just set.
- Any new token type that should die on a password change must carry `iat` and be checked the same way.

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

## Encrypted Secrets at Rest

2FA secrets are Fernet-encrypted under a dedicated key, not SECRET_KEY derivation: `TWO_FACTOR_ENCRYPTION_KEY` (env-configured, URL-safe base64 32-byte key — exactly what `Fernet.generate_key()` emits). Empty (default) = legacy scheme derived from SECRET_KEY via sha256. `decrypt_secret` in `common/crypto.py` falls back to the legacy key when decryption under the configured key fails, so ciphertexts written before a key rotation keep decrypting; they re-encrypt lazily on the next 2FA setup (which always generates a fresh secret).

New encrypted-at-rest secrets should follow this same pattern — dedicated env-configured key with a decrypt-only legacy fallback — never raw SECRET_KEY derivation.

## Anti-Enumeration

These endpoints always return 200 with the same generic message regardless of input:
- `POST /api/auth/forgot-password` — "If an account exists with this email, a reset link has been sent."
- `POST /api/auth/resend-verification` — "If your email is unverified, a new verification email has been sent."

`POST /api/auth/register` cannot return 200 on success, so it rejects an already-registered address with a generic 400 (`'Unable to register with this email address.'`) that never says why, sends the notification email to the EXISTING address owner (never the requester — sending to the owner leaks nothing to the prober), and stacks a per-email secondary rate limit (`RATE_LIMIT_REGISTER_ACCOUNT(_PERIOD)`) under the IP-keyed one. The residual 201-vs-400 status difference is a known, accepted oracle (email-verification-gated signup is the fix, out of scope).

`POST /api/workspaces/{workspace_id}/members/add` (`add_member`) returns one response shape (`{'message', 'user_id', 'member_id'}`) whether the email is new or existing — the new-vs-existing branch stays server-side, where it only picks which invitation email to send. Never reintroduce an existing-vs-new signal (an `is_new_user` flag, branch-specific messages, branched frontend toasts) in any layer.

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

**Login dummy hash:** the no-user login path runs `hashers.check_password(data.password, _DUMMY_PASSWORD_HASH)` — a module-level hash computed once at import — before returning a 401 byte-identical to the wrong-password path. Without it, user-exists vs wrong-password response times are a user-enumeration oracle. Never assert wall-clock timings in tests; verify the two 401 bodies are byte-identical and leave timing to code review.

## Admin-Initiated Account Actions Notify the Victim

Admins can reset a member's password (`UserService.send_password_changed_email(..., changed_by_admin=True)`) and reset a member's 2FA (`TwoFactorService.admin_reset` → `email/twofa_admin_reset`). Together the two resets are full account takeover across every workspace the victim belongs to — the capability is kept only with a notification leg: both actions email the victim, paired in lockstep. Any new admin-initiated security mutation on a member's account (or edit to an existing one) must add the same victim-notification — differentiated notifications may go to the member, never to the acting admin only.
