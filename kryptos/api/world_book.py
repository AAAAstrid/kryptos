"""World book API routes."""

from fastapi import APIRouter, HTTPException

from kryptos.api.deps import repo
from kryptos.core.world_book import select_active_entries
from kryptos.models.world_book import (
    WorldBookEntry,
    WorldBookEntryCreate,
    WorldBookEntryUpdate,
    WorldBookSettingsUpdate,
    WorldBookState,
    get_world_book,
    merge_world_book_settings,
    set_world_book,
)

router = APIRouter(prefix="/api/sessions/{session_id}/world-book", tags=["world-book"])


def _dump_book(session_id: str, session, viewer_id: str = "gm") -> dict:
    book = get_world_book(session.game_state)
    active = select_active_entries(session, viewer_id)
    return {
        **book.model_dump(),
        "active_count": len(active),
        "active_entry_ids": [e.id for e in active],
    }


@router.get("")
def api_get_world_book(session_id: str, view: str = "gm"):
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return _dump_book(session_id, session, view)


@router.put("")
def api_replace_world_book(session_id: str, body: WorldBookState):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    session.game_state = set_world_book(session.game_state, body)
    session = repo.update_session(session)
    full = repo.get_session(session_id)
    if not full:
        raise HTTPException(500, "Failed to reload session")
    return _dump_book(session_id, full)


@router.patch("")
def api_update_world_book_settings(session_id: str, body: WorldBookSettingsUpdate):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    updates = body.model_dump(exclude_unset=True)
    session.game_state = merge_world_book_settings(session.game_state, updates)
    session = repo.update_session(session)
    full = repo.get_session(session_id)
    if not full:
        raise HTTPException(500, "Failed to reload session")
    return _dump_book(session_id, full)


@router.post("/entries")
def api_add_world_book_entry(session_id: str, body: WorldBookEntryCreate):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    book = get_world_book(session.game_state)
    entry = WorldBookEntry(**body.model_dump())
    if not entry.order:
        entry.order = len(book.entries)
    book.entries.append(entry)
    session.game_state = set_world_book(session.game_state, book)
    repo.update_session(session)
    full = repo.get_session(session_id)
    if not full:
        raise HTTPException(500, "Failed to reload session")
    data = _dump_book(session_id, full)
    data["entry"] = entry.model_dump()
    return data


@router.patch("/entries/{entry_id}")
def api_update_world_book_entry(session_id: str, entry_id: str, body: WorldBookEntryUpdate):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    book = get_world_book(session.game_state)
    idx = next((i for i, e in enumerate(book.entries) if e.id == entry_id), None)
    if idx is None:
        raise HTTPException(404, "Entry not found")
    current = book.entries[idx].model_dump()
    for key, val in body.model_dump(exclude_unset=True).items():
        current[key] = val
    book.entries[idx] = WorldBookEntry.model_validate(current)
    session.game_state = set_world_book(session.game_state, book)
    repo.update_session(session)
    full = repo.get_session(session_id)
    if not full:
        raise HTTPException(500, "Failed to reload session")
    data = _dump_book(session_id, full)
    data["entry"] = book.entries[idx].model_dump()
    return data


@router.delete("/entries/{entry_id}")
def api_delete_world_book_entry(session_id: str, entry_id: str):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    book = get_world_book(session.game_state)
    new_entries = [e for e in book.entries if e.id != entry_id]
    if len(new_entries) == len(book.entries):
        raise HTTPException(404, "Entry not found")
    book.entries = new_entries
    session.game_state = set_world_book(session.game_state, book)
    repo.update_session(session)
    full = repo.get_session(session_id)
    if not full:
        raise HTTPException(500, "Failed to reload session")
    return _dump_book(session_id, full)
