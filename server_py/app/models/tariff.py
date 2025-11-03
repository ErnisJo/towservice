from sqlalchemy import Column, Integer, Float, DateTime, func
from app.core.database import Base


class Tariff(Base):
    __tablename__ = "tariffs"

    id = Column(Integer, primary_key=True, index=True)
    base = Column(Float, default=600.0)  # Base fare in KGS
    per_km = Column(Float, default=40.0)  # Price per kilometer
    per_3min = Column(Float, default=10.0)  # Price per 3 minutes
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
