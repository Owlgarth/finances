"""Environment-driven configuration.

Provider selection is env-only. Two backends exist:

- ``openai`` (default): any OpenAI-compatible chat-completions endpoint — point
  MODEL_BASE_URL at a local runtime (llama.cpp/Ollama/vLLM) or a hosted API.
- ``gemini``: the Google Gemini API (native REST), selected with
  PARSER_MODEL_PROVIDER=gemini + PARSER_GEMINI_API_KEY.

Switching is one env change; nothing else in the pipeline differs.
"""

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='PARSER_', env_file='.env', extra='ignore')

    # Bearer token callers must present. Required in production; empty disables auth (tests/local only).
    api_token: str = ''

    # Which model backend to use for extraction.
    model_provider: Literal['openai', 'gemini'] = 'openai'

    # openai provider: OpenAI-compatible chat-completions endpoint.
    model_base_url: str = 'http://localhost:11434/v1'
    model_name: str = 'qwen2.5-vl'
    model_api_key: str = 'not-needed'
    model_timeout_seconds: float = 90.0
    # json_schema constrains decoding to the contract shape; endpoints that
    # reject it (4xx) fall back to json_object once per process.
    structured_output: Literal['json_schema', 'json_object'] = 'json_schema'

    # gemini provider: Google Gemini API. The key is required when selected —
    # extraction and /health fail with model_unavailable until it is set.
    gemini_api_key: str = ''
    gemini_model: str = 'gemini-3.1-flash-lite'
    gemini_base_url: str = 'https://generativelanguage.googleapis.com/v1beta'
    # Thinking level for Gemini 3 models (low|medium|high). Empty omits the
    # thinking config entirely (provider default applies).
    gemini_thinking_level: str = 'low'

    # Upload limits and rendering.
    max_file_mb: int = 15
    pdf_render_scale: float = 2.0  # ~144 DPI at scale 2; enough for thermal receipts.
    pdf_max_pages: int = 10

    # Machine-extracted transcript (PDF text layer / OCR) sent alongside images.
    transcript_max_chars: int = 8000
    ocr_enabled: bool = True

    @property
    def active_model_name(self) -> str:
        return self.gemini_model if self.model_provider == 'gemini' else self.model_name


settings = Settings()
