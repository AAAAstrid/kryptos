"""Global character roster API."""

from fastapi import APIRouter, HTTPException

from kryptos.api.deps import repo
from kryptos.models.character import Character
from kryptos.models.session import CharacterCreate, CharacterUpdate
from kryptos.storage.sqlite_repo import new_character_id

router = APIRouter(prefix="/api/characters", tags=["roster"])


@router.get("")
def api_list_characters():
    chars = repo.list_global_characters()
    return [
        {
            **c.model_dump(),
            "session_ids": repo.get_character_session_ids(c.id),
        }
        for c in chars
    ]


@router.post("")
def api_create_character(body: CharacterCreate):
    char_id = new_character_id()
    if body.is_referee:
        import uuid

        char_id = f"referee_{uuid.uuid4().hex[:6]}"
    char = Character(id=char_id, **body.model_dump())
    repo.create_global_character(char)
    return char.model_dump()


@router.patch("/{char_id}")
def api_update_global_character(char_id: str, body: CharacterUpdate):
    updates = body.model_dump(exclude_unset=True)
    link_only = {"hidden_brief", "goals"}
    updates = {k: v for k, v in updates.items() if k not in link_only}
    char = repo.update_global_character(char_id, updates)
    if not char:
        raise HTTPException(404, "Character not found")
    return char.model_dump()


@router.delete("/{char_id}")
def api_delete_global_character(char_id: str):
    if not repo.delete_global_character(char_id):
        raise HTTPException(404, "Character not found")
    return {"ok": True}
