"""Minimal pytest configuration for Django."""

import sys
from pathlib import Path

# Add backend directory to Python path so config can be found
sys.path.insert(0, str(Path(__file__).parent))
