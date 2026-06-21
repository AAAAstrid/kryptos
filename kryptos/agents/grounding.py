"""设定约束系统 — 让 AI 角色基于已知事实发言，不编造设定。

两种模式：
  - free: 自由发挥，可补充合理细节
  - grounded: 严格约束，只使用对话历史上已出现的设定

类似跑团：GM 给出场景，玩家角色只对眼前可见的事实做出反应，
不擅自发明 NPC、地点、事件或关系。
"""

from __future__ import annotations

from typing import Any, Literal

GroundingMode = Literal["free", "grounded"]

# ── 约束模式的严肃提示（注入 system prompt） ──────────────────

SYSTEM_GROUNDING_RULES = """
【设定约束 — 严格遵守】
你只能基于对话历史上已明确出现的信息行动和发言。
绝对禁止：
- 编造未在对话中出现的 NPC、地点、组织、物品
- 虚构对话中未提及的事件背景或角色经历
- 替其他角色做出动作或发言
- 替场景自行补充不存在于对话记录中的设定细节

如果你在对话中看到某个角色提到一条信息，那不是你创造的，
你只能基于它作出反应，不能在此基础上继续层层编造新设定。

当你不确定某件事是否存在时，它就不存在。
宁愿不提及，也不要现场发明。

你的任务：关注**眼前正在发生的场面**，做出自然反应。
"""

# ── 约束模式的发言尾部提示（追加在 user message） ────────────

SPEECH_GROUNDING_TAIL = """
【设定约束】
- 你只能回应**对话中已经发生**的事情。
- 不要引入新的背景设定、新角色、新地点。
- 如果其他角色提到一个你不知道的事，你只能表现出疑惑/追问，
  而不能顺着补充"细节"。
- 不要替场景补充环境描写或背景故事。
- 关注焦点：当前此刻，这个场面里，你能看到和听到什么。
"""


def get_grounding_mode(extensions: dict[str, Any] | None) -> GroundingMode:
    """获取角色的设定约束模式。"""
    if not extensions:
        return "free"
    mode = extensions.get("grounding_mode", "free")
    return "grounded" if mode == "grounded" else "free"


def get_grounding_system_prompt(extensions: dict[str, Any] | None) -> str:
    """获取约束模式的 system prompt 注入片段。"""
    mode = get_grounding_mode(extensions)
    if mode == "grounded":
        return SYSTEM_GROUNDING_RULES
    return ""


def get_grounding_speech_tail(extensions: dict[str, Any] | None) -> str:
    """获取约束模式的发言尾部提示。"""
    mode = get_grounding_mode(extensions)
    if mode == "grounded":
        return SPEECH_GROUNDING_TAIL
    return ""


def get_grounding_label(extensions: dict[str, Any] | None) -> str:
    """返回模式的显示标签。"""
    mode = get_grounding_mode(extensions)
    if mode == "grounded":
        return "约束模式"
    return "自由模式"
