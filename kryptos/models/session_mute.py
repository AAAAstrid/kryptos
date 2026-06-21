"""Per-session character mute list (stored in game_state.muted_characters)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class MuteUpdate(BaseModel):
    muted: bool


def get_muted_characters(game_state: dict[str, Any] | None) -> set[str]:
    raw = (game_state or {}).get("muted_characters") or []
    return {str(x) for x in raw if x}


def is_character_muted(game_state: dict[str, Any] | None, char_id: str) -> bool:
    return char_id in get_muted_characters(game_state)


def set_character_muted(game_state: dict[str, Any], char_id: str, muted: bool) -> dict[str, Any]:
    out = dict(game_state or {})
    current = list(get_muted_characters(out))
    if muted:
        if char_id not in current:
            current.append(char_id)
    else:
        current = [x for x in current if x != char_id]
    out["muted_characters"] = current
    return out


def remove_muted_character(game_state: dict[str, Any], char_id: str) -> dict[str, Any]:
    return set_character_muted(game_state or {}, char_id, False)
