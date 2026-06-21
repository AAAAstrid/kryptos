"""SQLite persistence."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
import uuid

from kryptos.config import DATA_DIR
from kryptos.models.character import Character
from kryptos.models.message import Message, MessageKind, Visibility
from kryptos.models.session import Session

DB_PATH = DATA_DIR / "sessions.db"

GLOBAL_CHAR_FIELDS = frozenset(
    {
        "name",
        "avatar_url",
        "persona",
        "speech_style",
        "model",
        "api_base",
        "api_key",
        "temperature",
        "is_referee",
        "can_host",
        "extensions",
    }
)
LINK_CHAR_FIELDS = frozenset({"hidden_brief", "goals"})


def _ensure_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            template_id TEXT,
            status TEXT NOT NULL DEFAULT 'setup',
            current_phase_id TEXT,
            round INTEGER NOT NULL DEFAULT 0,
            characters_json TEXT NOT NULL DEFAULT '{}',
            game_state_json TEXT NOT NULL DEFAULT '{}',
            active_referee_id TEXT DEFAULT 'referee',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            sender_role TEXT NOT NULL,
            kind TEXT NOT NULL,
            content TEXT NOT NULL,
            visibility TEXT NOT NULL,
            viewers_json TEXT NOT NULL DEFAULT '[]',
            phase_id TEXT,
            round INTEGER NOT NULL DEFAULT 0,
            action_type TEXT,
            action_payload_json TEXT NOT NULL DEFAULT '{}',
            memory_for_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

        CREATE TABLE IF NOT EXISTS characters (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            avatar_url TEXT NOT NULL DEFAULT '',
            persona TEXT NOT NULL DEFAULT '',
            speech_style TEXT NOT NULL DEFAULT '',
            hidden_brief TEXT NOT NULL DEFAULT '',
            goals TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            api_base TEXT NOT NULL DEFAULT '',
            api_key TEXT NOT NULL DEFAULT '',
            temperature REAL NOT NULL DEFAULT 0.8,
            is_referee INTEGER NOT NULL DEFAULT 0,
            can_host INTEGER NOT NULL DEFAULT 0,
            extensions_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS session_characters (
            session_id TEXT NOT NULL,
            character_id TEXT NOT NULL,
            hidden_brief TEXT NOT NULL DEFAULT '',
            goals TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (session_id, character_id),
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );
    """)
    _migrate_legacy_characters(conn)
    _migrate_message_columns(conn)
    conn.commit()
    conn.close()


def _migrate_message_columns(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(messages)").fetchall()}
    if "reasoning_content" not in cols:
        conn.execute(
            "ALTER TABLE messages ADD COLUMN reasoning_content TEXT NOT NULL DEFAULT ''"
        )


def _migrate_legacy_characters(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM characters").fetchone()[0]
    if count > 0:
        return

    rows = conn.execute("SELECT id, characters_json FROM sessions").fetchall()
    for row in rows:
        session_id = row["id"]
        raw = row["characters_json"] or "{}"
        try:
            characters_raw = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not characters_raw:
            continue
        for cid, data in characters_raw.items():
            try:
                char = Character(**data)
            except Exception:
                continue
            if char.id != cid:
                char = Character(id=cid, **{k: v for k, v in data.items() if k != "id"})
            _upsert_global_row(conn, char)
            hidden = char.hidden_brief or ""
            goals = char.goals or ""
            conn.execute(
                """INSERT OR IGNORE INTO session_characters
                   (session_id, character_id, hidden_brief, goals)
                   VALUES (?, ?, ?, ?)""",
                (session_id, char.id, hidden, goals),
            )
        conn.execute(
            "UPDATE sessions SET characters_json = ? WHERE id = ?",
            (json.dumps({}), session_id),
        )


class SQLiteRepo:
    def __init__(self) -> None:
        _ensure_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def list_sessions(self) -> list[Session]:
        conn = self._conn()
        rows = conn.execute("SELECT id FROM sessions ORDER BY updated_at DESC").fetchall()
        conn.close()
        return [self.get_session(r["id"]) for r in rows if self.get_session(r["id"])]

    def _load_session_characters(self, conn: sqlite3.Connection, session_id: str) -> dict[str, Character]:
        links = conn.execute(
            """SELECT sc.character_id, sc.hidden_brief, sc.goals
               FROM session_characters sc
               WHERE sc.session_id = ?""",
            (session_id,),
        ).fetchall()
        characters: dict[str, Character] = {}
        for link in links:
            char = self._get_global_character_row(conn, link["character_id"])
            if not char:
                continue
            merged = char.model_copy()
            if link["hidden_brief"]:
                merged.hidden_brief = link["hidden_brief"]
            if link["goals"]:
                merged.goals = link["goals"]
            characters[char.id] = merged
        return characters

    def get_session(self, session_id: str, with_messages: bool = True) -> Session | None:
        conn = self._conn()
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            conn.close()
            return None

        characters = self._load_session_characters(conn, session_id)

        messages: list[Message] = []
        if with_messages:
            msg_rows = conn.execute(
                "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at",
                (session_id,),
            ).fetchall()
            for m in msg_rows:
                messages.append(self._row_to_message(m))

        conn.close()
        return Session(
            id=row["id"],
            title=row["title"],
            template_id=row["template_id"] or "",
            characters=characters,
            messages=messages,
            game_state=json.loads(row["game_state_json"]),
            current_phase_id=row["current_phase_id"] or "",
            round=row["round"],
            active_referee_id=row["active_referee_id"] or "referee",
            status=row["status"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def create_session(self, title: str, template_id: str = "") -> Session:
        session = Session(title=title, template_id=template_id)
        conn = self._conn()
        now = datetime.now().isoformat()
        conn.execute(
            """INSERT INTO sessions
               (id, title, template_id, status, current_phase_id, round,
                characters_json, game_state_json, active_referee_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session.id,
                session.title,
                session.template_id,
                session.status,
                session.current_phase_id,
                session.round,
                json.dumps({}),
                json.dumps(session.game_state),
                session.active_referee_id,
                now,
                now,
            ),
        )
        conn.commit()
        conn.close()
        return session

    def update_session(self, session: Session) -> Session:
        conn = self._conn()
        now = datetime.now().isoformat()
        session.updated_at = datetime.fromisoformat(now)
        conn.execute(
            """UPDATE sessions SET
               title=?, template_id=?, status=?, current_phase_id=?, round=?,
               game_state_json=?, active_referee_id=?, updated_at=?
               WHERE id=?""",
            (
                session.title,
                session.template_id,
                session.status,
                session.current_phase_id,
                session.round,
                json.dumps(session.game_state),
                session.active_referee_id,
                now,
                session.id,
            ),
        )
        conn.commit()
        conn.close()
        return session

    def delete_session(self, session_id: str) -> bool:
        conn = self._conn()
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM session_characters WHERE session_id = ?", (session_id,))
        result = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()
        conn.close()
        return result.rowcount > 0

    def list_global_characters(self) -> list[Character]:
        conn = self._conn()
        rows = conn.execute("SELECT id FROM characters ORDER BY name").fetchall()
        chars = []
        for r in rows:
            c = self._get_global_character_row(conn, r["id"])
            if c:
                chars.append(c)
        conn.close()
        return chars

    def get_global_character(self, char_id: str) -> Character | None:
        conn = self._conn()
        char = self._get_global_character_row(conn, char_id)
        conn.close()
        return char

    def create_global_character(self, char: Character) -> Character:
        conn = self._conn()
        _upsert_global_row(conn, char)
        conn.commit()
        conn.close()
        return char

    def update_global_character(self, char_id: str, updates: dict) -> Character | None:
        char = self.get_global_character(char_id)
        if not char:
            return None
        for k, v in updates.items():
            if v is not None and hasattr(char, k):
                setattr(char, k, v)
        conn = self._conn()
        _upsert_global_row(conn, char)
        conn.commit()
        conn.close()
        return char

    def delete_global_character(self, char_id: str) -> bool:
        conn = self._conn()
        conn.execute("DELETE FROM session_characters WHERE character_id = ?", (char_id,))
        result = conn.execute("DELETE FROM characters WHERE id = ?", (char_id,))
        conn.commit()
        conn.close()
        return result.rowcount > 0

    def get_character_session_ids(self, char_id: str) -> list[str]:
        conn = self._conn()
        rows = conn.execute(
            "SELECT session_id FROM session_characters WHERE character_id = ?",
            (char_id,),
        ).fetchall()
        conn.close()
        return [r["session_id"] for r in rows]

    def is_character_in_session(self, session_id: str, char_id: str) -> bool:
        conn = self._conn()
        row = conn.execute(
            "SELECT 1 FROM session_characters WHERE session_id = ? AND character_id = ?",
            (session_id, char_id),
        ).fetchone()
        conn.close()
        return row is not None

    def join_session(self, session_id: str, char_id: str) -> bool:
        if not self.get_session(session_id, with_messages=False):
            return False
        if not self.get_global_character(char_id):
            return False
        conn = self._conn()
        conn.execute(
            """INSERT OR IGNORE INTO session_characters
               (session_id, character_id, hidden_brief, goals) VALUES (?, ?, '', '')""",
            (session_id, char_id),
        )
        conn.commit()
        conn.close()
        self._touch_session(session_id)
        return True

    def leave_session(self, session_id: str, char_id: str) -> bool:
        conn = self._conn()
        result = conn.execute(
            "DELETE FROM session_characters WHERE session_id = ? AND character_id = ?",
            (session_id, char_id),
        )
        conn.commit()
        conn.close()
        if result.rowcount > 0:
            self._touch_session(session_id)
            return True
        return False

    def add_character(self, session_id: str, char: Character) -> Character:
        self.create_global_character(char)
        self.join_session(session_id, char.id)
        link_updates = {}
        if char.hidden_brief:
            link_updates["hidden_brief"] = char.hidden_brief
        if char.goals:
            link_updates["goals"] = char.goals
        if link_updates:
            self.update_session_character_link(session_id, char.id, link_updates)
        return char

    def update_character(self, session_id: str, char_id: str, updates: dict) -> Character | None:
        if not self.is_character_in_session(session_id, char_id):
            return None

        global_updates = {k: v for k, v in updates.items() if k in GLOBAL_CHAR_FIELDS and v is not None}
        link_updates = {k: v for k, v in updates.items() if k in LINK_CHAR_FIELDS and v is not None}

        if global_updates:
            self.update_global_character(char_id, global_updates)
        if link_updates:
            self.update_session_character_link(session_id, char_id, link_updates)

        session = self.get_session(session_id, with_messages=False)
        if not session:
            return None
        return session.characters.get(char_id)

    def update_session_character_link(self, session_id: str, char_id: str, updates: dict) -> None:
        conn = self._conn()
        if "hidden_brief" in updates and updates["hidden_brief"] is not None:
            conn.execute(
                "UPDATE session_characters SET hidden_brief = ? WHERE session_id = ? AND character_id = ?",
                (updates["hidden_brief"], session_id, char_id),
            )
        if "goals" in updates and updates["goals"] is not None:
            conn.execute(
                "UPDATE session_characters SET goals = ? WHERE session_id = ? AND character_id = ?",
                (updates["goals"], session_id, char_id),
            )
        conn.commit()
        conn.close()

    def delete_character(self, session_id: str, char_id: str) -> bool:
        return self.leave_session(session_id, char_id)

    def add_message(self, session_id: str, message: Message) -> Message:
        conn = self._conn()
        conn.execute(
            """INSERT INTO messages
               (id, session_id, sender_id, sender_role, kind, content, reasoning_content,
                visibility, viewers_json, phase_id, round, action_type, action_payload_json,
                memory_for_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                message.id,
                session_id,
                message.sender_id,
                message.sender_role,
                message.kind.value,
                message.content,
                message.reasoning_content,
                message.visibility.value,
                json.dumps(message.viewers),
                message.phase_id,
                message.round,
                message.action_type,
                json.dumps(message.action_payload),
                json.dumps(message.memory_for),
                message.created_at.isoformat(),
            ),
        )
        conn.commit()
        conn.close()
        self._touch_session(session_id)
        return message

    def delete_message(self, session_id: str, message_id: str) -> bool:
        conn = self._conn()
        cur = conn.execute(
            "DELETE FROM messages WHERE session_id = ? AND id = ?",
            (session_id, message_id),
        )
        conn.commit()
        conn.close()
        if cur.rowcount:
            self._touch_session(session_id)
            return True
        return False

    def _touch_session(self, session_id: str) -> None:
        session = self.get_session(session_id, with_messages=False)
        if session:
            self.update_session(session)

    def _get_global_character_row(self, conn: sqlite3.Connection, char_id: str) -> Character | None:
        row = conn.execute("SELECT * FROM characters WHERE id = ?", (char_id,)).fetchone()
        if not row:
            return None
        return Character(
            id=row["id"],
            name=row["name"],
            avatar_url=row["avatar_url"] or "",
            persona=row["persona"] or "",
            speech_style=row["speech_style"] or "",
            hidden_brief=row["hidden_brief"] or "",
            goals=row["goals"] or "",
            model=row["model"] or "",
            api_base=row["api_base"] or "",
            api_key=row["api_key"] or "",
            temperature=row["temperature"] or 0.8,
            is_referee=bool(row["is_referee"]),
            can_host=bool(row["can_host"]),
            extensions=json.loads(row["extensions_json"] or "{}"),
        )

    def _row_to_message(self, row: sqlite3.Row) -> Message:
        return Message(
            id=row["id"],
            session_id=row["session_id"],
            sender_id=row["sender_id"],
            sender_role=row["sender_role"],
            kind=MessageKind(row["kind"]),
            content=row["content"],
            reasoning_content=row["reasoning_content"] or "",
            visibility=Visibility(row["visibility"]),
            viewers=json.loads(row["viewers_json"]),
            phase_id=row["phase_id"] or "",
            round=row["round"],
            action_type=row["action_type"],
            action_payload=json.loads(row["action_payload_json"]),
            memory_for=json.loads(row["memory_for_json"]),
            created_at=datetime.fromisoformat(row["created_at"]),
        )


def _upsert_global_row(conn: sqlite3.Connection, char: Character) -> None:
    now = datetime.now().isoformat()
    existing = conn.execute("SELECT id FROM characters WHERE id = ?", (char.id,)).fetchone()
    if existing:
        conn.execute(
            """UPDATE characters SET
               name=?, avatar_url=?, persona=?, speech_style=?, hidden_brief=?, goals=?,
               model=?, api_base=?, api_key=?, temperature=?, is_referee=?, can_host=?,
               extensions_json=?, updated_at=?
               WHERE id=?""",
            (
                char.name,
                char.avatar_url,
                char.persona,
                char.speech_style,
                char.hidden_brief,
                char.goals,
                char.model,
                char.api_base,
                char.api_key,
                char.temperature,
                1 if char.is_referee else 0,
                1 if char.can_host else 0,
                json.dumps(char.extensions),
                now,
                char.id,
            ),
        )
    else:
        conn.execute(
            """INSERT INTO characters
               (id, name, avatar_url, persona, speech_style, hidden_brief, goals,
                model, api_base, api_key, temperature, is_referee, can_host,
                extensions_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                char.id,
                char.name,
                char.avatar_url,
                char.persona,
                char.speech_style,
                char.hidden_brief,
                char.goals,
                char.model,
                char.api_base,
                char.api_key,
                char.temperature,
                1 if char.is_referee else 0,
                1 if char.can_host else 0,
                json.dumps(char.extensions),
                now,
                now,
            ),
        )


def new_character_id() -> str:
    return f"char_{uuid.uuid4().hex[:8]}"
