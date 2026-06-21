"""Session character membership API."""

import uuid

from fastapi import APIRouter, HTTPException

from kryptos.api.deps import repo
from kryptos.models.character import Character
from kryptos.models.roster import JoinCharacterRequest
from kryptos.models.session import CharacterCreate, CharacterUpdate
from kryptos.models.session_mute import MuteUpdate, remove_muted_character, set_character_muted
from kryptos.storage.sqlite_repo import new_character_id

router = APIRouter(prefix="/api/sessions/{session_id}/characters", tags=["characters"])


@router.get("")
def api_list_session_characters(session_id: str):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    return [c.model_dump() for c in session.characters.values()]


@router.post("")
def api_add_character(session_id: str, body: CharacterCreate):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")

    char_id = new_character_id()
    if body.is_referee:
        char_id = f"referee_{uuid.uuid4().hex[:6]}"

    char = Character(id=char_id, **body.model_dump())
    repo.add_character(session_id, char)
    return char.model_dump()


@router.post("/join")
def api_join_character(session_id: str, body: JoinCharacterRequest):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    if not repo.get_global_character(body.character_id):
        raise HTTPException(404, "Character not found")
    repo.join_session(session_id, body.character_id)
    session = repo.get_session(session_id, with_messages=False)
    char = session.characters.get(body.character_id)
    if not char:
        raise HTTPException(500, "Failed to join character")
    return char.model_dump()


@router.patch("/{char_id}/mute")
def api_mute_character(session_id: str, char_id: str, body: MuteUpdate):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    if char_id not in session.characters:
        raise HTTPException(404, "Character not in this session")
    session.game_state = set_character_muted(session.game_state, char_id, body.muted)
    repo.update_session(session)
    char = session.characters[char_id]
    return {
        "ok": True,
        "character_id": char_id,
        "muted": body.muted,
        "muted_characters": list(session.game_state.get("muted_characters") or []),
        "name": char.name,
    }


@router.patch("/{char_id}")
def api_update_character(session_id: str, char_id: str, body: CharacterUpdate):
    updates = body.model_dump(exclude_unset=True)
    char = repo.update_character(session_id, char_id, updates)
    if not char:
        raise HTTPException(404, "Character not in this session")
    return char.model_dump()


@router.delete("/{char_id}")
def api_remove_character(session_id: str, char_id: str):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    if char_id not in session.characters:
        raise HTTPException(404, "Character not in this session")
    session.game_state = remove_muted_character(session.game_state, char_id)
    repo.update_session(session)
    if not repo.delete_character(session_id, char_id):
        raise HTTPException(404, "Character not in this session")
    return {"ok": True}
