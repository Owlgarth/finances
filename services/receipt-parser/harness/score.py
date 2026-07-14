"""Score the parser against the fixtures by hitting a live /parse endpoint.

Usage:
    uv run python score.py [--url http://localhost:8100] [--token TOKEN]

Metrics per fixture:
  - total_ok:      parsed total exactly equals expected total
  - currency_ok:   parsed currency equals expected
  - date_ok:       parsed date equals expected
  - merchant_ok:   case-insensitive substring match either direction
  - item_recall:   fraction of expected items matched by fuzzy name + exact line_total

Prints a per-fixture table and aggregate means, then exits non-zero if the
parser is unreachable so CI can catch a broken service.
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

FIXTURES_DIR = Path(__file__).parent / 'fixtures'


def _norm_name(name: str) -> str:
    return ''.join(c for c in name.lower() if c.isalnum())


def _item_recall(expected_items: list[dict], parsed_items: list[dict]) -> float:
    if not expected_items:
        return 1.0
    parsed = [(_norm_name(i.get('name', '')), i.get('line_total')) for i in parsed_items]
    matched = 0
    for exp in expected_items:
        exp_name = _norm_name(exp['name'])
        exp_total = exp.get('line_total')
        for p_name, p_total in parsed:
            name_ok = exp_name in p_name or p_name in exp_name
            total_ok = exp_total is None or p_total == exp_total
            if name_ok and total_ok:
                matched += 1
                break
    return matched / len(expected_items)


def _merchant_ok(expected: str | None, parsed: str | None) -> bool:
    if not expected:
        return True
    if not parsed:
        return False
    e, p = expected.lower(), parsed.lower()
    return e in p or p in e


def score_fixture(client: httpx.Client, url: str, headers: dict, case_dir: Path) -> dict:
    expected = json.loads((case_dir / 'expected.json').read_text())
    with open(case_dir / 'receipt.png', 'rb') as fh:
        response = client.post(
            f'{url.rstrip("/")}/parse',
            files={'file': ('receipt.png', fh, 'image/png')},
            headers=headers,
            timeout=120.0,
        )
    if response.status_code != 200:
        return {'name': case_dir.name, 'error': f'HTTP {response.status_code}'}
    parsed = response.json()
    return {
        'name': case_dir.name,
        'total_ok': parsed.get('total') == expected.get('total'),
        'currency_ok': parsed.get('currency') == expected.get('currency'),
        'date_ok': parsed.get('date') == expected.get('date'),
        'merchant_ok': _merchant_ok(expected.get('merchant'), parsed.get('merchant')),
        'item_recall': _item_recall(expected.get('items', []), parsed.get('items', [])),
    }


def main() -> int:
    argp = argparse.ArgumentParser()
    argp.add_argument('--url', default='http://localhost:8100')
    argp.add_argument('--token', default='')
    args = argp.parse_args()

    if not FIXTURES_DIR.exists():
        print('No fixtures found — run: uv run python generate_fixtures.py', file=sys.stderr)
        return 2

    headers = {'Authorization': f'Bearer {args.token}'} if args.token else {}
    cases = sorted(p for p in FIXTURES_DIR.iterdir() if p.is_dir())

    results = []
    with httpx.Client() as client:
        # Fail fast if the service is down.
        try:
            client.get(f'{args.url.rstrip("/")}/', timeout=5.0)
        except httpx.HTTPError as exc:
            print(f'Parser unreachable at {args.url}: {exc}', file=sys.stderr)
            return 1
        for case_dir in cases:
            results.append(score_fixture(client, args.url, headers, case_dir))

    header = f'{"fixture":<26} {"total":>6} {"curr":>5} {"date":>5} {"merch":>6} {"items":>6}'
    print(header)
    print('-' * len(header))
    scored = [r for r in results if 'error' not in r]
    for r in results:
        if 'error' in r:
            print(f'{r["name"]:<26} {r["error"]}')
            continue
        print(
            f'{r["name"]:<26} '
            f'{"✓" if r["total_ok"] else "✗":>6} '
            f'{"✓" if r["currency_ok"] else "✗":>5} '
            f'{"✓" if r["date_ok"] else "✗":>5} '
            f'{"✓" if r["merchant_ok"] else "✗":>6} '
            f'{r["item_recall"]:>6.0%}'
        )

    if scored:
        def mean(key):
            return sum(1 if r[key] else 0 for r in scored) / len(scored) if isinstance(scored[0][key], bool) else sum(
                r[key] for r in scored
            ) / len(scored)

        print('-' * len(header))
        print(
            f'{"MEAN":<26} '
            f'{mean("total_ok"):>6.0%} '
            f'{mean("currency_ok"):>5.0%} '
            f'{mean("date_ok"):>5.0%} '
            f'{mean("merchant_ok"):>6.0%} '
            f'{mean("item_recall"):>6.0%}'
        )
    return 0


if __name__ == '__main__':
    sys.exit(main())
