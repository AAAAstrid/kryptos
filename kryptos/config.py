"""Global configuration and LLM defaults."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from kryptos.agents.speech_length import normalize_reply_length

from dotenv import load_dotenv
import os

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
CONFIG_FILE = DATA_DIR / "llm_config.json"

load_dotenv(ROOT_DIR / ".env")


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


class LLMConfig:
    """Global default LLM configuration."""

    def __init__(self) -> None:
        _ensure_data_dir()
        self._load()

    def _load(self) -> None:
        defaults = {
            "api_key": os.getenv("OPENAI_API_KEY", ""),
            "api_base": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "model": os.getenv("DEFAULT_MODEL", "gpt-4o"),
            "max_tokens": int(os.getenv("DEFAULT_MAX_TOKENS", "4096")),
            "reply_length": os.getenv("DEFAULT_REPLY_LENGTH", "short"),
        }
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, encoding="utf-8") as f:
                stored = json.load(f)
            defaults.update({k: v for k, v in stored.items() if v is not None})
        self.api_key = defaults.get("api_key", "")
        self.api_base = defaults.get("api_base", "https://api.openai.com/v1")
        self.model = defaults.get("model", "gpt-4o")
        self.max_tokens = int(defaults.get("max_tokens", 4096))
        self.reply_length = normalize_reply_length(defaults.get("reply_length"))

    def save(
        self,
        api_key: str | None = None,
        api_base: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
        reply_length: str | None = None,
        *,
        update_key: bool = False,
    ) -> None:
        _ensure_data_dir()
        if update_key and api_key is not None:
            self.api_key = api_key
        if api_base is not None:
            self.api_base = api_base
        if model is not None:
            self.model = model
        if max_tokens is not None:
            self.max_tokens = max(256, min(int(max_tokens), 32768))
        if reply_length is not None:
            self.reply_length = normalize_reply_length(reply_length)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "api_key": self.api_key,
                    "api_base": self.api_base,
                    "model": self.model,
                    "max_tokens": self.max_tokens,
                    "reply_length": self.reply_length,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

    def to_dict(self, mask_key: bool = True) -> dict[str, Any]:
        key = self.api_key
        if mask_key and key:
            key = key[:4] + "..." + key[-4:] if len(key) > 8 else "***"
        return {
            "api_key": key,
            "api_base": self.api_base,
            "model": self.model,
            "max_tokens": self.max_tokens,
            "reply_length": self.reply_length,
        }

    def resolve(self, character: Any | None = None) -> dict[str, Any]:
        """Resolve LLM config for a character, falling back to global defaults."""
        if character is None:
            return {
                "api_key": self.api_key,
                "api_base": self.api_base,
                "model": self.model,
                "max_tokens": self.max_tokens,
                "reply_length": self.reply_length,
            }
        ext = getattr(character, "extensions", None) or {}
        char_max = ext.get("max_tokens")
        char_length = ext.get("reply_length")
        return {
            "api_key": character.api_key or self.api_key,
            "api_base": character.api_base or self.api_base,
            "model": character.model or self.model,
            "max_tokens": int(char_max) if char_max else self.max_tokens,
            "reply_length": normalize_reply_length(char_length or self.reply_length),
        }


llm_config = LLMConfig()

HOST = os.getenv("KRYPTOS_HOST", "127.0.0.1")
PORT = int(os.getenv("KRYPTOS_PORT", "8765"))
