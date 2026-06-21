"""Visibility ACL engine."""

from __future__ import annotations

from kryptos.models.message import Message, Visibility
from kryptos.models.session import Session


def is_privileged(viewer_id: str, session: Session) -> bool:
    if viewer_id == "gm":
        return True
    if viewer_id == "referee":
        return True
    char = session.characters.get(viewer_id)
    if char and (char.is_referee or char.can_host):
        return True
    return False


def can_see(msg: Message, viewer_id: str, session: Session) -> bool:
    """Check if viewer can see a message."""
    if viewer_id == "public":
        return msg.visibility == Visibility.PUBLIC

    if is_privileged(viewer_id, session):
        return True

    if msg.visibility == Visibility.PUBLIC:
        return True
    if msg.visibility == Visibility.SYSTEM:
        return False
    return viewer_id in msg.viewers or msg.sender_id == viewer_id


def filter_messages(
    session: Session,
    viewer_id: str,
    *,
    include_system: bool = False,
    limit: int | None = None,
) -> list[Message]:
    """Return messages visible to viewer_id."""
    msgs = session.messages
    if limit:
        msgs = msgs[-limit:]

    return [
        m
        for m in msgs
        if can_see(m, viewer_id, session)
        and (include_system or m.visibility != Visibility.SYSTEM or viewer_id == "public")
    ]
