"""Minimal pytest configuration for Django."""

import sys
from pathlib import Path

import pytest

# Add backend directory to Python path so config can be found
sys.path.insert(0, str(Path(__file__).parent))


@pytest.fixture(scope='session', autouse=True)
def seed_legal_documents(django_db_setup, django_db_blocker):
    """Seed LegalDocument records into the test DB once per session.

    The RegisterIn schema validates accepted version strings against the active
    LegalDocument rows, so any test that exercises the /register endpoint will
    get a 503 unless these records exist.  The management command is idempotent
    (skips rows that are already present), so it is safe to run on every session
    including --reuse-db runs.
    """
    from django.core.management import call_command

    with django_db_blocker.unblock():
        call_command('seed_legal_documents', verbosity=0)


@pytest.fixture(scope='session', autouse=True)
def seed_currencies(django_db_setup, django_db_blocker):
    """Seed the global ISO 4217 currency catalog once per session.

    WorkspaceService.create_workspace enables the chosen currency from the
    catalog, so any test creating a workspace via the service needs these rows.
    The command is idempotent (update_or_create), so it is safe on --reuse-db.
    """
    from django.core.management import call_command

    with django_db_blocker.unblock():
        call_command('seed_currencies', verbosity=0)
