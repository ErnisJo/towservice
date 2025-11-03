from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderResponse
from typing import List, Optional

router = APIRouter()

@router.get("", response_model=List[OrderResponse])
async def get_orders(
    db: AsyncSession = Depends(get_db)
):
    """Получение списка заказов"""
    result = await db.execute(select(Order).order_by(Order.created_at.desc()))
    orders = result.scalars().all()
    return orders

@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """Создание заказа (с авторизацией или без)"""
    # Извлекаем детали из вложенного объекта details
    details = order_data.details or {}
    
    order = Order(
        user_id=current_user.id if current_user else None,
        address=order_data.address,
        from_address=order_data.fromAddress,
        to_address=order_data.toAddress,
        start_coords=order_data.startCoords,
        dest_coords=order_data.destCoords,
        distance=order_data.distance,
        duration=order_data.duration,
        cost=order_data.cost,
        status="pending",
        driver_name=details.get("driverName"),
        vehicle_make=details.get("vehicleMake"),
        vehicle_model=details.get("vehicleModel"),
        plate_number=details.get("plateNumber"),
        vehicle_color=details.get("vehicleColor"),
        notes=details.get("notes"),
        started_at=details.get("startedAt"),
        arrived_at=details.get("arrivedAt"),
        meta=order_data.meta
    )
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    return order

@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Получение заказа по ID"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден"
        )
    
    return order