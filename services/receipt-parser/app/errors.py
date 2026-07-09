"""Typed parser errors mapped to contract error codes + HTTP status.

Foreseeable conditions never surface as a bare 500 — each raises a ParserError
that main.py renders as the contract error shape.
"""


class ParserError(Exception):
    http_status: int = 500
    code: str = 'internal_error'

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class UnsupportedMediaType(ParserError):
    http_status = 400
    code = 'unsupported_media_type'


class FileTooLarge(ParserError):
    http_status = 400
    code = 'file_too_large'


class Unauthorized(ParserError):
    http_status = 401
    code = 'unauthorized'


class UnreadableInput(ParserError):
    http_status = 422
    code = 'unreadable_input'


class ModelUnavailable(ParserError):
    http_status = 503
    code = 'model_unavailable'
