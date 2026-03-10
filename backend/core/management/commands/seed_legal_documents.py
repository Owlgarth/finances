"""Seed legal documents from templates into the database.

Safe to run multiple times — skips if an active version with the same
version string already exists. Use --force to overwrite.
"""

from django.core.management.base import BaseCommand
from django.utils.dateparse import parse_date

from core.legal import render_from_template
from core.models import LegalDocument

DOCS = [
    ('terms_of_service', 'legal/terms-of-service.md'),
    ('privacy_policy', 'legal/privacy-policy.md'),
]


class Command(BaseCommand):
    help = 'Seed legal documents from templates into the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Overwrite existing active documents even if version matches',
        )

    def handle(self, *args, **options):
        for doc_type, template_name in DOCS:
            rendered = render_from_template(template_name)
            version = rendered['version']
            content = rendered['content']
            effective_date = parse_date(rendered['effective_date'])

            existing = LegalDocument.objects.filter(doc_type=doc_type, version=version, is_active=True).first()

            if existing and not options['force']:
                self.stdout.write(f'  skip  {doc_type} v{version} (already active)')
                continue

            LegalDocument.objects.filter(doc_type=doc_type, is_active=True).update(is_active=False)

            LegalDocument.objects.create(
                doc_type=doc_type,
                version=version,
                effective_date=effective_date,
                content=content,
                is_active=True,
            )
            self.stdout.write(self.style.SUCCESS(f'  seeded {doc_type} v{version}'))
