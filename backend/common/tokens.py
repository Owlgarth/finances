from django.conf import settings
from django.core.signing import TimestampSigner


def generate_verification_token(user_id: int) -> str:
    signer = TimestampSigner()
    return signer.sign(str(user_id))


def verify_verification_token(token: str, max_age: int | None = None) -> int | None:
    if max_age is None:
        max_age = settings.TOKEN_MAX_AGE
    signer = TimestampSigner()
    try:
        value = signer.unsign(token, max_age=max_age)
        return int(value)
    except Exception:
        return None


def generate_email_change_token(user_id: int, new_email: str) -> str:
    signer = TimestampSigner()
    return signer.sign_object({'uid': user_id, 'email': new_email})


def verify_email_change_token(token: str, max_age: int | None = None) -> tuple[int, str] | None:
    if max_age is None:
        max_age = settings.TOKEN_MAX_AGE
    signer = TimestampSigner()
    try:
        data = signer.unsign_object(token, max_age=max_age)
        return data['uid'], data['email']
    except Exception:
        return None
