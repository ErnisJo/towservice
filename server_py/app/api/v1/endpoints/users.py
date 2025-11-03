from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.order import Order
from app.schemas.user import User as UserSchema, UserUpdate

from app.schemas.auth import UserProfileUpdate
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse
from app.services.chat import ChatService, serialize_message
from app.websockets.chat_ws import chat_manager
from app.schemas.order import OrderResponse

router = APIRouter()

@router.get("", response_model=List[UserSchema])
async def list_users(db: AsyncSession = Depends(get_db)):
    """Возвращает список пользователей (для админки и мобильного приложения)."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()

@router.get("/stats")
async def users_stats(db: AsyncSession = Depends(get_db)):
    """Возвращает агрегированную информацию о количестве пользователей."""
    result = await db.execute(select(func.count()).select_from(User))
    count = result.scalar_one()
    return {"exists": count > 0, "count": count}

@router.get("/me", response_model=UserSchema)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Получение профиля текущего пользователя"""
    return current_user

@router.put("/me", response_model=UserSchema)
async def update_current_user_profile(
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновление профиля текущего пользователя"""
    # Обновляем данные пользователя
    payload = profile_data.model_dump(exclude_unset=True)
    sentinel = object()
    display_name = payload.pop("display_name", sentinel)
    if display_name is not sentinel:
        current_user.display_name = display_name
    for field, value in payload.items():
        setattr(current_user, field, value)
    
    await db.commit()
    await db.refresh(current_user)
    
    return current_user

@router.get("/{user_id}", response_model=UserSchema)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получение пользователя по ID (требует аутентификации)"""
    from sqlalchemy.future import select
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    return user


@router.get("/{user_id}/orders", response_model=List[OrderResponse])
async def get_user_orders(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Список заказов конкретного пользователя для админки."""

    result = await db.execute(
        select(Order).where(Order.user_id == user_id).order_by(Order.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{user_id}/chat", response_model=List[ChatMessageResponse])
async def get_user_chat(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )

    chat_service = ChatService(db)
    messages = await chat_service.list_messages(user_id=user_id, limit=500)
    return [ChatMessageResponse.model_validate(m) for m in messages]


@router.post(
    "/{user_id}/chat",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_user_chat_message(
    user_id: int,
    payload: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Текст сообщения не может быть пустым",
        )
    if len(text) > 2000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Слишком длинное сообщение",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )

    sender = payload.sender or ("user" if current_user else "admin")
    if sender not in {"user", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Недопустимый тип отправителя",
        )
    if sender == "user":
        if current_user is None or current_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав",
            )

    chat_service = ChatService(db)
    message = await chat_service.create_message(
        user_id=user_id,
        sender=sender,
        text=text,
        meta=payload.meta,
        auto_commit=True,
    )

    payload_dict = {"type": "message", "data": serialize_message(message)}
    await chat_manager.push_message(user_id, payload_dict)

    return ChatMessageResponse.model_validate(message)