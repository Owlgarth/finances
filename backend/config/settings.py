import os
from pathlib import Path

from dotenv import load_dotenv

from config.utils import get_int_env

load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

TOKEN_MAX_AGE = get_int_env('TOKEN_MAX_AGE', 7 * 24 * 60 * 60)

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ['SECRET_KEY']

# JWT Settings
JWT_SECRET_KEY = os.environ['JWT_SECRET_KEY']
JWT_ALGORITHM = 'HS256'
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRE_MINUTES', 60))  # 1 hour default
JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('JWT_REFRESH_TOKEN_EXPIRE_DAYS', 7))  # 7 days default

# Demo Mode
DEMO_MODE = os.getenv('DEMO_MODE', 'false').lower() == 'true'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',') if os.getenv('ALLOWED_HOSTS') else []

# Django Ninja manages its own URL routing without trailing slashes
APPEND_SLASH = False

# CORS settings for React frontend
_cors_env = os.getenv('CORS_ALLOWED_ORIGINS', '').strip()
cors_origins = _cors_env.split(',') if _cors_env else []
CSRF_TRUSTED_ORIGINS = cors_origins.copy()
CORS_ALLOWED_ORIGINS = cors_origins
CORS_ALLOW_CREDENTIALS = True

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'ninja',
    # Custom apps
    'users',
    'workspaces',
    'budget_accounts',
    'budget_periods',
    'categories',
    'budgets',
    'transactions',
    'currency_exchanges',
    'exchange_shortcuts',
    'planned_transactions',
    'period_balances',
    'reports',
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('POSTGRES_DB', 'budget_tracker'),
        'USER': os.getenv('POSTGRES_USER', 'postgres'),
        'PASSWORD': os.getenv('POSTGRES_PASSWORD', 'postgres'),
        'HOST': os.getenv('POSTGRES_HOST', 'localhost'),
        'PORT': os.getenv('POSTGRES_PORT', '5432'),
    }
}

# Custom user model
AUTH_USER_MODEL = 'users.User'


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = 'static/'

# File upload limits
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # 5MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # 5MB

# Workspace limits
WORKSPACE_MAX_MEMBERS = int(os.getenv('WORKSPACE_MAX_MEMBERS', '10'))

# Two-factor authentication
TWO_FACTOR_RECOVERY_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
TWO_FACTOR_RECOVERY_CODE_COUNT = 8
TWO_FACTOR_RECOVERY_CODE_LENGTH = 8

# Rate limiting
# Max registration attempts per IP within the period window
RATE_LIMIT_REGISTER = int(os.getenv('RATE_LIMIT_REGISTER', '5'))
# Time window (seconds) for registration rate limiting
RATE_LIMIT_REGISTER_PERIOD = int(os.getenv('RATE_LIMIT_REGISTER_PERIOD', '60'))
# Max login attempts per IP within the period window
RATE_LIMIT_LOGIN = int(os.getenv('RATE_LIMIT_LOGIN', '10'))
# Time window (seconds) for login rate limiting
RATE_LIMIT_LOGIN_PERIOD = int(os.getenv('RATE_LIMIT_LOGIN_PERIOD', '60'))
# Max 2FA verification attempts per IP+user within the period window
RATE_LIMIT_VERIFY_2FA = int(os.getenv('RATE_LIMIT_VERIFY_2FA', '10'))
# Time window (seconds) for 2FA verification rate limiting
RATE_LIMIT_VERIFY_2FA_PERIOD = int(os.getenv('RATE_LIMIT_VERIFY_2FA_PERIOD', '60'))
# Max GDPR data export requests per IP within the period window
RATE_LIMIT_DATA_EXPORT = int(os.getenv('RATE_LIMIT_DATA_EXPORT', '3'))
# Time window (seconds) for data export rate limiting
RATE_LIMIT_DATA_EXPORT_PERIOD = int(os.getenv('RATE_LIMIT_DATA_EXPORT_PERIOD', '3600'))

# Max exchange shortcuts per workspace
EXCHANGE_SHORTCUTS_MAX_PER_WORKSPACE = int(os.getenv('EXCHANGE_SHORTCUTS_MAX_PER_WORKSPACE', '5'))

# Cache configuration (used for rate limiting)
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_URL,
    }
}

# Email configuration
# In development, emails are printed to the console.
# In production, set EMAIL_HOST (and optionally EMAIL_PORT, EMAIL_HOST_USER,
# EMAIL_HOST_PASSWORD, EMAIL_USE_TLS) via environment variables.
_email_host = os.getenv('EMAIL_HOST', '')
if _email_host:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = _email_host
    EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
    EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
    EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
    EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'true').lower() == 'true'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@denarly.com')

# Legal document operator settings (for privacy policy, terms of service)
# Supports both individuals and companies as data controllers
LEGAL_OPERATOR_NAME = os.getenv('LEGAL_OPERATOR_NAME', 'Your Company Name')
LEGAL_OPERATOR_TYPE = os.getenv('LEGAL_OPERATOR_TYPE', 'company')  # 'individual' or 'company'
LEGAL_CONTACT_EMAIL = os.getenv('LEGAL_CONTACT_EMAIL', 'legal@example.com')
LEGAL_CONTACT_ADDRESS = os.getenv('LEGAL_CONTACT_ADDRESS', '')
LEGAL_JURISDICTION = os.getenv('LEGAL_JURISDICTION', 'Your Jurisdiction')

# Production security settings
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
