"""Per-session auto multi-character dialogue settings (stored in game_state.auto_dialogue)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AutoDialogueSettings(BaseModel):
    enabled: bool = False
    interval_sec: float = Field(default=8.0, ge=2.0, le=120.0)
    max_turns: int = Field(default=6, ge=1, le=30)
    continuous: bool = False
    include_referee: bool = False
    speaker_mode: Literal["rotate", "random"] = "rotate"


class AutoDialogueUpdate(BaseModel):
    enabled: bool | None = None
    interval_sec: float | None = Field(default=None, ge=2.0, le=120.0)
    max_turns: int | None = Field(default=None, ge=1, le=30)
    continuous: bool | None = None
    include_referee: bool | None = None
    speaker_mode: Literal["rotate", "random"] | None = None


DEFAULT_AUTO_DIALOGUE: dict[str, Any] = AutoDialogueSettings().model_dump()


def get_auto_dialogue(game_state: dict[str, Any] | None) -> AutoDialogueSettings:
    raw = (game_state or {}).get("auto_dialogue") or {}
    merged = {**DEFAULT_AUTO_DIALOGUE, **raw}
    return AutoDialogueSettings.model_validate(merged)


def merge_auto_dialogue(game_state: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    current = get_auto_dialogue(game_state).model_dump()
    for k, v in updates.items():
        if v is not None:
            current[k] = v
    out = dict(game_state)
    out["auto_dialogue"] = current
    return out
