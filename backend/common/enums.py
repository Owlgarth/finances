from enum import StrEnum


class TotalsLabel(StrEnum):
    """Labels used in totals aggregation responses.

    NOTE: The current "Uncategorized" label could collide with a user-created
    category of the same name. A future improvement should use a sentinel value
    (e.g. __uncategorized__) here and handle i18n/display on the frontend.
    """

    UNCATEGORIZED = 'Uncategorized'
