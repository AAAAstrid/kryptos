"""情感引擎 —— 追踪角色情绪状态，影响发言风格与下意识反应。

七种基本情绪 + 强度 0.0~1.0。情绪随时间自然衰减，
每条消息触发对应变化，主情绪影响说话方式与身体语言。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# ── 七种基本情绪 ──────────────────────────────────────────────
EMOTION_KEYS = ["joy", "sadness", "anger", "fear", "surprise", "disgust", "neutral"]

DECAY_RATE = 0.12

EMOTION_LABELS: dict[str, str] = {
    "joy": "愉悦",
    "sadness": "悲伤",
    "anger": "愤怒",
    "fear": "恐惧",
    "surprise": "惊讶",
    "disgust": "厌恶",
    "neutral": "平静",
}

# 情绪对应的说话风格描述（文字叙事版）
EMOTION_SPEECH_MODIFIERS: dict[str, str] = {
    "joy": "语气轻快愉悦，偶尔带着笑意，用词比平时活泼亲切",
    "sadness": "语气低落，声音发沉，语速偏慢，偶尔会有停顿",
    "anger": "语气锋利冷淡，措辞比平时直接，语速可能加快或刻意压低",
    "fear": "语气不稳，措辞谨慎犹豫，声音不自觉地放轻",
    "surprise": "语气上扬，语速略快，带着明显的意外或难以置信",
    "disgust": "语气冷淡疏离，带着不加掩饰的排斥感",
    "neutral": "语气自然平稳，根据场合自由调整",
}

# 简单关键词 → 情绪触发（轻量，无外部依赖）
_EMOTION_TRIGGERS: list[tuple[re.Pattern, str, float]] = [
    (re.compile(r"(开心|高兴|喜欢|爱|太好了|完美|感谢|谢谢|哈哈|呵呵|棒|厉害|太棒了|真不错|好极了)"), "joy", 0.22),
    (re.compile(r"(好笑|有趣|可爱|漂亮|满意|欣慰)"), "joy", 0.15),
    (re.compile(r"(难过|伤心|哭|悲伤|遗憾|可惜|好痛|心疼|孤单|寂寞|失落|绝望)"), "sadness", 0.30),
    (re.compile(r"(失败|输了|失去|离开|再见|完了|再也)"), "sadness", 0.20),
    (re.compile(r"(生气|气死|可恶|混蛋|讨厌|烦|滚|闭嘴|找死|混账|畜生)"), "anger", 0.30),
    (re.compile(r"(凭什么|岂有此理|不可原谅|你算老几|找死|放肆)"), "anger", 0.35),
    (re.compile(r"(害怕|恐怖|吓人|救命|危险|不要过来|鬼|怪物)"), "fear", 0.30),
    (re.compile(r"(紧张|不安|担心|焦虑|忐忑|心慌)"), "fear", 0.20),
    (re.compile(r"(？|!|竟然|真的\?|假的吧|没想到|惊讶|震惊|天哪|哇|居然)"), "surprise", 0.20),
    (re.compile(r"(突然|居然|怎么这样|骗人|真的假的|不会吧)"), "surprise", 0.15),
    (re.compile(r"(恶心|呕吐|臭|脏|恶心死了|反胃|变态|令人作呕)"), "disgust", 0.30),
    (re.compile(r"(恶心|变态|受不了|龌龊|下流)"), "disgust", 0.25),
]

# 情绪 → 下意识动作/身体语言描写（文学叙事风格）
EMOTION_ACTIONS: dict[str, list[str]] = {
    "joy": [
        "唇角不自觉地上扬了几分",
        "眉眼间染上一层笑意",
        "语气里带着藏不住的笑意",
        "眼角弯了弯",
        "声音比平时轻快了许多",
    ],
    "sadness": [
        "垂下眼帘，声音有些发涩",
        "指尖微微发颤，好一会儿才开口",
        "别过脸去，似乎在平复情绪",
        "声音低了下去",
        "勉强牵了牵嘴角",
    ],
    "anger": [
        "指节捏得发白",
        "声音沉了几分",
        "眯起眼睛，目光冷了下来",
        "深吸一口气才压下火气",
        "语气带着不加掩饰的冷意",
    ],
    "fear": [
        "声音不自觉地压低了几分",
        "指尖微微收紧",
        "目光闪烁了一下",
        "喉结上下滚动",
        "身体几不可见地绷紧了",
    ],
    "surprise": [
        "愣了一下才反应过来",
        "瞳孔微微放大",
        "一时语塞",
        "半晌没说出话来",
        "眉毛挑了起来",
    ],
    "disgust": [
        "不易察觉地皱了皱眉",
        "嘴角撇了一下",
        "语气疏淡了几分",
        "别开了视线",
        "表情淡了下去",
    ],
    "neutral": [
        "偏了偏头，略作思索",
        "指尖在桌面上轻轻叩了两下",
        "目光扫过众人",
        "换了个更放松的姿势",
        "沉吟片刻",
    ],
}


@dataclass
class EmotionState:
    """角色当前情绪状态。"""

    emotions: dict[str, float] = field(default_factory=lambda: {k: 0.0 for k in EMOTION_KEYS})
    neutral: float = 0.6

    def __post_init__(self):
        if not self.emotions:
            self.emotions = {k: 0.0 for k in EMOTION_KEYS}
        for k in EMOTION_KEYS:
            self.emotions.setdefault(k, 0.0)

    @property
    def dominant(self) -> str:
        """返回当前强度最高的情绪（>=0.15 才覆盖平静）。"""
        best = max(self.emotions, key=lambda k: self.emotions[k])
        if self.emotions.get(best, 0) >= 0.15:
            return best
        return "neutral"

    @property
    def dominant_intensity(self) -> float:
        return self.emotions.get(self.dominant, 0.0)

    def to_dict(self) -> dict[str, float]:
        return dict(self.emotions)

    @classmethod
    def from_dict(cls, data: dict[str, float]) -> "EmotionState":
        return cls(emotions={k: data.get(k, 0.0) for k in EMOTION_KEYS})

    def decay(self, rate: float = DECAY_RATE):
        """情绪自然衰减。"""
        for k in self.emotions:
            self.emotions[k] = max(0.0, self.emotions[k] - rate)
        self.emotions["neutral"] = max(0.3, self.emotions.get("neutral", 0.3))

    def apply_trigger(self, emotion_key: str, delta: float):
        """施加情绪触发。"""
        current = self.emotions.get(emotion_key, 0.0)
        self.emotions[emotion_key] = max(0.0, min(1.0, current + delta))
        if emotion_key != "neutral" and delta > 0:
            self.emotions["neutral"] = max(0.0, self.emotions.get("neutral", 0.3) - delta * 0.3)


def analyze_message_emotion(content: str) -> list[tuple[str, float]]:
    """分析消息内容，返回情绪触发列表。"""
    triggers: list[tuple[str, float]] = []
    for pattern, emotion, delta in _EMOTION_TRIGGERS:
        matches = pattern.findall(content)
        if matches:
            triggers.append((emotion, delta * min(len(matches), 3)))
    return triggers


def update_emotion_from_message(
    current: EmotionState | dict | None,
    message_content: str,
    *,
    decay: bool = True,
) -> EmotionState:
    """根据消息更新情绪状态。"""
    if current is None:
        state = EmotionState()
    elif isinstance(current, dict):
        state = EmotionState.from_dict(current)
    else:
        state = current

    if decay:
        state.decay()

    triggers = analyze_message_emotion(message_content)
    for emotion, delta in triggers:
        state.apply_trigger(emotion, delta)

    return state


def emotion_to_system_prompt_inject(state: EmotionState | None) -> str:
    """生成情绪上下文，注入 system prompt。"""
    if not state:
        return ""
    dominant = state.dominant
    intensity = state.dominant_intensity

    label = EMOTION_LABELS.get(dominant, "平静")
    modifier = EMOTION_SPEECH_MODIFIERS.get(dominant, "")

    intensity_desc = ""
    if intensity >= 0.8:
        intensity_desc = "非常强烈"
    elif intensity >= 0.5:
        intensity_desc = "明显"
    elif intensity >= 0.2:
        intensity_desc = "略微"

    lines = [
        f"【当前情绪】{label}（{intensity_desc}）",
    ]
    if modifier:
        lines.append(f"【情绪影响】{modifier}")
    return "\n".join(lines)


def get_emotion_for_display(state: EmotionState | None) -> dict[str, Any]:
    """返回前端可用的情绪摘要。"""
    if not state:
        return {"dominant": "neutral", "label": "平静", "intensity": 0.0, "all": {}}
    dom = state.dominant
    return {
        "dominant": dom,
        "label": EMOTION_LABELS.get(dom, "平静"),
        "intensity": round(state.dominant_intensity, 2),
        "all": {k: round(v, 2) for k, v in state.emotions.items()},
    }


def get_subconscious_action(state: EmotionState | None) -> str:
    """根据主情绪随机返回一个下意识动作描写的片段。"""
    if not state:
        return ""
    import random
    dom = state.dominant
    actions = EMOTION_ACTIONS.get(dom, EMOTION_ACTIONS["neutral"])
    return random.choice(actions)
