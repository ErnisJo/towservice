from pydantic_settings import BaseSettings
from pathlib import Path
from typing import List
import os

class Settings(BaseSettings):
    # Project
    PROJECT_NAME: str = "TowService API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    
    # Server
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 4001
    
    # Database
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DATA_DIR}/app.db"
    
    # Security
    SECRET_KEY: str = "your-secret-key-here"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    
    # Geocoding API Keys
    MAPTILER_API_KEY: str = ""
    DGIS_API_KEY: str = "c67b9f66-6f5a-458d-8682-9b452c85f011"
    GEOAPIFY_API_KEY: str = ""  # Бесплатный план: 3000 запросов/день
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Создаем экземпляр настроек
settings = Settings()