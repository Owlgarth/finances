from celery import shared_task

from common.email import EmailService


@shared_task(
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def send_email_task(
    to: list[str],
    subject: str,
    template_name: str,
    context: dict | None = None,
    from_email: str | None = None,
) -> bool:
    return EmailService._send_sync(
        to=to,
        subject=subject,
        template_name=template_name,
        context=context,
        from_email=from_email,
    )
