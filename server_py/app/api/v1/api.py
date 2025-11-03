from fastapi import APIRouter
from app.api.v1.endpoints import users, auth, orders, drivers, tariff, settings, geocoding

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(drivers.router, prefix="/drivers", tags=["drivers"])
api_router.include_router(tariff.router, tags=["tariff"])
api_router.include_router(settings.router, tags=["settings"])
api_router.include_router(geocoding.router, prefix="/geocode", tags=["geocoding"])