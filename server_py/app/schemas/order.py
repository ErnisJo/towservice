from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any

class OrderCreate(BaseModel):
    address: Optional[str] = None
    fromAddress: Optional[str] = None
    toAddress: Optional[str] = None
    startCoords: Optional[Dict[str, float]] = None
    destCoords: Optional[Dict[str, float]] = None
    distance: Optional[float] = None
    duration: Optional[float] = None
    cost: Optional[float] = None
    meta: Optional[Dict[str, Any]] = None
    details: Optional[Dict[str, Any]] = None

class OrderResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    address: Optional[str] = None
    from_address: Optional[str] = None
    to_address: Optional[str] = None
    start_coords: Optional[Dict[str, float]] = None
    dest_coords: Optional[Dict[str, float]] = None
    distance: Optional[float] = None
    duration: Optional[float] = None
    cost: Optional[float] = None
    status: str
    driver_name: Optional[str] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    plate_number: Optional[str] = None
    vehicle_color: Optional[str] = None
    notes: Optional[str] = None
    started_at: Optional[datetime] = None
    arrived_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    meta: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True
