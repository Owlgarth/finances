"""Custom JSON encoder for GDPR data exports."""

import json
from datetime import date, datetime
from decimal import Decimal


class GDPREncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal, datetime, and date types for GDPR data exports."""

    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        return super().default(obj)
