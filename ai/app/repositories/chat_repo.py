"""Persistence for chats and messages. Kept behind a small interface so tests can use a fake."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.schemas import UserContext


@dataclass(frozen=True)
class ChatRef:
    id: UUID
    is_new: bool
    message_count: int


@dataclass
class AnswerExtras:
    """Optional parts of an assistant message (docs/03-technical-spec.md §2.3.6)."""

    suggestions: dict[str, Any] | None = None
    safety_notice: dict[str, Any] | None = None
    verification: dict[str, Any] | None = None
    verification_status: str | None = None
    citations: Sequence[Any] = field(default_factory=list)  # app.answer.extractive.Citation
    parent_message_id: int | None = None


class ChatRepository(Protocol):
    async def get_owned_chat(self, chat_id: UUID, user: UserContext) -> ChatRef | None: ...
    async def create_chat(self, user: UserContext, scope: list[str], explain_level: str | None,
                          context_type: str | None, context_id: str | None) -> ChatRef: ...
    async def add_user_message(self, chat_id: UUID, content: str, scope: list[str],
                               explain_level: str | None) -> int: ...
    async def deactivate_last_answer(self, chat_id: UUID) -> int | None: ...
    async def message_parent(self, message_id: int) -> int | None: ...
    async def add_assistant_message(self, chat_id: UUID, content: str, status: str, model: str,
                                    scope: list[str], explain_level: str | None, guardrail: dict | None,
                                    supersedes: int | None, ttft_ms: int | None, latency_ms: int | None,
                                    extras: AnswerExtras | None = None) -> int: ...
    async def touch_chat(self, chat_id: UUID, added_messages: int) -> None: ...
    async def set_title(self, chat_id: UUID, title: str) -> bool: ...
    async def log_retrieval(self, message_id: int, query_masked: str, filters: dict[str, Any],
                            candidates: list[dict[str, Any]], selected: list[int], latency_ms: int) -> None: ...
    async def log_guardrail(self, chat_id: UUID, message_id: int | None, user: UserContext, stage: str,
                            verdict: str, category: str, detail: dict[str, Any]) -> None: ...


def _owner_clause(user: UserContext) -> tuple[str, object]:
    if user.user_id is not None:
        return "user_id = %s", user.user_id
    return "guest_id = %s", user.guest_id


class PgChatRepository:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self.pool = pool

    async def get_owned_chat(self, chat_id: UUID, user: UserContext) -> ChatRef | None:
        clause, owner = _owner_clause(user)
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                f"SELECT id, message_count FROM app.chats WHERE id = %s AND {clause} AND deleted_at IS NULL",
                (chat_id, owner),
            )
            row = await cur.fetchone()
        return ChatRef(row["id"], False, row["message_count"]) if row else None

    async def create_chat(self, user: UserContext, scope: list[str], explain_level: str | None,
                          context_type: str | None, context_id: str | None) -> ChatRef:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                """INSERT INTO app.chats (user_id, guest_id, org_id, visibility, scope, explain_level,
                                          context_type, context_id, title_source)
                   VALUES (%s, %s, %s, 'private', %s, %s, %s, %s, 'auto') RETURNING id""",
                (user.user_id, user.guest_id, user.org_id, scope, explain_level, context_type, context_id),
            )
            row = await cur.fetchone()
        assert row is not None
        return ChatRef(row["id"], True, 0)

    async def add_user_message(self, chat_id: UUID, content: str, scope: list[str],
                               explain_level: str | None) -> int:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                """INSERT INTO app.messages (chat_id, role, status, content, scope, explain_level)
                   VALUES (%s, 'user', 'completed', %s, %s, %s) RETURNING id""",
                (chat_id, content, scope, explain_level),
            )
            row = await cur.fetchone()
        assert row is not None
        return int(row["id"])

    async def deactivate_last_answer(self, chat_id: UUID) -> int | None:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                """UPDATE app.messages SET is_active = false, updated_at = now()
                   WHERE id = (SELECT id FROM app.messages
                               WHERE chat_id = %s AND role = 'assistant' AND is_active
                               ORDER BY id DESC LIMIT 1)
                   RETURNING id""",
                (chat_id,),
            )
            row = await cur.fetchone()
        return int(row["id"]) if row else None

    async def message_parent(self, message_id: int) -> int | None:
        async with self.pool.connection() as conn:
            cur = await conn.execute("SELECT parent_message_id FROM app.messages WHERE id = %s", (message_id,))
            row = await cur.fetchone()
        return int(row["parent_message_id"]) if row and row["parent_message_id"] is not None else None

    async def add_assistant_message(self, chat_id: UUID, content: str, status: str, model: str,
                                    scope: list[str], explain_level: str | None, guardrail: dict | None,
                                    supersedes: int | None, ttft_ms: int | None, latency_ms: int | None,
                                    extras: AnswerExtras | None = None) -> int:
        x = extras or AnswerExtras()
        async with self.pool.connection() as conn, conn.transaction():
            cur = await conn.execute(
                """INSERT INTO app.messages (chat_id, role, status, content, model, scope, explain_level, guardrail,
                                             suggestions, safety_notice, verification, verification_status,
                                             parent_message_id, ttft_ms, latency_ms)
                   VALUES (%s, 'assistant', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (chat_id, status, content, model, scope, explain_level, _json(guardrail), _json(x.suggestions),
                 _json(x.safety_notice), _json(x.verification), x.verification_status, x.parent_message_id,
                 ttft_ms, latency_ms),
            )
            row = await cur.fetchone()
            assert row is not None
            new_id = int(row["id"])
            for c in x.citations:
                await conn.execute(
                    """INSERT INTO app.message_citations (message_id, n, kind, ref_id, ref_version, chunk_id, label,
                                                          title, snippet, cited_text, url, as_of, effective_from)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (new_id, c.n, c.kind, c.ref_id, c.ref_version, c.chunk_id, c.label, c.title, c.snippet,
                     c.cited_text, c.url, c.as_of, c.effective_from),
                )
            if supersedes is not None:
                await conn.execute("UPDATE app.messages SET superseded_by = %s WHERE id = %s", (new_id, supersedes))
        return new_id

    async def touch_chat(self, chat_id: UUID, added_messages: int) -> None:
        async with self.pool.connection() as conn:
            await conn.execute(
                """UPDATE app.chats SET message_count = message_count + %s, last_message_at = now(),
                          updated_at = now() WHERE id = %s""",
                (added_messages, chat_id),
            )

    async def set_title(self, chat_id: UUID, title: str) -> bool:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE app.chats SET title = %s, updated_at = now() WHERE id = %s AND title_source = 'auto'",
                (title, chat_id),
            )
        return cur.rowcount > 0

    async def log_retrieval(self, message_id: int, query_masked: str, filters: dict[str, Any],
                            candidates: list[dict[str, Any]], selected: list[int], latency_ms: int) -> None:
        async with self.pool.connection() as conn:
            await conn.execute(
                """INSERT INTO app.retrieval_logs (message_id, query_rewritten, filters, candidates, selected_chunk_ids,
                                                   latency_ms)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (message_id, query_masked, _json(filters), _json(candidates), selected, latency_ms),
            )

    async def log_guardrail(self, chat_id: UUID, message_id: int | None, user: UserContext, stage: str,
                            verdict: str, category: str, detail: dict[str, Any]) -> None:
        async with self.pool.connection() as conn:
            await conn.execute(
                """INSERT INTO app.guardrail_events (chat_id, message_id, user_id, guest_id, stage, verdict, category,
                                                     detail)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (chat_id, message_id, user.user_id, user.guest_id, stage, verdict, category, _json(detail)),
            )


def _json(value: Any) -> Any:
    from psycopg.types.json import Jsonb

    return None if value is None else Jsonb(value)
