"""Session API routes."""

from fastapi import APIRouter, HTTPException

from kryptos.api.deps import repo
from kryptos.games.registry import get_template
from kryptos.models.auto_dialogue import AutoDialogueUpdate, get_auto_dialogue, merge_auto_dialogue
from kryptos.models.session import SessionCreate

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
def api_list_sessions():
    sessions = repo.list_sessions()
    return [
        {
            "id": s.id,
            "title": s.title,
            "template_id": s.template_id,
            "status": s.status,
            "character_count": len(s.characters),
            "message_count": len(s.messages),
            "updated_at": s.updated_at.isoformat(),
        }
        for s in sessions
    ]


@router.post("")
def api_create_session(body: SessionCreate):
    session = repo.create_session(body.title, body.template_id)
    if body.template_id:
        template = get_template(body.template_id)
        if template:
            session.game_state = dict(template.initial_state)
            session.current_phase_id = template.phases[0].id if template.phases else ""
            session = repo.update_session(session)
    return session.model_dump()


@router.get("/{session_id}")
def api_get_session(session_id: str):
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return session.model_dump()


@router.delete("/{session_id}")
def api_delete_session(session_id: str):
    if not repo.delete_session(session_id):
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@router.get("/{session_id}/auto-dialogue")
def api_get_auto_dialogue(session_id: str):
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return get_auto_dialogue(session.game_state).model_dump()


@router.patch("/{session_id}/auto-dialogue")
def api_update_auto_dialogue(session_id: str, body: AutoDialogueUpdate):
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    updates = body.model_dump(exclude_unset=True)
    session.game_state = merge_auto_dialogue(session.game_state, updates)
    session = repo.update_session(session)
    return get_auto_dialogue(session.game_state).model_dump()
