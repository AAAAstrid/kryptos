"""关系追踪 —— 角色之间的亲密度、信任度、熟悉度。

同一场群聊中，角色之间的互动会改变彼此的关系。
关系影响说话语气、用词亲疏、以及是否愿意分享信息。

存放在 session.game_state.relationships 中。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# 关系值范围
AFFINITY_MIN = -1.0   # 厌恶
AFFINITY_MAX = 1.0    # 喜爱
TRUST_MIN = -1.0      # 提防
TRUST_MAX = 1.0       # 信任

# 每次互动的变化幅度
AFFINITY_DELTA_FRIENDLY = 0.05
AFFINITY_DELTA_HOSTILE = -0.08
TRUST_DELTA_HONEST = 0.06
TRUST_DELTA_DECEPTIVE = -0.04


@dataclass
class RelationshipState:
    """两个角色之间的关系。"""
    affinity: float = 0.0      # -1 ~ 1，好感度
    trust: float = 0.0         # -1 ~ 1，信任度
    familiarity: int = 0       # 互动次数，仅增不减
    last_interaction: str = "" # 最近一次对话的 message id

    def to_dict(self) -> dict[str, Any]:
        return {
            "affinity": round(self.affinity, 2),
            "trust": round(self.trust, 2),
            "familiarity": self.familiarity,
            "last_interaction": self.last_interaction,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RelationshipState":
        return cls(
            affinity=data.get("affinity", 0.0),
            trust=data.get("trust", 0.0),
            familiarity=data.get("familiarity", 0),
            last_interaction=data.get("last_interaction", ""),
        )

    @property
    def affinity_label(self) -> str:
        if self.familiarity == 0:
            return "初次见面"
        if self.affinity >= 0.6:
            return "非常亲近"
        elif self.affinity >= 0.3:
            return "友善"
        elif self.affinity >= -0.1:
            return "中立"
        elif self.affinity >= -0.5:
            return "冷淡"
        else:
            return "敌对"

    @property
    def trust_label(self) -> str:
        if self.familiarity == 0:
            return "未知"
        if self.trust >= 0.6:
            return "深信不疑"
        elif self.trust >= 0.2:
            return "基本信任"
        elif self.trust >= -0.2:
            return "观望"
        elif self.trust >= -0.6:
            return "怀疑"
        else:
            return "提防"


def get_relationships(character_id: str, game_state: dict[str, Any] | None) -> dict[str, RelationshipState]:
    """获取某个角色的所有关系。

    返回 { 对方角色ID: RelationshipState }
    """
    if not game_state:
        return {}
    all_rels: dict[str, Any] = game_state.get("relationships", {}).get(character_id, {})
    result = {}
    for other_id, data in all_rels.items():
        if isinstance(data, dict):
            result[other_id] = RelationshipState.from_dict(data)
    return result


def get_or_create_relationship(
    character_id: str,
    other_id: str,
    game_state: dict[str, Any] | None,
) -> RelationshipState:
    """获取或创建两个角色之间的关系。"""
    rels = get_relationships(character_id, game_state)
    return rels.get(other_id, RelationshipState())


def ensure_relationship_pair(
    game_state: dict[str, Any],
    char_a: str,
    char_b: str,
) -> RelationshipState:
    """确保关系双向存在，返回 A→B 的关系。"""
    rels_a = get_relationships(char_a, game_state)
    if char_b not in rels_a:
        rels_a[char_b] = RelationshipState()

    rels_b = get_relationships(char_b, game_state)
    if char_a not in rels_b:
        rels_b[char_a] = RelationshipState()

    # 写回 game_state
    if "relationships" not in game_state:
        game_state["relationships"] = {}
    game_state["relationships"][char_a] = {k: v.to_dict() for k, v in rels_a.items()}
    game_state["relationships"][char_b] = {k: v.to_dict() for k, v in rels_b.items()}

    return rels_a[char_b]


def update_relationship_on_message(
    game_state: dict[str, Any],
    speaker_id: str,
    target_id: str,
    message_content: str,
    message_id: str,
    *,
    is_deceptive: bool = False,
    is_hostile: bool = False,
    is_friendly: bool = False,
):
    """根据一条消息更新双方关系。

    Args:
        game_state: 会话 game_state（会被修改）
        speaker_id: 说话方
        target_id: 接收方（可以理解为内容主要针对谁）
        message_content: 消息内容（用于简单语义分析）
        message_id: 消息 ID
    """
    rel = ensure_relationship_pair(game_state, speaker_id, target_id)
    rel.familiarity += 1

    # 基于内容的简单判断（关键词触发）
    content_lower = message_content.lower()
    if not is_hostile and not is_friendly and not is_deceptive:
        if any(w in content_lower for w in ["谢谢", "感谢", "抱歉", "对不起", "不好意思"]):
            is_friendly = True
        if any(w in content_lower for w in ["你", "你"]):
            if any(w in content_lower for w in ["滚", "闭嘴", "去死", "讨厌", "混蛋", "闭嘴"]):
                is_hostile = True

    if is_friendly:
        rel.affinity = max(AFFINITY_MIN, min(AFFINITY_MAX, rel.affinity + AFFINITY_DELTA_FRIENDLY))
    if is_hostile:
        rel.affinity = max(AFFINITY_MIN, min(AFFINITY_MAX, rel.affinity + AFFINITY_DELTA_HOSTILE))
    if is_deceptive:
        rel.trust = max(TRUST_MIN, min(TRUST_MAX, rel.trust + TRUST_DELTA_DECEPTIVE))
    elif is_friendly:
        rel.trust = max(TRUST_MIN, min(TRUST_MAX, rel.trust + TRUST_DELTA_HONEST))

    rel.last_interaction = message_id

    # 写回（确保一致性）
    a_to_b = game_state.setdefault("relationships", {}).setdefault(speaker_id, {})
    a_to_b[target_id] = rel.to_dict()
    b_to_a = game_state["relationships"].setdefault(target_id, {})
    existing_b = b_to_a.get(speaker_id, RelationshipState().to_dict())
    existing_b["familiarity"] = existing_b.get("familiarity", 0) + 1
    b_to_a[speaker_id] = existing_b


def relationship_to_system_prompt(
    char_name: str,
    other_char_name: str,
    relationship: RelationshipState | None,
) -> str:
    """将关系转换为 system prompt 片段。

    用于告诉 AI 角色对另一个角色的态度。
    """
    if not relationship or relationship.familiarity == 0:
        return ""
    parts = [f"【你对{other_char_name}的态度】{relationship.affinity_label}，{relationship.trust_label}"]
    return "\n".join(parts)
