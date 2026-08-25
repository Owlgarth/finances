"""Regression tests for static-storage URL scheme derivation.

config.settings builds STORAGES at import time from env vars, and pytest runs
under config.test_settings (which forces USE_S3_STORAGE=False), so the only
honest way to exercise the S3 branch is a subprocess with its own environment.
The probe is network-free: with custom_domain set, django-storages url() is
pure string formatting.
"""

import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase

BACKEND_DIR = Path(__file__).resolve().parents[2]

_PROBE = (
    'import django; django.setup(); '
    'from django.contrib.staticfiles.storage import staticfiles_storage; '
    "print(staticfiles_storage.url('admin/css/base.css'))"
)


def _static_url(env_overrides: dict) -> str:
    """Run the URL probe in a fresh interpreter with a controlled environment."""
    env = {
        'DJANGO_SETTINGS_MODULE': 'config.settings',
        'SECRET_KEY': 'test-secret-key',
        'JWT_SECRET_KEY': 'test-jwt-secret-key',
        # Pin every var the URL output depends on: load_dotenv() fills unset
        # vars from the developer's root .env, whose bucket names vary.
        'S3_BUCKET_STATIC': 'finances-static',
        **env_overrides,
    }
    result = subprocess.run(
        [sys.executable, '-c', _PROBE],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=BACKEND_DIR,
        env=env,
    )
    assert result.returncode == 0, f'probe failed:\nstdout: {result.stdout}\nstderr: {result.stderr}'
    return result.stdout.strip()


class TestStaticStorageUrlScheme(SimpleTestCase):
    def test_https_external_url_yields_https_static_urls(self):
        url = _static_url(
            {
                'USE_S3_STORAGE': 'true',
                'S3_EXTERNAL_URL': 'https://cdn.example.com',
            }
        )
        self.assertTrue(url.startswith('https://cdn.example.com/finances-static/'))

    def test_http_dev_external_url_yields_http_static_urls(self):
        url = _static_url(
            {
                'USE_S3_STORAGE': 'true',
                'S3_EXTERNAL_URL': 'http://localhost:9000',
            }
        )
        self.assertTrue(url.startswith('http://localhost:9000/finances-static/'))

    def test_scheme_less_external_url_falls_back_to_https(self):
        url = _static_url(
            {
                'USE_S3_STORAGE': 'true',
                'S3_EXTERNAL_URL': 'cdn.example.com',
            }
        )
        self.assertTrue(url.startswith('https://cdn.example.com/finances-static/'))
