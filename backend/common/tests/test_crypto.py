"""Tests for 2FA secret encryption key handling (independent key + legacy fallback)."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.test import SimpleTestCase, override_settings

from common.crypto import decrypt_secret, encrypt_secret


def _legacy_fernet() -> Fernet:
    """Build the legacy SECRET_KEY-derived Fernet independently of crypto.py."""
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


class TwoFactorEncryptionKeyTests(SimpleTestCase):
    def test_roundtrip_with_configured_key(self):
        with override_settings(TWO_FACTOR_ENCRYPTION_KEY=Fernet.generate_key().decode()):
            encrypted = encrypt_secret('JBSWY3DPEHPK3PXP')
            self.assertEqual(decrypt_secret(encrypted), 'JBSWY3DPEHPK3PXP')

    def test_encrypt_uses_configured_key_not_legacy(self):
        with override_settings(TWO_FACTOR_ENCRYPTION_KEY=Fernet.generate_key().decode()):
            encrypted = encrypt_secret('JBSWY3DPEHPK3PXP')
        with self.assertRaises(InvalidToken):
            _legacy_fernet().decrypt(bytes(encrypted))

    def test_legacy_ciphertext_decrypts_via_fallback(self):
        encrypted = _legacy_fernet().encrypt(b'JBSWY3DPEHPK3PXP')
        with override_settings(TWO_FACTOR_ENCRYPTION_KEY=Fernet.generate_key().decode()):
            self.assertEqual(decrypt_secret(encrypted), 'JBSWY3DPEHPK3PXP')

    def test_roundtrip_without_configured_key_uses_legacy(self):
        with override_settings(TWO_FACTOR_ENCRYPTION_KEY=''):
            encrypted = encrypt_secret('JBSWY3DPEHPK3PXP')
            self.assertEqual(_legacy_fernet().decrypt(bytes(encrypted)), b'JBSWY3DPEHPK3PXP')
