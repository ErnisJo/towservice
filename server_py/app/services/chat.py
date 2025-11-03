from __future__ import annotations

from typing import Iterable, List, Optional

from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage


class ChatService:
    """Управление сообщениями чата в БД."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_message(
        self,
        *,
        user_id: int,
        sender: str,
        text: str,
        meta: Optional[dict] = None,
        auto_commit: bool = True,
    ) -> ChatMessage:
        message = ChatMessage(
            user_id=user_id,
            sender=sender,
            text=text,
            meta=meta,
        )
        self.db.add(message)
        await self.db.flush()
        await self.db.refresh(message)
        if auto_commit:
            await self.db.commit()
        return message

    async def list_messages(
        self,
        *,
        user_id: int,
        limit: Optional[int] = None,
    ) -> List[ChatMessage]:
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.user_id == user_id)
            .order_by(asc(ChatMessage.created_at), asc(ChatMessage.id))
        )
        if isinstance(limit, int) and limit > 0:
            stmt = stmt.limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars())


def serialize_message(message: ChatMessage) -> dict:
    """Преобразует модель SQLAlchemy в JSON-совместимый словарь."""
    return {
        "id": message.id,
        "userId": message.user_id,
        "sender": message.sender,
        "text": message.text,
        "createdAt": message.created_at.isoformat(),
        "meta": message.meta,
    }
