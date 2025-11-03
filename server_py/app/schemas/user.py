from datetime import datetime
from pydantic import BaseModel, EmailStr, computed_field
from typing import Optional

# Общая схема для пользователя
class UserBase(BaseModel):
    phone: str
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: bool = True
    role: Optional[str] = None
    display_name: Optional[str] = None
    
# Схема для создания пользователя
class UserCreate(UserBase):
    pass
    
# Схема для обновления пользователя
class UserUpdate(BaseModel):
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None
    display_name: Optional[str] = None
    
# Схема для ответа с данными пользователя
class User(UserBase):
    id: int
    is_superuser: bool
    created_at: datetime
    updated_at: datetime

    @computed_field(return_type=Optional[str])
    def name(self) -> Optional[str]:
        for value in (self.display_name, self.first_name, self.last_name, self.phone):
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None
    
    class Config:
        from_attributes = True