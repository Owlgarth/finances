import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _get_legacy_fernet() -> Fernet:
    """Legacy Fernet whose key is derived from SECRET_KEY via sha256 (pre-rotation scheme)."""
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _get_fernet() -> Fernet:
    """Primary Fernet: TWO_FACTOR_ENCRYPTION_KEY when set, else the legacy SECRET_KEY derivation."""
    configured = settings.TWO_FACTOR_ENCRYPTION_KEY
    if configured:
        # The env value must be a URL-safe base64-encoded 32-byte key — exactly
        # the format Fernet expects (see example.env for a generation command).
        return Fernet(configured.encode())
    return _get_legacy_fernet()


def encrypt_secret(plaintext: str) -> bytes:
    return _get_fernet().encrypt(plaintext.encode())


def decrypt_secret(encrypted: bytes) -> str:
    fernet = _get_fernet()
    try:
        return fernet.decrypt(bytes(encrypted)).decode()
    except InvalidToken:
        if not settings.TWO_FACTOR_ENCRYPTION_KEY:
            raise  # primary IS the legacy key here — retrying cannot succeed
        # Ciphertexts from before key rotation: still decryptable under the
        # SECRET_KEY-derived key. They are re-encrypted with the new key only
        # when re-saved (i.e. the next 2FA setup, which always generates a
        # fresh secret) — acceptable, nothing else rewrites encrypted_secret.
        return _get_legacy_fernet().decrypt(bytes(encrypted)).decode()
