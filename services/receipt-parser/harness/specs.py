"""Fixture receipts as (rendered text, expected contract output).

Receipts are rendered to PNGs from these text specs (generate_fixtures.py) so
fixtures are reproducible and diverse without committing photo blobs. Expected
outputs use the CONTRACT.md v1 shape; scoring compares against them.

Real photographed receipts can be dropped into fixtures/<name>/receipt.png with a
matching expected.json to extend coverage beyond these synthetic ones.
"""

FIXTURES: list[dict] = [
    {
        'name': 'lidl_pln_groceries',
        'lines': [
            'LIDL sp. z o.o.',
            'ul. Poznanska 48, Warszawa',
            'NIP 781-18-97-358',
            '2026-06-14  14:22',
            '--------------------------',
            'Chleb wiejski 500g    4,49 A',
            'Maslo ekstra 200g',
            '  2 x 7,99          15,98 A',
            'Pomidory luz',
            '  0,782 x 9,99       7,81 B',
            'Ser Gouda plastry    14,69 A',
            '--------------------------',
            'SUMA PLN            42,97',
            'Karta               42,97',
        ],
        'expected': {
            'merchant': 'LIDL',
            'date': '2026-06-14',
            'currency': 'PLN',
            'total': '42.97',
            'items': [
                {'name': 'Chleb wiejski 500g', 'line_total': '4.49'},
                {'name': 'Maslo ekstra 200g', 'line_total': '15.98'},
                {'name': 'Pomidory luz', 'line_total': '7.81'},
                {'name': 'Ser Gouda plastry', 'line_total': '14.69'},
            ],
        },
    },
    {
        'name': 'cafe_eur',
        'lines': [
            'Cafe Central',
            'Wien, Herrengasse 14',
            '02.05.2026',
            '----------------------',
            'Espresso doppio',
            '  2 x 3,20      6,40',
            'Apfelstrudel    5,90',
            'Mineralwasser   3,50',
            '----------------------',
            'Summe EUR      15,80',
        ],
        'expected': {
            'merchant': 'Cafe Central',
            'date': '2026-05-02',
            'currency': 'EUR',
            'total': '15.80',
            'items': [
                {'name': 'Espresso doppio', 'line_total': '6.40'},
                {'name': 'Apfelstrudel', 'line_total': '5.90'},
                {'name': 'Mineralwasser', 'line_total': '3.50'},
            ],
        },
    },
    {
        'name': 'hardware_usd',
        'lines': [
            'CITY HARDWARE',
            '123 Main St',
            '06/28/2026',
            '======================',
            'Wood screws box   4.99',
            'Paint roller      8.49',
            'Masking tape 2pk  6.00',
            '======================',
            'TOTAL         $19.48',
            'VISA          $19.48',
        ],
        'expected': {
            'merchant': 'CITY HARDWARE',
            'date': '2026-06-28',
            'currency': 'USD',
            'total': '19.48',
            'items': [
                {'name': 'Wood screws box', 'line_total': '4.99'},
                {'name': 'Paint roller', 'line_total': '8.49'},
                {'name': 'Masking tape 2pk', 'line_total': '6.00'},
            ],
        },
    },
    {
        'name': 'grocery_gbp_discount',
        'lines': [
            'Tesco Express',
            'London EC1',
            '14 Jun 2026',
            '----------------------',
            'Milk 2L         1.45',
            'Cheddar 400g    3.50',
            'Clubcard disc  -0.50',
            'Bananas loose   0.89',
            '----------------------',
            'Total GBP       5.34',
        ],
        'expected': {
            'merchant': 'Tesco Express',
            'date': '2026-06-14',
            'currency': 'GBP',
            'total': '5.34',
            'items': [
                {'name': 'Milk 2L', 'line_total': '1.45'},
                {'name': 'Cheddar 400g', 'line_total': '3.50'},
                {'name': 'Bananas loose', 'line_total': '0.89'},
            ],
        },
    },
]
