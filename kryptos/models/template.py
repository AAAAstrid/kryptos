from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from kryptos.models.message import Visibility


class ActionSpec(BaseModel):
    type: str
    label: str
    visibility: Visibility = Visibility.PUBLIC
    viewers_mode: str = "self_and_referee"
    required: bool = False
    max_per_actor: int = 1


class PhaseSpec(BaseModel):
    id: str
    name: str
    description: str = ""
    turn_mode: Literal["sequential", "simultaneous", "free", "referee_only"] = "free"
    turn_order: list[str] = Field(default_factory=list)
    allowed_actions: list[ActionSpec] = Field(default_factory=list)
    entry_briefing: str = ""
    exit_condition: str = ""
    max_rounds: int | None = None


class GameTemplate(BaseModel):
    id: str
    name: str
    description: str = ""
    min_players: int = 2
    max_players: int = 8
    phases: list[PhaseSpec] = Field(default_factory=list)
    initial_state: dict[str, Any] = Field(default_factory=dict)
    referee_system_prompt: str = ""
    player_system_prompt: str = ""
