from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings
from app.core.database import Base

# Импортируем модели чтобы они попали в metadata перед созданием таблиц
from app.models import user  # noqa: F401
from app.models import verification  # noqa: F401
from app.models import order  # noqa: F401
from app.models import chat_message  # noqa: F401
from app.models import tariff  # noqa: F401
from app.models import app_settings  # noqa: F401

async def init_db():
    """Инициализация базы данных и создание таблиц"""
    # Гарантируем наличие директории для файла базы данных
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Создаем временный движок для инициализации
    engine = create_async_engine(settings.DATABASE_URL)
    
    def ensure_user_display_name_column(sync_conn):
        inspector = inspect(sync_conn)
        columns = {col["name"] for col in inspector.get_columns("users")}
        if "display_name" not in columns:
            sync_conn.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR"))

    async with engine.begin() as conn:
        # Создаем все таблицы
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(ensure_user_display_name_column)
    
    # Закрываем движок
    await engine.dispose()