"""Render each spec's text into fixtures/<name>/receipt.png + expected.json.

Deterministic: run once, or re-run after editing specs.py. Uses a default PIL
font so no font files need committing.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from specs import FIXTURES

FIXTURES_DIR = Path(__file__).parent / 'fixtures'
LINE_HEIGHT = 26
PADDING = 24
WIDTH = 380


def _font() -> ImageFont.ImageFont:
    # Default bitmap font renders legibly enough for a vision model on synthetic receipts.
    return ImageFont.load_default(size=18)


def render(lines: list[str]) -> Image.Image:
    height = PADDING * 2 + LINE_HEIGHT * len(lines)
    image = Image.new('RGB', (WIDTH, height), 'white')
    draw = ImageDraw.Draw(image)
    font = _font()
    for index, line in enumerate(lines):
        draw.text((PADDING, PADDING + index * LINE_HEIGHT), line, fill='black', font=font)
    return image


def main() -> None:
    FIXTURES_DIR.mkdir(exist_ok=True)
    for spec in FIXTURES:
        case_dir = FIXTURES_DIR / spec['name']
        case_dir.mkdir(exist_ok=True)
        render(spec['lines']).save(case_dir / 'receipt.png')
        (case_dir / 'expected.json').write_text(json.dumps(spec['expected'], indent=2, ensure_ascii=False))
        print(f'  wrote {spec["name"]}')
    print(f'Generated {len(FIXTURES)} fixtures in {FIXTURES_DIR}')


if __name__ == '__main__':
    main()
