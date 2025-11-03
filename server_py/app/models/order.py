from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base

class Order(Base):
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Адреса
    address = Column(String, nullable=True)  # Полная строка "A: ... → B: ..."
    from_address = Column(String, nullable=True)
    to_address = Column(String, nullable=True)
    
    # Координаты
    start_coords = Column(JSON, nullable=True)  # {"latitude": ..., "longitude": ...}
    dest_coords = Column(JSON, nullable=True)
    
    # Маршрут и стоимость
    distance = Column(Float, nullable=True)  # метры
    duration = Column(Float, nullable=True)  # секунды
    cost = Column(Float, nullable=True)
    
    # Детали заказа
    status = Column(String, default="pending")  # pending, accepted, in_progress, completed, cancelled
    driver_name = Column(String, nullable=True)
    vehicle_make = Column(String, nullable=True)
    vehicle_model = Column(String, nullable=True)
    plate_number = Column(String, nullable=True)
    vehicle_color = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    
    # Временные метки
    started_at = Column(DateTime, nullable=True)
    arrived_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Дополнительные данные
    meta = Column(JSON, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="orders")
