from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict

from app.core.database import get_db
from app.models.tariff import Tariff
from app.schemas.tariff import TariffResponse

router = APIRouter()


@router.get("/tariff", response_model=TariffResponse)
async def get_tariff(db: AsyncSession = Depends(get_db)):
    """Get current tariff settings."""
    result = await db.execute(select(Tariff).order_by(Tariff.id.desc()).limit(1))
    tariff = result.scalars().first()
    
    if not tariff:
        # Return default values if no tariff exists
        return TariffResponse(base=600.0, perKm=40.0, per3min=10.0)
    
    return TariffResponse(
        base=tariff.base,
        perKm=tariff.per_km,
        per3min=tariff.per_3min
    )


@router.put("/tariff", response_model=TariffResponse)
async def update_tariff(
    tariff_data: Dict,
    db: AsyncSession = Depends(get_db)
):
    """Update tariff settings."""
    # Get or create tariff
    result = await db.execute(select(Tariff).order_by(Tariff.id.desc()).limit(1))
    tariff = result.scalars().first()
    
    if not tariff:
        tariff = Tariff()
        db.add(tariff)
    
    # Update values
    tariff.base = tariff_data.get("base", 600.0)
    tariff.per_km = tariff_data.get("perKm", 40.0)
    tariff.per_3min = tariff_data.get("per3min", 10.0)
    
    await db.commit()
    await db.refresh(tariff)
    
    return TariffResponse(
        base=tariff.base,
        perKm=tariff.per_km,
        per3min=tariff.per_3min
    )
