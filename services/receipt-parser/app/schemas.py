"""Pydantic models mirroring API.md v1. Money values are decimal strings."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app import SCHEMA_VERSION


class Item(BaseModel):
    name: str
    quantity: str = '1'
    unit_price: str | None = None
    line_total: str | None = None
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class Confidence(BaseModel):
    merchant: float = Field(0.0, ge=0.0, le=1.0)
    date: float = Field(0.0, ge=0.0, le=1.0)
    currency: float = Field(0.0, ge=0.0, le=1.0)
    total: float = Field(0.0, ge=0.0, le=1.0)
    items: float = Field(0.0, ge=0.0, le=1.0)


class ParseResult(BaseModel):
    schema_version: str = SCHEMA_VERSION
    merchant: str | None = None
    date: str | None = None
    currency: str | None = None
    total: str | None = None
    items: list[Item] = Field(default_factory=list)
    confidence: Confidence = Field(default_factory=Confidence)
    warnings: list[str] = Field(default_factory=list)


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResult(BaseModel):
    schema_version: str = SCHEMA_VERSION
    error: ErrorDetail


class HealthResult(BaseModel):
    status: str
    model: str
