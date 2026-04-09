import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def send_email(
        to: str | list[str],
        subject: str,
        template_name: str,
        context: dict | None = None,
        from_email: str | None = None,
    ) -> bool:
        context = context or {}
        context.setdefault('frontend_url', settings.FRONTEND_URL)

        try:
            text_content = render_to_string(f'{template_name}.txt', context)
            html_content = render_to_string(f'{template_name}.html', context)

            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_content,
                from_email=from_email or settings.DEFAULT_FROM_EMAIL,
                to=to if isinstance(to, list) else [to],
            )
            msg.attach_alternative(html_content, 'text/html')
            msg.send(fail_silently=False)
            return True
        except Exception:
            logger.exception('Failed to send email "%s" to %s', subject, to)
            return False
