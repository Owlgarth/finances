import os


def get_int_env(key: str, default: int) -> int:
    value = os.getenv(key, default)
    try:
        return int(value)
    except (ValueError, TypeError):
        raise ValueError(f'{key} must be an integer, got: {os.getenv(key)!r}')
