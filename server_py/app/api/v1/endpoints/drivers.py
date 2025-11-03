from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[dict])
async def get_drivers(db: AsyncSession = Depends(get_db)):
    """Get all drivers (users with role='driver')."""
    result = await db.execute(
        select(User).where(User.role == "driver").order_by(User.created_at.desc())
    )
    drivers = result.scalars().all()
    
    return [
        {
            "id": d.id,
            "phone": d.phone,
            "name": d.first_name or d.phone,
            "car": None,  # Add vehicle info when available
            "plate": None,
            "createdAt": d.created_at.isoformat() if d.created_at else None
        }
        for d in drivers
    ]
