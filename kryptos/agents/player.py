"""Player agent — generate character speech via LLM.

Skills integrated:
  - Emotion engine: 情绪追踪，影响说话风格
  - Internal monologue: 内心独白，先想再说
  - Relationship tracking: 关系亲密度影响态度
"""

from __future__ import annotations

from kryptos.agents.emotion import (
    EmotionState,
    emotion_to_system_prompt_inject,
    update_emotion_from_message,
)
from kryptos.agents.internal_monologue import (
    build_monologue_prompt_with_emotion,
    should_use_internal_monologue,
)
from kryptos.agents.relationship import (
    get_or_create_relationship,
    relationship_to_system_prompt,
    update_relationship_on_message,
)
from kryptos.agents.grounding import get_grounding_label, get_grounding_speech_tail
from kryptos.agents.speech_length import cap_speech_max_tokens, get_reply_length_rules
from kryptos.core.context import build_context, resolve_llm_config, strip_echoed_speaker_prefix
from kryptos.llm.client import chat_completion
from kryptos.models.session import Session

# ── 基础发言指令 ──────────────────────────────────────────────

SPEAK_INSTRUCTION = (
    "请根据以上对话，以你的角色身份自然发言。"
    "严格遵守人设与说话风格。不要跳出角色，不要元评论或解释规则。"
    "不要在发言开头加角色名或「名字：」前缀，系统会自动标注说话人。"
    "对话用中文引号「」或“”括起来；如需动作描写，自然融入叙述中，不要写成纯对白机器。"
    "保持小说叙事风格，动作与对白自然融合，每段不要太长。"
)

SPEAK_IDENTITY = (
    "【身份确认】你正在扮演且只能扮演角色「{name}」。"
    "不要模仿对话中其他角色的口吻，不要署其他角色的名字。"
)

# ── 叙事风格增强 ──────────────────────────────────────────────

NARRATIVE_ENHANCEMENT = (
    "【叙事风格】这是小说对白式的角色扮演。"
    "发言除了对白外，可以自然地带入简短的肢体语言、表情变化或动作描写，"
    "用括号括起来穿插在对话中。但不要写成大段旁白或心理独白，"
    "保持对话的流畅和节奏感。"
    "除非剧情需要，不要主动替其他角色做动作或替他们发言。"
)


def build_speak_tail(
    char,
    instruction: str,
    reply_length: str,
    emotion_state: EmotionState | None = None,
    relationship_prompt: str = "",
    extensions: dict | None = None,
) -> str:
    """构建发言 prompt 的末尾（补充指令部分）。"""
    identity = SPEAK_IDENTITY.format(name=char.name)
    length_rules = get_reply_length_rules(reply_length)
    body = instruction.strip() or SPEAK_INSTRUCTION

    parts = [identity, body]
    parts.append(NARRATIVE_ENHANCEMENT)

    # ── 设定约束模式 ──────────────────────────────────────
    grounding_tail = get_grounding_speech_tail(extensions)
    if grounding_tail:
        parts.append(grounding_tail)

    if emotion_state:
        emotion_block = emotion_to_system_prompt_inject(emotion_state)
        if emotion_block:
            parts.append(emotion_block)

    if relationship_prompt:
        parts.append(relationship_prompt)

    parts.append(length_rules)
    return "\n".join(parts)


async def generate_character_speech(
    session: Session,
    character_id: str,
    *,
    instruction: str = "",
) -> tuple[str, str, bool]:
    """生成角色发言。

    Returns:
        (content, reasoning, truncated)
    """
    char = session.characters.get(character_id)
    if not char:
        raise ValueError("角色不存在")

    config = resolve_llm_config(char)
    reply_length = config.get("reply_length", "short")
    extensions = char.extensions or {}

    # ── 1. 构建基础上下文 ────────────────────────────────────
    messages = build_context(session, character_id)

    # ── 2. 情绪处理 ──────────────────────────────────────────
    emotion_data = extensions.get("emotion_state")
    emotion_state: EmotionState | None = None
    if extensions.get("emotion_enabled", True):
        if emotion_data and isinstance(emotion_data, dict):
            emotion_state = EmotionState.from_dict(emotion_data)
        else:
            emotion_state = EmotionState()

        # 从最近的消息中分析情绪变化
        if session.messages:
            recent = session.messages[-1]
            if recent.sender_id != character_id:
                emotion_state = update_emotion_from_message(
                    emotion_state, recent.content
                )

    # ── 3. 关系处理 ──────────────────────────────────────────
    relationship_prompt = ""
    if extensions.get("relationship_enabled", True):
        rel_parts = []
        # 从历史消息中找到最近互动过的角色
        seen_others = set()
        for msg in reversed(session.messages[-20:]):
            if msg.sender_id != character_id and msg.sender_id not in seen_others and msg.sender_id in session.characters:
                seen_others.add(msg.sender_id)
                other_char = session.characters[msg.sender_id]
                rel = get_or_create_relationship(character_id, msg.sender_id, session.game_state)
                rp = relationship_to_system_prompt(char.name, other_char.name, rel)
                if rp:
                    rel_parts.append(rp)
                if len(rel_parts) >= 2:  # 最多展示2个关系
                    break
        if rel_parts:
            relationship_prompt = "\n".join(rel_parts)

    # ── 4. 拼接发言尾部 ──────────────────────────────────────
    tail = build_speak_tail(char, instruction, reply_length, emotion_state, relationship_prompt, extensions)

    # ── 5. 内心独白模式 ──────────────────────────────────────
    use_monologue = should_use_internal_monologue(extensions)
    if use_monologue:
        monologue_prompt = build_monologue_prompt_with_emotion(
            char.name, char.speech_style or "", emotion_state
        )
        tail = f"{monologue_prompt}\n\n{tail}"

    messages.append({"role": "user", "content": tail})

    # ── 6. 调 LLM ────────────────────────────────────────────
    config_max = int(config.get("max_tokens", 4096))
    max_tokens = cap_speech_max_tokens(config_max, reply_length)
    result = await chat_completion(
        config,
        messages,
        temperature=char.temperature,
        max_tokens=max_tokens,
    )

    content = strip_echoed_speaker_prefix(result.content, char.name)
    truncated = result.finish_reason == "length"

    # ── 7. 持久化状态 ────────────────────────────────────────
    # 保存情绪状态到 character extensions
    if emotion_state and extensions.get("emotion_enabled", True):
        char.extensions["emotion_state"] = emotion_state.to_dict()

    # 更新关系（如果有其他角色在场）
    if extensions.get("relationship_enabled", True) and session.messages:
        if len(session.messages) > 1:
            # 找到最近发言的另一个角色（不是自己）
            for msg in reversed(session.messages[:-1]):
                if msg.sender_id != character_id and msg.sender_id in session.characters:
                    update_relationship_on_message(
                        session.game_state,
                        character_id,
                        msg.sender_id,
                        content,
                        "",  # 当前消息还没入库，不传 message_id
                    )
                    break

    return content, result.reasoning, truncated
