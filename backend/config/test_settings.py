import os

os.environ.setdefault('SECRET_KEY', 'test-secret-key-for-pytest')
os.environ.setdefault('JWT_SECRET_KEY', 'test-jwt-secret-key-for-pytest')

from config.settings import *
