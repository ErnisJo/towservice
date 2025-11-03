from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
from app.websockets.chat_ws import router as chat_ws_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Настройка CORS
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Подключаем роутеры API v1
app.include_router(api_router, prefix=settings.API_V1_STR)

# Подключаем роутеры БЕЗ префикса для обратной совместимости
app.include_router(api_router, prefix="")

# Вебсокеты для чата поддержки
app.include_router(chat_ws_router)