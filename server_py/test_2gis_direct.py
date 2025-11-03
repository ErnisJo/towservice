import asyncio
import httpx
import json
import sys
sys.path.append('.')
from app.core.config import settings

async def test():
    lat, lon = 42.9140914, 74.4662195
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        params = {
            "lat": lat,
            "lon": lon,
            "type": "building,street,attraction",
            "fields": "items.address,items.address_name,items.full_name,items.name,items.adm_div",
            "radius": 50,
            "key": settings.DGIS_API_KEY,
        }
        resp = await client.get("https://catalog.api.2gis.com/3.0/items/geocode", params=params)
        resp.raise_for_status()
        data = resp.json()
        
        print("\n=== RAW 2GIS Response ===")
        if data.get("result", {}).get("items"):
            print(json.dumps(data["result"]["items"][0], indent=2, ensure_ascii=False))
        else:
            print("NO ITEMS")
            print(json.dumps(data, indent=2, ensure_ascii=False))

asyncio.run(test())
