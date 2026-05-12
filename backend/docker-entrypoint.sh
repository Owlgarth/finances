#!/bin/bash
set -e

echo "Running database migrations..."
uv run python manage.py migrate --noinput

echo "Seeding legal documents..."
uv run python manage.py seed_legal_documents

echo "Starting server..."
exec "$@"
