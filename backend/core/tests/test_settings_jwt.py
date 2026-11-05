"""Pin the length floor of the JWT secret configured for the test suite.

config/test_settings.py sets JWT_SECRET_KEY via os.environ.setdefault BEFORE
importing config.settings, and load_dotenv() there never overrides vars
already present in the environment, so under pytest this configured secret
always wins over a developer .env. common/auth.py hands
settings.JWT_SECRET_KEY straight to every jwt.encode/jwt.decode call site
(HS256, no derivation), so the secret's bytes ARE the HMAC key bytes: PyJWT
emits InsecureKeyLengthWarning whenever the key is shorter than the hash
digest size, 32 bytes for SHA256 per RFC 7518 Section 3.2. The invariant
pinned here is the length floor, not the exact string, so the
readable-secret pattern stays free to change above 32 bytes.
"""

from django.conf import settings
from django.test import SimpleTestCase

# Settings access only - SimpleTestCase, no django_db marker needed.


class TestJwtSecretKeyLength(SimpleTestCase):
    def test_jwt_secret_key_encodes_to_at_least_32_bytes(self):
        key_bytes = settings.JWT_SECRET_KEY.encode('utf-8')
        self.assertGreaterEqual(
            len(key_bytes),
            32,
            'JWT_SECRET_KEY under config.test_settings must encode to at least 32 bytes: '
            'RFC 7518 Section 3.2 floor for HS256/SHA256 keys, below which PyJWT emits '
            'InsecureKeyLengthWarning on every jwt.encode/jwt.decode call',
        )
