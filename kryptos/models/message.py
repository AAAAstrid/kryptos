from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal
import uuid

from pydantic import BaseModel, Field


class Visibility(str, Enum):
    PUBLIC = "public"
    RESTRICTED = "restricted"
    SYSTEM = "system"


class MessageKind(str, Enum):
    SPEECH = "speech"
    WHISPER = "whisper"
    ACTION = "action"
    REVEAL = "reveal"
    CLUE = "clue"
    NARRATION = "narration"
    STATE_CHANGE = "state_change"


class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    sender_id: str
    sender_role: Literal["referee", "player", "gm", "narrator"]
    kind: MessageKind
    content: str
    reasoning_content: str = ""
    visibility: Visibility
    viewers: list[str] = Field(default_factory=list)
    phase_id: str = ""
    round: int = 0
    action_type: str | None = None
    action_payload: dict[str, Any] = Field(default_factory=dict)
    memory_for: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
