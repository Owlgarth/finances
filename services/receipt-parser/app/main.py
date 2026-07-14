"""FastAPI app exposing POST /parse and GET /health per CONTRACT.md v1."""

from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, Request, UploadFile
from fastapi.responses import JSONResponse

from app import SCHEMA_VERSION, llm, parser
from app.auth import require_token
from app.config import settings
from app.errors import FileTooLarge, ParserError
from app.images import decode_to_images
from app.schemas import ErrorResult, HealthResult, ParseResult

logger = logging.getLogger(__name__)

app = FastAPI(title='Denarly Receipt Parser', version='1.0.0')

if not settings.api_token:
    logger.warning('PARSER_API_TOKEN is not set — /parse is unauthenticated. Set it in every real deployment.')


@app.exception_handler(ParserError)
async def parser_error_handler(_request: Request, exc: ParserError) -> JSONResponse:
    """Render every foreseeable failure as the contract error shape (never a bare 500)."""
    body = ErrorResult.model_validate({'error': {'code': exc.code, 'message': exc.message}})
    return JSONResponse(status_code=exc.http_status, content=body.model_dump())


@app.get('/health', response_model=HealthResult, responses={503: {'model': ErrorResult}})
async def health() -> HealthResult:
    await llm.ping()
    return HealthResult(status='ok', model=settings.model_name)


@app.post('/parse', response_model=ParseResult, responses={400: {'model': ErrorResult}})
async def parse_receipt(file: UploadFile, _auth: None = Depends(require_token)) -> ParseResult:
    limit = settings.max_file_mb * 1024 * 1024
    # Read at most limit+1 bytes so an oversized upload is rejected without
    # buffering the whole body in memory.
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise FileTooLarge(f'File exceeds the {settings.max_file_mb} MB limit.')

    images, truncated = decode_to_images(content, file.content_type or '')
    return await parser.parse(images, truncated)


@app.get('/')
async def root() -> dict:
    return {'service': 'receipt-parser', 'schema_version': SCHEMA_VERSION}
