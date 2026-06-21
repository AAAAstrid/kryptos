"""Select and format world book entries for LLM context."""

from __future__ import annotations

from kryptos.core.visibility import filter_messages
from kryptos.models.session import Session
from kryptos.models.world_book import WorldBookEntry, get_world_book


WORLD_BOOK_HEADER = (
    "【世界书·权威设定】"
    "以下内容为本局既定事实，发言必须遵守，不得与之矛盾，"
    "不得编造设定外的重要事实（人物关系、地点规则、时间线等）。"
)


def _entry_matches(entry: WorldBookEntry, scan_text: str) -> bool:
    if entry.constant:
        return True
    keys = [k.strip().lower() for k in entry.keys if k and k.strip()]
    if not keys:
        return False
    return any(key in scan_text for key in keys)


def select_active_entries(session: Session, viewer_id: str) -> list[WorldBookEntry]:
    from kryptos.core.context import normalize_message_content

    book = get_world_book(session.game_state)
    candidates = [e for e in book.entries if e.enabled]
    if not candidates:
        return []

    visible = filter_messages(session, viewer_id, include_system=False, limit=book.scan_depth)
    scan_parts: list[str] = []
    for msg in visible:
        scan_parts.append(normalize_message_content(msg, session))
    scan_text = "\n".join(scan_parts).lower()

    ordered = sorted(candidates, key=lambda e: (not e.constant, e.order, e.title))
    matched: list[WorldBookEntry] = []
    seen: set[str] = set()
    total_chars = len(WORLD_BOOK_HEADER) + 2

    for entry in ordered:
        if entry.id in seen:
            continue
        if not _entry_matches(entry, scan_text):
            continue
        title = (entry.title or "未命名").strip()
        body = (entry.content or "").strip()
        if not body:
            continue
        block = f"■ {title}\n{body}\n"
        if total_chars + len(block) > book.max_chars:
            break
        matched.append(entry)
        seen.add(entry.id)
        total_chars += len(block)

    return matched


def format_world_book_prompt(session: Session, viewer_id: str) -> str:
    entries = select_active_entries(session, viewer_id)
    if not entries:
        return ""

    lines = [WORLD_BOOK_HEADER, ""]
    for entry in entries:
        title = (entry.title or "未命名").strip()
        body = (entry.content or "").strip()
        lines.append(f"■ {title}")
        lines.append(body)
        lines.append("")
    return "\n".join(lines).strip()
