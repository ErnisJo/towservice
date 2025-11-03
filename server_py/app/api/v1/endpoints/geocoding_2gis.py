from fastapi import APIRouter, Query, HTTPException
import httpx
from app.core.config import settings

router = APIRouter()

DGIS_API_KEY = settings.DGIS_API_KEY


def is_in_kg(lat: float, lon: float) -> bool:
    """Простая проверка, что координаты лежат в пределах Кыргызстана."""
    return 39.0 <= lat <= 43.5 and 69.0 <= lon <= 81.0


def require_key() -> None:
    if not DGIS_API_KEY:
        raise HTTPException(status_code=503, detail="2GIS API key is not configured")


@router.get("/geocode/forward")
async def forward_geocode(
    query: str = Query(..., min_length=2, description="Адрес или место для поиска"),
):
    """Прямое геокодирование: текст → координаты через 2GIS."""

    trimmed = (query or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    require_key()

    # Если в запросе нет упоминания Кыргызстана, добавляем префикс
    narrowed = trimmed if any(k in trimmed.lower() for k in ["киргиз", "кыргыз", "kyrgyz", "kg"]) else f"Кыргызстан, {trimmed}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # 2GIS Items API
            params = {
                "q": narrowed,
                "fields": "items.point,items.geometry.centroid,items.address_name,items.full_name",
                "page_size": 10,
                "key": DGIS_API_KEY,
            }
            resp = await client.get("https://catalog.api.2gis.com/3.0/items", params=params)
            resp.raise_for_status()
            data = resp.json()

            for item in data.get("result", {}).get("items", []):
                # Координаты из point или geometry.centroid
                point = item.get("point") or item.get("geometry", {}).get("centroid", {})
                lat = point.get("lat") or point.get("latitude")
                lon = point.get("lon") or point.get("longitude")

                if lat is not None and lon is not None and is_in_kg(float(lat), float(lon)):
                    address = item.get("address_name") or item.get("full_name") or trimmed
                    return {
                        "latitude": float(lat),
                        "longitude": float(lon),
                        "address": address.strip(),
                    }
        except Exception:
            pass

        try:
            # 2GIS Geocoder API (запасной вариант)
            params = {
                "q": narrowed,
                "key": DGIS_API_KEY,
            }
            resp = await client.get("https://catalog.api.2gis.com/3.0/items/geocode", params=params)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("result", {}).get("items", [])

            if items:
                best = items[0]
                point = best.get("point") or best.get("geometry", {}).get("centroid", {})
                lat = point.get("lat") or point.get("latitude")
                lon = point.get("lon") or point.get("longitude")

                if lat and lon and is_in_kg(float(lat), float(lon)):
                    address = best.get("address_name") or best.get("full_name") or trimmed
                    return {
                        "latitude": float(lat),
                        "longitude": float(lon),
                        "address": address.strip(),
                    }
        except Exception:
            pass

    raise HTTPException(status_code=404, detail="No results found")


@router.get("/geocode/reverse")
async def reverse_geocode(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Широта"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Долгота"),
):
    """Обратное геокодирование: координаты → адрес через 2GIS."""

    if not is_in_kg(lat, lon):
        raise HTTPException(status_code=400, detail="Coordinates outside Kyrgyzstan bounds")

    require_key()

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            params = {
                "lat": lat,
                "lon": lon,
                "type": "house",
                "key": DGIS_API_KEY,
            }
            resp = await client.get("https://catalog.api.2gis.com/3.0/items/geocode", params=params)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("result", {}).get("items", [])
            if items:
                address = items[0].get("address_name") or items[0].get("full_name")
                if address:
                    return {"latitude": lat, "longitude": lon, "address": address.strip()}
        except Exception:
            pass

    raise HTTPException(status_code=404, detail="Address not found")


@router.get("/geocode/suggest")
async def suggest_places(
    query: str = Query(..., min_length=2, description="Начало адреса или названия места"),
    limit: int = Query(8, ge=1, le=20, description="Максимум результатов"),
):
    """Подсказки адресов/POI из 2GIS."""

    trimmed = (query or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    require_key()

    narrowed = trimmed if any(k in trimmed.lower() for k in ["киргиз", "кыргыз", "kyrgyz", "kg"]) else f"Кыргызстан, {trimmed}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            params = {
                "q": narrowed,
                "fields": "items.point,items.geometry.centroid,items.address_name,items.full_name,items.name",
                "page_size": max(limit, 15),
                "key": DGIS_API_KEY,
            }
            resp = await client.get("https://catalog.api.2gis.com/3.0/items", params=params)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("result", {}).get("items", [])

            results = []
            seen = set()
            for item in items:
                point = item.get("point") or item.get("geometry", {}).get("centroid", {})
                lat = point.get("lat") or point.get("latitude")
                lon = point.get("lon") or point.get("longitude")

                if lat is None or lon is None:
                    continue

                lat_f, lon_f = float(lat), float(lon)
                if not is_in_kg(lat_f, lon_f):
                    continue

                dedup_key = f"{lat_f:.5f},{lon_f:.5f}"
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                title = item.get("name") or item.get("full_name") or item.get("address_name") or trimmed
                subtitle = item.get("address_name") or item.get("full_name") or ""

                results.append({
                    "title": title.strip(),
                    "subtitle": subtitle.strip(),
                    "latitude": lat_f,
                    "longitude": lon_f,
                    "address": (subtitle or title).strip(),
                })

                if len(results) >= limit:
                    break

            return {"results": results}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"2GIS suggestion request failed: {str(e)}")
