from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.core.config import settings
from app.core.database import get_db
from app.services.auth import AuthService
from app.models.user import User

# Определяем схему безопасности
security = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    Dependency для получения текущего пользователя из JWT токена.
    Возвращает None если токен не предоставлен или невалиден (для опциональной авторизации).
    """
    if not credentials:
        return None
    
    token = credentials.credentials
    
    try:
        # Декодируем JWT токен
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=["HS256"]
        )
        user_id: str = payload.get("sub")
        
        if user_id is None:
            return None
            
    except JWTError:
        return None
    
    # Получаем пользователя из БД
    auth_service = AuthService(db)
    user = await auth_service.get_user_by_id(int(user_id))
    
    if user is None or not user.is_active:
        return None
    
    return user

async def require_auth(
    current_user: Optional[User] = Depends(get_current_user)
) -> User:
    """
    Dependency для эндпоинтов, которые обязательно требуют авторизации.
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user