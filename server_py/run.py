import sys
from pathlib import Path

# Добавляем корневую директорию проекта в PYTHONPATH
sys.path.append(str(Path(__file__).resolve().parent))

import uvicorn
from app.core.config import settings
from app.core.init_db import init_db
import asyncio

# Для Windows: используем SelectorEventLoop вместо ProactorEventLoop
import platform
if platform.system() == 'Windows':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

if __name__ == "__main__":
    # Создаем таблицы в базе данных
    asyncio.run(init_db())
    
    # Запускаем сервер
    # Важно: reload=True игнорирует host, поэтому используем reload=False для сетевого доступа
    uvicorn.run(
        "app.main:app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=False  # Отключаем reload чтобы host работал правильно
    )