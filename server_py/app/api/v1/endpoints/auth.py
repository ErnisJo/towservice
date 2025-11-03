from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.auth import AuthService
from app.schemas.auth import PhoneRequest, VerifyCodeRequest, TokenResponse
from app.schemas.user import User as UserSchema
from app.core.phone import format_phone_display


def _serialize_user(user) -> dict:
    data = UserSchema.model_validate(user).model_dump(mode="json")
    preferred = None
    for value in (user.display_name, user.first_name, user.last_name, user.phone):
        if isinstance(value, str) and value.strip():
            preferred = value.strip()
            break
    data["name"] = preferred
    return data

router = APIRouter()

@router.post("/send-code", status_code=status.HTTP_200_OK)
async def send_verification_code(
    request: PhoneRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Отправляет код подтверждения на указанный номер телефона.
    Код будет выведен в консоль сервера (для разработки).
    """
    auth_service = AuthService(db)
    try:
        code, normalized_phone = await auth_service.send_verification_code(request.phone)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный номер телефона"
        )
    
    # Проверяем, существует ли пользователь
    user = await auth_service.find_user_by_phone(normalized_phone, request.phone)
    user_exists = user is not None
    
    return {
        "ok": True,
        "message": "Код отправлен",
        "phone": normalized_phone,
        "phoneDisplay": format_phone_display(normalized_phone),
        "phone_display": format_phone_display(normalized_phone),
        "devCode": code,  # Для разработки
        "userExists": user_exists
    }

@router.post("/verify-code", response_model=TokenResponse)
async def verify_code(
    request: VerifyCodeRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Проверяет код подтверждения и возвращает JWT токен.
    Если пользователь новый - автоматически регистрирует его.
    """
    auth_service = AuthService(db)
    user = await auth_service.verify_code(
        request.phone,
        request.code,
        request.display_name or request.name,
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный или истекший код"
        )
    
    # Создаем JWT токен
    token = auth_service.create_token(user.id)
    
    user_payload = _serialize_user(user)

    payload = {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "token": token,  # Дополнительное поле для совместимости
        "user": user_payload,
    }

    payload["phone"] = user_payload.get("phone")
    payload["phone_display"] = format_phone_display(user_payload.get("phone"))
    payload["phoneDisplay"] = payload["phone_display"]

    return payload


@router.post("/logout")
async def logout() -> dict:
    """Заглушка для совместимости с мобильным клиентом."""
    return {"ok": True}