from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict

from app.core.database import get_db
from app.models.app_settings import Support, Info
from app.schemas.settings import SupportResponse, InfoResponse

router = APIRouter()


@router.get("/support", response_model=SupportResponse)
async def get_support(db: AsyncSession = Depends(get_db)):
    """Get support contact information."""
    result = await db.execute(select(Support).order_by(Support.id.desc()).limit(1))
    support = result.scalars().first()
    
    if not support:
        return SupportResponse(phone="+996 555 000-000", email="support@example.com")
    
    return SupportResponse(phone=support.phone, email=support.email)


@router.put("/support", response_model=SupportResponse)
async def update_support(
    support_data: Dict,
    db: AsyncSession = Depends(get_db)
):
    """Update support contact information."""
    result = await db.execute(select(Support).order_by(Support.id.desc()).limit(1))
    support = result.scalars().first()
    
    if not support:
        support = Support()
        db.add(support)
    
    support.phone = support_data.get("phone", "+996 555 000-000")
    support.email = support_data.get("email", "support@example.com")
    
    await db.commit()
    await db.refresh(support)
    
    return SupportResponse(phone=support.phone, email=support.email)


@router.get("/info", response_model=InfoResponse)
async def get_info(db: AsyncSession = Depends(get_db)):
    """Get application information."""
    result = await db.execute(select(Info).order_by(Info.id.desc()).limit(1))
    info = result.scalars().first()
    
    if not info:
        return InfoResponse(
            about="Сервис вызова эвакуатора.",
            version="1.0",
            company="Tow Service"
        )
    
    return InfoResponse(about=info.about, version=info.version, company=info.company)


@router.put("/info", response_model=InfoResponse)
async def update_info(
    info_data: Dict,
    db: AsyncSession = Depends(get_db)
):
    """Update application information."""
    result = await db.execute(select(Info).order_by(Info.id.desc()).limit(1))
    info = result.scalars().first()
    
    if not info:
        info = Info()
        db.add(info)
    
    info.about = info_data.get("about", "Сервис вызова эвакуатора.")
    info.version = info_data.get("version", "1.0")
    info.company = info_data.get("company", "Tow Service")
    
    await db.commit()
    await db.refresh(info)
    
    return InfoResponse(about=info.about, version=info.version, company=info.company)
