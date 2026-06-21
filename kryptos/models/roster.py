"""Session–character membership with per-session secrets."""

from pydantic import BaseModel, Field


class SessionCharacterLink(BaseModel):
    session_id: str
    character_id: str
    hidden_brief: str = ""
    goals: str = ""


class SessionCharacterUpdate(BaseModel):
    """Per-session fields (secrets / goals for this game only)."""

    hidden_brief: str | None = None
    goals: str | None = None


class JoinCharacterRequest(BaseModel):
    """Join an existing global character to a session."""

    character_id: str
