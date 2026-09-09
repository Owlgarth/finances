"""Font registry loaded from the canonical fonts.json file.

fonts.json is the single source of truth shared with the frontend (which
imports it cross-tree via a relative import). This module is the backend's
typed view of it; validators and defaults read these constants instead of
hardcoding font lists.
"""

import json
from pathlib import Path

REGISTRY_PATH = Path(__file__).resolve().parent / 'fonts.json'

with open(REGISTRY_PATH, encoding='utf-8') as f:
    _REGISTRY = json.load(f)

FONT_CODES: tuple[str, ...] = tuple(font['code'] for font in _REGISTRY['fonts'])
DEFAULT_FONT: str = _REGISTRY['defaultFont']
