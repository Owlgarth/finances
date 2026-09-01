#!/bin/bash
set -e

echo "Compiling translation files..."
uv run python manage.py compilemessages

echo "Starting Celery..."
exec uv run "$@"
