from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.verification import VerificationCode
from app.models.user import User
from app.core.security import create_access_token
from app.core.phone import normalize_phone
import random
import string

class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def send_verification_code(self, phone: str) -> tuple[str, str]:
        """Генерирует и сохраняет код подтверждения для телефона.

        Возвращает пару (код, нормализованный номер) в международном формате.
        """
        normalized_phone = normalize_phone(phone)
        if not normalized_phone:
            raise ValueError("invalid_phone")

        # Генерируем 6-значный код
        code = ''.join(random.choices(string.digits, k=6))
        
        # Время жизни кода - 5 минут
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        
        # Сохраняем код в базу
        verification = VerificationCode(
            phone=normalized_phone,
            code=code,
            expires_at=expires_at
        )
        
        self.db.add(verification)
        await self.db.commit()
        
        # В реальном приложении здесь была бы отправка SMS
        # Пока просто выводим в консоль
        print(f"\n{'='*50}")
        print(f"📱 SMS код для {normalized_phone}: {code}")
        print(f"⏰ Истекает через 5 минут")
        print(f"{'='*50}\n")

        return code, normalized_phone
    
    def _generate_default_display_name(self, phone: str) -> str:
        digits = ''.join(ch for ch in (phone or '') if ch.isdigit())
        if digits:
            return f"Пользователь {digits[-4:]}"
        return f"Пользователь {datetime.utcnow().strftime('%d.%m.%Y')}"

    def _collect_phone_candidates(self, normalized_phone: str, original_phone: str | None = None) -> list[str]:
        candidates: set[str] = set()

        def add(value: str | None) -> None:
            if value is None:
                return
            text = value.strip()
            if text:
                candidates.add(text)

        add(normalized_phone)
        add(normalized_phone.replace('+', ''))

        digits_norm = ''.join(ch for ch in normalized_phone if ch.isdigit())
        add(digits_norm)
        if digits_norm:
            add('+' + digits_norm)

        if original_phone:
            add(original_phone)
            digits_original = ''.join(ch for ch in original_phone if ch.isdigit())
            add(digits_original)
            if digits_original:
                add('+' + digits_original)
                if not digits_original.startswith('996') and len(digits_original) >= 9:
                    add('996' + digits_original[-9:])

        return [c for c in candidates if c]

    async def find_user_by_phone(self, normalized_phone: str, original_phone: str | None = None) -> User | None:
        candidates = self._collect_phone_candidates(normalized_phone, original_phone)
        if not candidates:
            return None
        result = await self.db.execute(select(User).where(User.phone.in_(candidates)))
        return result.scalar_one_or_none()

    async def verify_code(self, phone: str, code: str, display_name: str | None = None) -> User | None:
        """Проверяет код и возвращает пользователя или создает нового"""
        normalized_phone = normalize_phone(phone)
        if not normalized_phone:
            return None

        # Ищем неиспользованный код для этого телефона
        result = await self.db.execute(
            select(VerificationCode)
            .where(
                VerificationCode.phone == normalized_phone,
                VerificationCode.code == code,
                VerificationCode.is_used == False,
                VerificationCode.expires_at > datetime.utcnow()
            )
            .order_by(VerificationCode.created_at.desc())
        )
        verification = result.scalar_one_or_none()
        
        if not verification:
            return None
        
        # Помечаем код как использованный
        verification.is_used = True
        
        # Ищем или создаем пользователя
        user = await self.find_user_by_phone(normalized_phone, phone)
        
        if not user:
            # Создаем нового пользователя
            user = User(
                phone=normalized_phone,
                display_name=display_name or self._generate_default_display_name(normalized_phone),
            )
            self.db.add(user)
        else:
            if user.phone != normalized_phone:
                user.phone = normalized_phone
        if display_name and not user.display_name:
            user.display_name = display_name
        elif not user.display_name:
            user.display_name = self._generate_default_display_name(normalized_phone)
        
        await self.db.commit()
        await self.db.refresh(user)
        
        return user
    
    async def get_user_by_id(self, user_id: int) -> User | None:
        """Получает пользователя по ID"""
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()
    
    def create_token(self, user_id: int) -> str:
        """Создает JWT токен для пользователя"""
        return create_access_token(data={"sub": str(user_id)})