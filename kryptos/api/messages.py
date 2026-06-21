"""Message and context API routes."""

from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException, Query

from kryptos.agents.player import generate_character_speech
from kryptos.api.deps import repo
from kryptos.core.context import build_context_debug, normalize_message_content
from kryptos.core.visibility import filter_messages
from kryptos.models.message import Message, MessageKind, Visibility
from kryptos.models.session import MessageCreate

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["messages"])


class SpeakRequest(BaseModel):
    character_id: str
    instruction: str = ""
    visibility: Visibility = Visibility.PUBLIC
    viewers: list[str] = Field(default_factory=list)
    kind: MessageKind = MessageKind.SPEECH


@router.get("/messages")
def api_list_messages(session_id: str, view: str = Query("public")):
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    visible = filter_messages(session, view, include_system=True)
    from kryptos.agents.emotion import get_emotion_for_display, EmotionState

    result = []
    for m in visible:
        data = m.model_dump()
        data["content"] = normalize_message_content(m, session)
        # 附上发送者当前情绪
        if m.sender_id in session.characters:
            ext = session.characters[m.sender_id].extensions or {}
            raw = ext.get("emotion_state")
            if isinstance(raw, dict):
                data["emotion"] = get_emotion_for_display(EmotionState.from_dict(raw))
        result.append(data)
    return result


@router.post("/messages")
def api_create_message(session_id: str, body: MessageCreate):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")

    message = Message(
        session_id=session_id,
        sender_id=body.sender_id,
        sender_role=body.sender_role,
        kind=body.kind,
        content=body.content,
        visibility=body.visibility,
        viewers=body.viewers,
        phase_id=body.phase_id or session.current_phase_id,
        round=body.round or session.round,
        action_type=body.action_type,
        action_payload=body.action_payload,
        memory_for=body.memory_for,
    )
    repo.add_message(session_id, message)
    return message.model_dump()


@router.get("/context/{viewer_id}")
def api_get_context(session_id: str, viewer_id: str):
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return build_context_debug(session, viewer_id)


@router.post("/speak")
async def api_speak(session_id: str, body: SpeakRequest):
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if body.character_id not in session.characters:
        raise HTTPException(404, "Character not found")

    from kryptos.models.session_mute import is_character_muted

    if is_character_muted(session.game_state, body.character_id):
        char = session.characters[body.character_id]
        raise HTTPException(400, f"角色「{char.name}」在本群已被禁言")

    try:
        content, reasoning, truncated = await generate_character_speech(
            session,
            body.character_id,
            instruction=body.instruction,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"模型调用失败: {e}")

    if not content:
        raise HTTPException(400, "模型返回为空")

    char = session.characters[body.character_id]
    message = Message(
        session_id=session_id,
        sender_id=body.character_id,
        sender_role="referee" if char.is_referee else "player",
        kind=body.kind,
        content=content,
        reasoning_content=reasoning,
        visibility=body.visibility,
        viewers=body.viewers,
        phase_id=session.current_phase_id,
        round=session.round,
        memory_for=[body.character_id],
        action_payload={"truncated": True} if truncated else {},
    )
    repo.add_message(session_id, message)

    # ── 持久化会话状态（关系亲密度等） ──────────────────────
    repo.update_session(session)

    # ── 持久化角色扩展数据（情绪状态等） ────────────────────
    if char.extensions:
        repo.update_global_character(body.character_id, {"extensions": char.extensions})

    # ── 附带情绪状态 ────────────────────────────────────────
    from kryptos.agents.emotion import get_emotion_for_display
    ext = char.extensions or {}
    emotion_raw = ext.get("emotion_state")
    emotion_data_api = None
    if emotion_raw and isinstance(emotion_raw, dict):
        from kryptos.agents.emotion import EmotionState
        emotion_data_api = get_emotion_for_display(EmotionState.from_dict(emotion_raw))

    data = message.model_dump()
    data["truncated"] = truncated
    data["speaking_as"] = {"character_id": char.id, "name": char.name}
    data["emotion"] = emotion_data_api
    return data


@router.delete("/messages/{message_id}")
def api_delete_message(session_id: str, message_id: str):
    session = repo.get_session(session_id, with_messages=False)
    if not session:
        raise HTTPException(404, "Session not found")
    if not repo.delete_message(session_id, message_id):
        raise HTTPException(404, "Message not found")
    return {"ok": True}
