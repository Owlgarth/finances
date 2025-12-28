"""Common schemas shared across domains."""

from pydantic import BaseModel


class MessageOut(BaseModel):
    """Generic message output schema."""

    message: str


class ErrorOut(BaseModel):
    """Error output schema."""

    error: str


class DetailOut(BaseModel):
    """Detail output schema."""

    detail: str
