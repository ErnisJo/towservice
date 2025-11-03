from pydantic import BaseModel, field_validator
from typing import Optional
from app.schemas.user import User as UserSchema

# Схема для запроса кода по телефону
class PhoneRequest(BaseModel):
    phone: str
    
# Схема для подтверждения кода
class VerifyCodeRequest(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None
    display_name: Optional[str] = None

    @field_validator("name", "display_name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        return cleaned[:60]
    
# Схема для ответа с токеном
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    token: Optional[str] = None
    user: Optional[UserSchema] = None
    phone: Optional[str] = None
    phone_display: Optional[str] = None
    
# Схема для обновления профиля пользователя
class UserProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        return cleaned[:60]