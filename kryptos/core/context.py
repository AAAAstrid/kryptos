"""Context builder for LLM prompts."""

from __future__ import annotations

from typing import Any

from kryptos.config import llm_config
from kryptos.core.visibility import filter_messages
from kryptos.games.registry import get_template
from kryptos.models.character import Character
from kryptos.models.message import Message, MessageKind
from kryptos.models.session import Session

PLAYER_CONSTRAINTS = """
【信息边界】
- 你只能基于系统提供的历史消息行动。
- 不要编造、引用或暗示任何你未亲眼看到的私密信息。
- 你可以说谎、隐瞒、误导，但谎言应基于公开信息或你的隐藏目标。
- 公开发言时不要输出 [restricted]、[speech] 等系统标记，不要说明「这是私密消息」。
- 不要向场上重复介绍自己的人设、来历、关系；玩家已知的信息不必再讲一遍。
- 当前阶段: {phase_name} — {phase_description}
"""

PRIVATE_REPLY_INSTRUCTION = (
    "上一条是 GM 私下对你说的话，仅你可见。"
    "请同样以私密方式回应 GM，不要发到场上公开对话。"
    "不要输出任何方括号标记，"
    "不要提及「私密/restricted/私下消息」等元信息，直接以角色口吻发言。"
    "篇幅控制在1～2句话，不要复述设定。"
)


def resolve_llm_config(character: Character | None = None) -> dict[str, str]:
    return llm_config.resolve(character)


def strip_echoed_speaker_prefix(content: str, speaker_name: str) -> str:
    """Remove repeated 'Name:' prefixes the model may echo from chat history format."""
    if not content or not speaker_name:
        return content
    text = content.strip()
    prefixes = (f"{speaker_name}:", f"{speaker_name}：")
    changed = True
    while changed:
        changed = False
        for prefix in prefixes:
            if text.startswith(prefix):
                text = text[len(prefix):].lstrip()
                changed = True
    return text


def normalize_message_content(msg: Message, session: Session) -> str:
    """Return display/storage-safe content without echoed speaker prefixes."""
    sender_name = msg.sender_id
    if msg.sender_id in session.characters:
        sender_name = session.characters[msg.sender_id].name
    elif msg.sender_id == "gm":
        sender_name = "GM"
    elif msg.sender_id == "referee":
        sender_name = "裁判"
    return strip_echoed_speaker_prefix(msg.content, sender_name)


def _format_message_line(msg: Message, session: Session, viewer_id: str) -> str:
    sender_name = msg.sender_id
    if msg.sender_id in session.characters:
        sender_name = session.characters[msg.sender_id].name
    elif msg.sender_id == "gm":
        sender_name = "GM"
    elif msg.sender_id == "referee":
        sender_name = "裁判"

    content = normalize_message_content(msg, session)

    if msg.visibility.value == "restricted":
        if msg.sender_id == "gm" and viewer_id in msg.viewers:
            return f"【GM私下对你说】{content}"
        if msg.sender_id == viewer_id:
            return f"【你的私下发言】{content}"
        return f"【私下·{sender_name}】{content}"

    if msg.kind != MessageKind.SPEECH:
        return f"[{msg.kind.value}] {sender_name}: {content}"
    return f"{sender_name}: {content}"


def _role_for_message(msg: Message, viewer_id: str) -> str:
    if msg.sender_id == viewer_id:
        return "assistant"
    if msg.sender_id in ("gm", "referee", "narrator"):
        return "user"
    return "user"


def compose_system_prompt(session: Session, viewer_id: str) -> str:
    char = session.characters.get(viewer_id)
    parts: list[str] = []

    if char:
        parts.append(f"你是 {char.name}（角色ID: {char.id}）。")
        if char.persona:
            parts.append(f"【人设】{char.persona}")
        if char.speech_style:
            parts.append(f"【说话风格】{char.speech_style}")
        if char.hidden_brief:
            parts.append(f"【私密信息】{char.hidden_brief}")
        if char.goals:
            parts.append(f"【目标】{char.goals}")
    elif viewer_id == "gm":
        parts.append("你是人类 GM，拥有全部信息视野。")
    elif viewer_id == "referee":
        parts.append("你是裁判，拥有全部信息视野，负责主持游戏。")

    phase_name = ""
    phase_desc = ""
    if session.template_id:
        template = get_template(session.template_id)
        if template:
            for phase in template.phases:
                if phase.id == session.current_phase_id:
                    phase_name = phase.name
                    phase_desc = phase.description
                    break
            if template.player_system_prompt and char:
                parts.append(template.player_system_prompt)

    if char:
        parts.append(PLAYER_CONSTRAINTS.format(phase_name=phase_name, phase_description=phase_desc))

    from kryptos.agents.grounding import get_grounding_system_prompt

    grounding = get_grounding_system_prompt(char.extensions if char else None)
    if grounding:
        parts.append(grounding)

    from kryptos.core.world_book import format_world_book_prompt

    world_book = format_world_book_prompt(session, viewer_id)
    if world_book:
        parts.append(world_book)

    return "\n".join(parts)


def build_context(
    session: Session,
    viewer_id: str,
    *,
    include_system: bool = False,
    limit: int | None = 80,
) -> list[dict[str, str]]:
    """Build OpenAI-format message list for a viewer."""
    visible = filter_messages(session, viewer_id, include_system=include_system, limit=limit)
    system = compose_system_prompt(session, viewer_id)
    result: list[dict[str, str]] = [{"role": "system", "content": system}]

    for msg in visible:
        if msg.kind == MessageKind.STATE_CHANGE and msg.visibility.value == "system":
            continue
        result.append({
            "role": _role_for_message(msg, viewer_id),
            "content": _format_message_line(msg, session, viewer_id),
        })

    return result


def build_context_debug(session: Session, viewer_id: str) -> dict[str, Any]:
    from kryptos.core.world_book import select_active_entries
    from kryptos.models.world_book import get_world_book

    visible = filter_messages(session, viewer_id, include_system=True)
    active = select_active_entries(session, viewer_id)

    from kryptos.agents.emotion import get_emotion_for_display, EmotionState
    char = session.characters.get(viewer_id)
    emotion_data = None
    if char:
        ext = char.extensions or {}
        raw = ext.get("emotion_state")
        if isinstance(raw, dict):
            emotion_data = get_emotion_for_display(EmotionState.from_dict(raw))

    return {
        "viewer_id": viewer_id,
        "visible_count": len(visible),
        "total_messages": len(session.messages),
        "llm_config": resolve_llm_config(char),
        "emotion": emotion_data,
        "world_book": {
            "total_entries": len(book.entries),
            "active_count": len(active),
            "active_titles": [e.title or e.id for e in active],
            "scan_depth": book.scan_depth,
        },
        "context": build_context(session, viewer_id),
    }
