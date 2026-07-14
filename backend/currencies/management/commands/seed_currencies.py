"""Seed the global ISO 4217 currency catalog.

Idempotent — existing rows are updated in place, so it is safe to run on
every deploy and test session.
"""

from django.core.management.base import BaseCommand

from currencies.data import ISO_4217
from currencies.models import Currency


class Command(BaseCommand):
    help = 'Seed the global ISO 4217 currency catalog'

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0

        for entry in ISO_4217:
            _, created = Currency.objects.update_or_create(
                code=entry['code'],
                workspace=None,
                defaults={
                    'name': entry['name'],
                    'symbol': entry['symbol'],
                    'decimals': entry['decimals'],
                    'is_custom': False,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(self.style.SUCCESS(f'Currencies seeded: {created_count} created, {updated_count} updated'))
