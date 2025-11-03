from sqlalchemy import Column, Integer, String, DateTime, func
from app.core.database import Base


class Support(Base):
    __tablename__ = "support"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String, default="+996 555 000-000")
    email = Column(String, default="support@example.com")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Info(Base):
    __tablename__ = "info"

    id = Column(Integer, primary_key=True, index=True)
    about = Column(String, default="Сервис вызова эвакуатора.")
    version = Column(String, default="1.0")
    company = Column(String, default="Tow Service")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
