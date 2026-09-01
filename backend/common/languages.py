"""Language registry loaded from the canonical languages.json file.

languages.json is the single source of truth shared with the frontend (which
imports it cross-tree via a relative import). This module is the backend's
typed view of it; validators and defaults read these constants instead of
hardcoding language lists.
"""

import json
from pathlib import Path

REGISTRY_PATH = Path(__file__).resolve().parent / 'languages.json'

with open(REGISTRY_PATH, encoding='utf-8') as f:
    _REGISTRY = json.load(f)

LANGUAGE_CODES: tuple[str, ...] = tuple(lang['code'] for lang in _REGISTRY['languages'])
NUMBER_FORMAT_CODES: tuple[str, ...] = tuple(fmt['code'] for fmt in _REGISTRY['numberFormats'])
DEFAULT_LANGUAGE: str = _REGISTRY['defaultLanguage']
DEFAULT_NUMBER_FORMAT: str = _REGISTRY['defaultNumberFormat']
