---
name: email-sending
description: Email conventions for Denarly — EmailService usage, on_commit patterns, subject format, HTML/txt templates, adding new emails, email env vars. Use when sending emails from services, creating or editing email templates in backend/templates/email/, or wiring email notifications.
---

# Email Patterns

## Sending Email

Use `EmailService.send_email()` so emails are only sent after the database transaction succeeds. Two valid patterns:

**Pattern A — Decorator + `on_commit`** (when the method uses `@db_transaction.atomic` for its own DB operations):

```python
from django.db import transaction as db_transaction
from common.email import EmailService

class MyService:
    @staticmethod
    @db_transaction.atomic
    def do_something(user, workspace_id):
        # ... database operations ...
        db_transaction.on_commit(
            lambda: MyService._send_notification_email(user, workspace_id)
        )

    @staticmethod
    def _send_notification_email(user, workspace_id):
        EmailService.send_email(
            to=user.email,
            subject='Something happened — Denarly',
            template_name='email/template_name',
            context={'user_name': user.full_name or user.email},
        )
```

**Pattern B — Context manager + direct call after block** (simpler, no lambda, clearer stack traces):

```python
class MyService:
    @staticmethod
    def do_something(user, new_password: str):
        with db_transaction.atomic():
            user.set_password(new_password)
            user.save()

        # Direct call after the with block exits (after commit)
        MyService._send_notification_email(user)
```

**Rules:**
- Only use `on_commit` inside `@db_transaction.atomic` methods. Never use `on_commit` outside an atomic block — it fires immediately anyway, so a direct call is clearer.
- Prefer Pattern B when the method doesn't already use `@db_transaction.atomic` as a decorator.
- Extract email-sending logic into a separate static method (not a nested function) on the service class. Use a `lambda` in `on_commit` to call it.
- When registering `on_commit` callbacks inside a loop, capture loop variables via lambda default arguments (`lambda x=val: ...`) to avoid late binding.
- `EmailService.send_email` handles failures internally with logging — do not wrap it in `try/except`. If you need to know whether the email was sent, check its boolean return value.

## Email Subject Format

All subjects follow `{Description} — Denarly` with an em-dash (`—`) before the app name:

```python
subject='Verify your email — Denarly'
subject='Reset your password — Denarly'
subject='Password changed — Denarly'
```

## Email Templates

Each email has an HTML and plain text version in `backend/templates/email/`, extending `base.html` / `base.txt` (shared layout, inline CSS, max-width 600px). Existing templates: verify_email, welcome, reset_password, password_changed, email_change_verify, email_change_notify, workspace_invitation_new, workspace_invitation_existing, member_removed, member_left, workspace_deleted, role_changed, account_deleted (each as `.html` / `.txt`).

**To add a new email template:**
1. Create `email/my_email.html` extending `email/base.html` with `{% block content %}`, `{% block cta_url %}`, `{% block cta_text %}`
2. Create `email/my_email.txt` extending `email/base.txt` with `{% block content %}`
3. Call `EmailService.send_email(template_name='email/my_email', ...)`

**Emails without a CTA button:** When no action can be taken (e.g., account deleted, password changed), do not include a CTA button — override `{% block cta_url %}` with a security note paragraph. See `password_changed.html` and `account_deleted.html`.

## Environment Variables

```
EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_USE_TLS
DEFAULT_FROM_EMAIL
FRONTEND_URL              # Used in email links
TOKEN_MAX_AGE             # Verification token expiry in seconds (default: 7 days)
```

In tests, `EMAIL_BACKEND` is `locmem` (via `config/test_settings.py`) — inspect sent emails with `mail.outbox`.
