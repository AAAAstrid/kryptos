"""Per-session world book / lore entries (stored in game_state.world_book)."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field


class WorldBookEntry(BaseModel):
    id: str = Field(default_factory=lambda: f"wb_{uuid.uuid4().hex[:8]}")
    title: str = ""
    content: str = ""
    keys: list[str] = Field(default_factory=list)
    constant: bool = False
    enabled: bool = True
    order: int = 0


class WorldBookState(BaseModel):
    entries: list[WorldBookEntry] = Field(default_factory=list)
    scan_depth: int = Field(default=40, ge=5, le=120)
    max_chars: int = Field(default=3500, ge=500, le=12000)


class WorldBookEntryCreate(BaseModel):
    title: str = ""
    content: str = ""
    keys: list[str] = Field(default_factory=list)
    constant: bool = False
    enabled: bool = True
    order: int = 0


class WorldBookEntryUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    keys: list[str] | None = None
    constant: bool | None = None
    enabled: bool | None = None
    order: int | None = None


class WorldBookSettingsUpdate(BaseModel):
    scan_depth: int | None = Field(default=None, ge=5, le=120)
    max_chars: int | None = Field(default=None, ge=500, le=12000)


DEFAULT_WORLD_BOOK: dict[str, Any] = WorldBookState().model_dump()


def get_world_book(game_state: dict[str, Any] | None) -> WorldBookState:
    raw = (game_state or {}).get("world_book") or {}
    merged = {**DEFAULT_WORLD_BOOK, **raw}
    entries = merged.get("entries") or []
    parsed_entries = []
    for item in entries:
        try:
            parsed_entries.append(WorldBookEntry.model_validate(item))
        except Exception:
            continue
    merged["entries"] = parsed_entries
    return WorldBookState.model_validate(merged)


def set_world_book(game_state: dict[str, Any], book: WorldBookState) -> dict[str, Any]:
    out = dict(game_state or {})
    out["world_book"] = book.model_dump()
    return out


def merge_world_book_settings(game_state: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    book = get_world_book(game_state)
    data = book.model_dump()
    for key in ("scan_depth", "max_chars"):
        if updates.get(key) is not None:
            data[key] = updates[key]
    return set_world_book(game_state, WorldBookState.model_validate(data))


def normalize_keys(raw: list[str] | str | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = raw.replace("\n", ",").split(",")
        return [p.strip() for p in parts if p.strip()]
    return [str(k).strip() for k in raw if str(k).strip()]
