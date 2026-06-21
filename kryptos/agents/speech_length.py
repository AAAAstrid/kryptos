"""Global reply length presets for character speech."""

from __future__ import annotations

from typing import Any

REPLY_LENGTH_PRESETS: dict[str, dict[str, Any]] = {
    "short": {
        "label": "简短",
        "rules": (
            "【篇幅】本次发言控制在1～2句话（约40～80字），不要空行分段。"
            "只回应当前场面，不要复述人设、背景、关系、设定。"
            "动作描写最多一句括号，禁止长动作戏与内心独白堆砌。"
        ),
        "max_tokens_cap": 320,
    },
    "normal": {
        "label": "适中",
        "rules": (
            "【篇幅】2～4句话（约80～150字），最多一个段落。"
            "不要大段交代设定或连续动作描写，不要重复已知信息。"
        ),
        "max_tokens_cap": 768,
    },
    "long": {
        "label": "详细",
        "rules": (
            "【篇幅】可充分展开，但仍避免重复堆砌人设与无关背景；"
            "动作与对白结合，不要写成小说章节。"
        ),
        "max_tokens_cap": None,
    },
}

DEFAULT_REPLY_LENGTH = "short"


def normalize_reply_length(key: str | None) -> str:
    if key and key in REPLY_LENGTH_PRESETS:
        return key
    return DEFAULT_REPLY_LENGTH


def get_reply_length_rules(key: str | None) -> str:
    preset = REPLY_LENGTH_PRESETS[normalize_reply_length(key)]
    return str(preset["rules"])


def cap_speech_max_tokens(config_max: int, key: str | None) -> int:
    preset = REPLY_LENGTH_PRESETS[normalize_reply_length(key)]
    cap = preset.get("max_tokens_cap")
    if cap is None:
        return config_max
    return min(config_max, int(cap))
