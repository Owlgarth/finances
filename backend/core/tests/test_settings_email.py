"""Regression tests for the EMAIL_MODE settings dispatch.

config.settings builds the EMAIL_* settings at import time from env vars, and
pytest runs under config.test_settings (which forces the locmem backend), so
the only honest way to exercise the console/file/smtp branches is a subprocess
with its own environment. The probe is network-free and disk-free: it only
reads settings attributes, and the filebased backend writes nothing unless
mail is actually sent.
"""

import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase

BACKEND_DIR = Path(__file__).resolve().parents[2]

_CONSOLE = 'django.core.mail.backends.console.EmailBackend'
_FILEBASED = 'django.core.mail.backends.filebased.EmailBackend'
_SMTP = 'django.core.mail.backends.smtp.EmailBackend'

# Lines printed: EMAIL_BACKEND, EMAIL_FILE_PATH, EMAIL_HOST. EMAIL_FILE_PATH
# has no Django global default, so it prints None outside file mode;
# EMAIL_HOST defaults to 'localhost' in Django's global settings, so it only
# carries meaning in smtp mode (settings.py sets it there alone) - console and
# file tests must not assert the host line.
_PROBE = (
    'import django; django.setup(); '
    'from django.conf import settings; '
    'print(settings.EMAIL_BACKEND); '
    "print(getattr(settings, 'EMAIL_FILE_PATH', None)); "
    "print(getattr(settings, 'EMAIL_HOST', None))"
)


def _probe_result(env_overrides: dict) -> subprocess.CompletedProcess:
    """Run the email probe in a fresh interpreter with a controlled environment."""
    env = {
        'DJANGO_SETTINGS_MODULE': 'config.settings',
        'SECRET_KEY': 'test-secret-key',
        'JWT_SECRET_KEY': 'test-jwt-secret-key',
        # Pin every var the asserted output depends on: load_dotenv() fills
        # unset vars from the developer's root .env, whose email setup varies.
        # The empty strings are load-bearing - load_dotenv does not override
        # vars already present in the environment, so '' wins over any .env
        # value, while an omitted var would let .env decide the test outcome.
        'EMAIL_MODE': '',
        'EMAIL_HOST': '',
        'EMAIL_FILE_PATH': '',
        **env_overrides,
    }
    return subprocess.run(
        [sys.executable, '-c', _PROBE],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=BACKEND_DIR,
        env=env,
    )


def _email_settings(env_overrides: dict) -> list[str | None]:
    """Probe output lines (backend, file path, host) for a setup that must succeed.

    A line that printed as "None" is mapped back to Python None so callers can
    use assertIsNone on attributes the settings module never defined.
    """
    result = _probe_result(env_overrides)
    assert result.returncode == 0, f'probe failed:\nstdout: {result.stdout}\nstderr: {result.stderr}'
    return [None if line == 'None' else line for line in result.stdout.strip().splitlines()]


class TestEmailModeDispatch(SimpleTestCase):
    def test_file_mode_uses_filebased_backend_with_default_path(self):
        backend, file_path, _host = _email_settings({'EMAIL_MODE': 'file'})
        self.assertEqual(backend, _FILEBASED)
        self.assertEqual(file_path, str(BACKEND_DIR / 'sent-emails'))

    def test_file_mode_with_custom_path_uses_it(self):
        backend, file_path, _host = _email_settings(
            {'EMAIL_MODE': 'file', 'EMAIL_FILE_PATH': '/tmp/sent-emails-custom'}
        )
        self.assertEqual(backend, _FILEBASED)
        self.assertEqual(file_path, '/tmp/sent-emails-custom')

    def test_console_mode_ignores_email_host(self):
        backend, _file_path, _host = _email_settings({'EMAIL_MODE': 'console', 'EMAIL_HOST': 'smtp.example.com'})
        self.assertEqual(backend, _CONSOLE)

    def test_smtp_mode_uses_smtp_backend_and_propagates_host(self):
        backend, _file_path, host = _email_settings({'EMAIL_MODE': 'smtp', 'EMAIL_HOST': 'smtp.example.com'})
        self.assertEqual(backend, _SMTP)
        self.assertEqual(host, 'smtp.example.com')

    def test_uppercase_mode_is_lowercased_before_validation(self):
        backend, _file_path, host = _email_settings({'EMAIL_MODE': 'SMTP', 'EMAIL_HOST': 'smtp.example.com'})
        self.assertEqual(backend, _SMTP)
        self.assertEqual(host, 'smtp.example.com')

    def test_unset_mode_with_host_uses_smtp_legacy(self):
        backend, _file_path, host = _email_settings({'EMAIL_HOST': 'smtp.example.com'})
        self.assertEqual(backend, _SMTP)
        self.assertEqual(host, 'smtp.example.com')

    def test_unset_mode_without_host_uses_console_legacy(self):
        backend, file_path, _host = _email_settings({})
        self.assertEqual(backend, _CONSOLE)
        self.assertIsNone(file_path)

    def test_invalid_mode_fails_the_probe(self):
        result = _probe_result({'EMAIL_MODE': 'fille'})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('EMAIL_MODE', result.stderr)

    def test_smtp_mode_without_host_fails_the_probe(self):
        result = _probe_result({'EMAIL_MODE': 'smtp'})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('EMAIL_HOST', result.stderr)
