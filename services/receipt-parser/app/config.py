"""Environment-driven configuration.

Provider selection is env-only: point MODEL_BASE_URL at a local runtime
(Ollama/vLLM) or a hosted OpenAI-compatible endpoint and set the model + key.
The service code never changes between providers.
"""

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='PARSER_', env_file='.env', extra='ignore')

    # Bearer token callers must present. Required in production; empty disables auth (tests/local only).
    api_token: str = ''

    # OpenAI-compatible chat-completions endpoint.
    model_base_url: str = 'http://localhost:11434/v1'
    model_name: str = 'qwen2.5-vl'
    model_api_key: str = 'not-needed'
    model_timeout_seconds: float = 90.0
    # json_schema constrains decoding to the contract shape; endpoints that
    # reject it (4xx) fall back to json_object once per process.
    structured_output: Literal['json_schema', 'json_object'] = 'json_schema'

    # Upload limits and rendering.
    max_file_mb: int = 15
    pdf_render_scale: float = 2.0  # ~144 DPI at scale 2; enough for thermal receipts.
    pdf_max_pages: int = 10

    # Machine-extracted transcript (PDF text layer / OCR) sent alongside images.
    transcript_max_chars: int = 8000
    ocr_enabled: bool = True


settings = Settings()
