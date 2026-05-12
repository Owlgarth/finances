#!/bin/bash
set -e

echo "Starting Celery..."
exec uv run "$@"
