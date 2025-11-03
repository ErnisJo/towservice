from __future__ import annotations

import asyncio
import logging
from typing import Dict, List, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.services.auth import AuthService
from app.services.chat import ChatService, serialize_message

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatConnectionManager:
    def __init__(self) -> None:
        self._user_connections: Dict[int, Set[WebSocket]] = {}
        self._user_lookup: Dict[WebSocket, int] = {}
        self._admin_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def register_user(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            self._user_connections.setdefault(user_id, set()).add(websocket)
            self._user_lookup[websocket] = user_id

    async def register_admin(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._admin_connections.add(websocket)

    async def unregister(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self._admin_connections:
                self._admin_connections.discard(websocket)
                return
            user_id = self._user_lookup.pop(websocket, None)
            if user_id is None:
                return
            conns = self._user_connections.get(user_id)
            if not conns:
                return
            conns.discard(websocket)
            if not conns:
                self._user_connections.pop(user_id, None)

    async def _snapshot_user_connections(self, user_id: int) -> List[WebSocket]:
        async with self._lock:
            connections = self._user_connections.get(user_id)
            return list(connections) if connections else []

    async def _snapshot_admin_connections(self) -> List[WebSocket]:
        async with self._lock:
            return list(self._admin_connections)

    async def send_to_user(self, user_id: int, message: dict) -> None:
        for ws in await self._snapshot_user_connections(user_id):
            await self._safe_send(ws, message)

    async def broadcast_admin(self, message: dict) -> None:
        for ws in await self._snapshot_admin_connections():
            await self._safe_send(ws, message)

    async def push_message(self, user_id: int, message: dict) -> None:
        await asyncio.gather(
            self.send_to_user(user_id, message),
            self.broadcast_admin(message),
        )

    async def _safe_send(self, websocket: WebSocket, message: dict) -> None:
        try:
            await websocket.send_json(message)
        except Exception:
            await self.unregister(websocket)


chat_manager = ChatConnectionManager()


async def _resolve_user_from_token(token: str) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        return None

    async with AsyncSessionLocal() as session:
        auth_service = AuthService(session)
        user = await auth_service.get_user_by_id(user_id_int)
        return user


async def _user_exists(user_id: int) -> bool:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User.id).where(User.id == user_id))
        return result.scalar_one_or_none() is not None


@router.websocket("/ws/user")
async def user_chat_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    user_id: Optional[int] = None
    try:
        init_payload = await websocket.receive_json()
        token = init_payload.get("token") if isinstance(init_payload, dict) else None
        user = await _resolve_user_from_token(token)
        if not user:
            await websocket.close(code=4403)
            return
        user_id = user.id
        await chat_manager.register_user(user_id, websocket)

        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue
            raw_text = data.get("text")
            text = (raw_text or "").strip()
            if not text:
                continue
            meta = data.get("meta") if isinstance(data.get("meta"), dict) else None
            async with AsyncSessionLocal() as session:
                service = ChatService(session)
                message = await service.create_message(
                    user_id=user_id,
                    sender="user",
                    text=text,
                    meta=meta,
                    auto_commit=True,
                )
            payload = {"type": "message", "data": serialize_message(message)}
            await chat_manager.push_message(user_id, payload)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("User chat websocket error")
        try:
            await websocket.close(code=1011)
        except Exception:  # noqa: BLE001
            pass
    finally:
        await chat_manager.unregister(websocket)


@router.websocket("/ws/admin")
async def admin_chat_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    await chat_manager.register_admin(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue
            user_id = data.get("userId")
            text_raw = data.get("text")
            if user_id is None or text_raw is None:
                continue
            try:
                user_id_int = int(user_id)
            except (TypeError, ValueError):
                continue
            text = str(text_raw).strip()
            if not text:
                continue
            if not await _user_exists(user_id_int):
                continue
            meta = data.get("meta") if isinstance(data.get("meta"), dict) else None
            async with AsyncSessionLocal() as session:
                service = ChatService(session)
                message = await service.create_message(
                    user_id=user_id_int,
                    sender="admin",
                    text=text,
                    meta=meta,
                    auto_commit=True,
                )
            payload = {"type": "message", "data": serialize_message(message)}
            await chat_manager.push_message(user_id_int, payload)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("Admin chat websocket error")
        try:
            await websocket.close(code=1011)
        except Exception:  # noqa: BLE001
            pass
    finally:
        await chat_manager.unregister(websocket)
