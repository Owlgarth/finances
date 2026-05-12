"""Initialize S3 storage buckets.

Creates the static, media, and logs buckets if they don't already exist.
Skipped entirely when USE_S3_STORAGE is false.
"""

from django.conf import settings
from django.core.management.base import BaseCommand

from common.storage import StorageService


class Command(BaseCommand):
    help = 'Initialize S3 storage buckets (static, media, logs)'

    def handle(self, *args, **options):
        if not getattr(settings, 'USE_S3_STORAGE', False):
            self.stdout.write('  S3 storage disabled, skipping bucket initialization')
            return

        self.stdout.write('Initializing storage buckets...')
        StorageService.ensure_buckets_exist()
        self.stdout.write(self.style.SUCCESS('  Storage buckets ready'))
