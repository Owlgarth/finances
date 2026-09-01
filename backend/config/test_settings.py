import os

os.environ.setdefault('SECRET_KEY', 'test-secret-key-for-pytest')
os.environ.setdefault('JWT_SECRET_KEY', 'test-jwt-secret-key-for-pytest')
os.environ.setdefault('ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver')
# Tests make plain-http requests against the test server; DEBUG must be true so
# the production security block in settings.py (SECURE_SSL_REDIRECT) stays off -
# with it on, every request 301s to https and the API tests fail. Local runs get
# this from the developer .env; CI has no .env file.
os.environ.setdefault('DEBUG', 'true')

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

# Use local filesystem storage in tests (no S3 dependency)
USE_S3_STORAGE = False

# Allow test server in ALLOWED_HOSTS for API tests
if 'testserver' not in ALLOWED_HOSTS:  # noqa: F405
    ALLOWED_HOSTS.append('testserver')  # noqa: F405

# Run Celery tasks synchronously in tests (no worker available)
CELERY_TASK_ALWAYS_EAGER = True
