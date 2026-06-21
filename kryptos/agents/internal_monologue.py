"""内心独白 —— 角色在开口之前的心理活动。

让角色先产生内心想法，再转化为实际发言。
这使得回复更有"人味"：犹豫、自我怀疑、克制、言不由衷……
内心的活动作为 reasoning_content 返回，可展开查看。
"""

from __future__ import annotations

from typing import Any

from kryptos.agents.emotion import (
    EmotionState,
    emotion_to_system_prompt_inject,
    get_emotion_for_display,
)

# 内心独白的 prompt 后缀，追加在 user message 末尾
INTERNAL_MONOLOGUE_TAIL = """

【写作要求】
以上是你内心所想，现在请以角色身份开口说话。
注意：不要直接复述内心独白的内容，而是基于内心的想法，用角色自然的口吻发言。
一个真实的人不会把心里话全都说出来——要有选择、有克制。
发言中可酌情融入简短的动作描写（括号括起来），但不要过长。
保持小说对白风格，不要写人物小传或大段心理剖析。
"""


def should_use_internal_monologue(char_extensions: dict[str, Any] | None) -> bool:
    """检查角色是否启用了内心独白功能。"""
    if not char_extensions:
        return False
    return bool(char_extensions.get("internal_monologue", False))


def build_monologue_prompt(char_name: str, speech_style: str) -> str:
    """构建内心独白的提示词，追加到对话上下文后。"""
    style_hint = f"\n角色的说话风格：{speech_style}" if speech_style else ""
    return (
        f"现在是{char_name}的回合。{char_name}要先在心里想一想自己此刻的真实感受、"
        f"对场上局面的判断、想说什么以及不想说什么。"
        f"内心可以有不方便说出口的念头、犹豫、隐藏的打算。"
        f"{style_hint}"
        f"\n\n请先写出{char_name}的【内心独白】（一段心理活动），"
        f"然后基于独白发言。"
        f"{INTERNAL_MONOLOGUE_TAIL}"
    )


def build_monologue_prompt_with_emotion(
    char_name: str,
    speech_style: str,
    emotion_state: EmotionState | None,
) -> str:
    """带情绪状态的内心独白 prompt。"""
    base = build_monologue_prompt(char_name, speech_style)
    if emotion_state:
        emotion_block = emotion_to_system_prompt_inject(emotion_state)
        if emotion_block:
            base = f"{emotion_block}\n\n{base}"
    return base
