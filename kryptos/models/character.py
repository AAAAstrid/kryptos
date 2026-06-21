from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class Character(BaseModel):
    id: str
    name: str
    avatar_url: str = ""
    persona: str = ""
    speech_style: str = ""
    hidden_brief: str = ""
    goals: str = ""
    model: str = ""
    api_base: str = ""
    api_key: str = ""
    temperature: float = 0.8
    is_referee: bool = False
    can_host: bool = False
    extensions: dict[str, Any] = Field(default_factory=dict)
