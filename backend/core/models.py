from django.db import models


class LegalDocument(models.Model):
    class DocType(models.TextChoices):
        TERMS_OF_SERVICE = 'terms_of_service', 'Terms of Service'
        PRIVACY_POLICY = 'privacy_policy', 'Privacy Policy'

    doc_type = models.CharField(max_length=50, choices=DocType.choices)
    version = models.CharField(max_length=20)
    effective_date = models.DateField()
    content = models.TextField()
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'legal_documents'
        constraints = [
            models.UniqueConstraint(
                fields=['doc_type'],
                condition=models.Q(is_active=True),
                name='unique_active_legal_document',
            )
        ]

    def __str__(self):
        active = ' [active]' if self.is_active else ''
        return f'{self.doc_type} v{self.version}{active}'
