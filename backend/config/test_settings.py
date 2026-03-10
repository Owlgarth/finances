import os

os.environ.setdefault('SECRET_KEY', 'test-secret-key-for-pytest')
os.environ.setdefault('JWT_SECRET_KEY', 'test-jwt-secret-key-for-pytest')
os.environ.setdefault('ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver')

from config.settings import *  # noqa: F403

# Capture sent emails in memory during tests
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

# Use local memory cache for tests (no Redis dependency)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'test-cache',
    }
}

# Allow test server in ALLOWED_HOSTS for API tests
if 'testserver' not in ALLOWED_HOSTS:  # noqa: F405
    ALLOWED_HOSTS.append('testserver')  # noqa: F405
