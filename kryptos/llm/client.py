"""OpenAI-compatible LLM client."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass

from openai import AsyncOpenAI

_THINK_START = "<" + "think" + ">"
_THINK_END = "</" + "think" + ">"
_THINK_BLOCK_RE = re.compile(
    re.escape(_THINK_START) + r"(.*?)" + re.escape(_THINK_END),
    re.DOTALL | re.IGNORECASE,
)


@dataclass
class ChatCompletionResult:
    content: str
    reasoning: str = ""
    finish_reason: str = ""


def _extract_api_reasoning(message) -> str:
    rc = getattr(message, "reasoning_content", None)
    if rc:
        return str(rc).strip()
    extra = getattr(message, "model_extra", None) or {}
    if isinstance(extra, dict) and extra.get("reasoning_content"):
        return str(extra["reasoning_content"]).strip()
    return ""


def _split_inline_reasoning(text: str) -> tuple[str, str]:
    blocks = _THINK_BLOCK_RE.findall(text)
    if not blocks:
        return text, ""
    reasoning = "\n\n".join(b.strip() for b in blocks if b and b.strip())
    content = _THINK_BLOCK_RE.sub("", text).strip()
    if not reasoning:
        return text, ""
    return content or text, reasoning


async def chat_completion(
    config: dict[str, str],
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.8,
    max_tokens: int = 512,
) -> ChatCompletionResult:
    api_key = config.get("api_key", "")
    api_base = config.get("api_base", "")
    model = config.get("model", "")

    if not api_key:
        raise ValueError("请先配置 API Key")
    if not model:
        raise ValueError("请先配置 Model")

    client = AsyncOpenAI(api_key=api_key, base_url=api_base or None, timeout=120.0)
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    msg = response.choices[0].message
    raw_content = (msg.content or "").strip()
    reasoning = _extract_api_reasoning(msg)
    content = raw_content
    if not reasoning:
        content, reasoning = _split_inline_reasoning(raw_content)
    finish_reason = getattr(response.choices[0], "finish_reason", "") or ""
    return ChatCompletionResult(
        content=content,
        reasoning=reasoning,
        finish_reason=finish_reason,
    )


async def test_connection(config: dict[str, str]) -> dict:
    """Send a minimal chat request to verify API connectivity."""
    api_key = config.get("api_key", "")
    api_base = config.get("api_base", "")
    model = config.get("model", "")

    if not api_key:
        return {"ok": False, "error": "请先配置 API Key"}

    if not model:
        return {"ok": False, "error": "请先配置 Model"}

    client = AsyncOpenAI(api_key=api_key, base_url=api_base or None, timeout=30.0)
    start = time.perf_counter()

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Reply with exactly: Kryptos OK"}],
            max_tokens=20,
        )
        latency_ms = int((time.perf_counter() - start) * 1000)
        reply = response.choices[0].message.content or ""
        return {
            "ok": True,
            "reply": reply.strip(),
            "latency_ms": latency_ms,
            "model": model,
            "api_base": api_base,
        }
    except Exception as e:
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {
            "ok": False,
            "error": str(e),
            "latency_ms": latency_ms,
            "model": model,
            "api_base": api_base,
        }
