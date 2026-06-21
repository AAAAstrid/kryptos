from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
import uuid

from pydantic import BaseModel, Field

from kryptos.models.character import Character
from kryptos.models.message import Message, MessageKind, Visibility


class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    template_id: str = ""
    characters: dict[str, Character] = Field(default_factory=dict)
    messages: list[Message] = Field(default_factory=list)
    game_state: dict[str, Any] = Field(default_factory=dict)
    current_phase_id: str = ""
    round: int = 0
    active_referee_id: str = "referee"
    status: Literal["setup", "running", "paused", "ended"] = "setup"
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class MessageCreate(BaseModel):
    sender_id: str = "gm"
    sender_role: Literal["referee", "player", "gm", "narrator"] = "gm"
    kind: MessageKind = MessageKind.SPEECH
    content: str
    visibility: Visibility = Visibility.PUBLIC
    viewers: list[str] = Field(default_factory=list)
    phase_id: str = ""
    round: int = 0
    action_type: str | None = None
    action_payload: dict[str, Any] = Field(default_factory=dict)
    memory_for: list[str] = Field(default_factory=list)


class SessionCreate(BaseModel):
    title: str
    template_id: str = ""


class CharacterCreate(BaseModel):
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


class CharacterUpdate(BaseModel):
    name: str | None = None
    avatar_url: str | None = None
    persona: str | None = None
    speech_style: str | None = None
    hidden_brief: str | None = None
    goals: str | None = None
    model: str | None = None
    api_base: str | None = None
    api_key: str | None = None
    temperature: float | None = None
    is_referee: bool | None = None
    can_host: bool | None = None
    extensions: dict[str, Any] | None = None
