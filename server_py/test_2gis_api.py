import httpx
import json
import asyncio

async def test_2gis_direct():
    API_KEY = "c67b9f66-6f5a-458d-8682-9b452c85f011"
    
    print("="*60)
    print("Тест 1: /items с query='Мира'")
    print("="*60)
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            params = {
                "q": "Мира",
                "fields": "items.point,items.address_name,items.full_name,items.name",
                "page_size": 10,
                "key": API_KEY,
                "locale": "ru_KG",
                "location": "74.6057,42.8746",
                "radius": 50000,
            }
            resp = await client.get("https://catalog.api.2gis.com/3.0/items", params=params)
            print(f"Status: {resp.status_code}")
            print(f"URL: {resp.url}")
            data = resp.json()
            print(json.dumps(data, ensure_ascii=False, indent=2)[:2000])
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
    
    print("\n" + "="*60)
    print("Тест 2: /items/geocode с query='улица Мира, Бишкек'")
    print("="*60)
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            params = {
                "q": "улица Мира, Бишкек",
                "fields": "items.point,items.address_name,items.full_name",
                "key": API_KEY,
                "locale": "ru_KG",
            }
            resp = await client.get("https://catalog.api.2gis.com/3.0/items/geocode", params=params)
            print(f"Status: {resp.status_code}")
            data = resp.json()
            print(json.dumps(data, ensure_ascii=False, indent=2)[:2000])
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "="*60)
    print("Тест 3: /items с query='улица'")
    print("="*60)
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            params = {
                "q": "улица",
                "fields": "items.point,items.address_name,items.full_name,items.name",
                "page_size": 5,
                "key": API_KEY,
                "locale": "ru_KG",
            }
            resp = await client.get("https://catalog.api.2gis.com/3.0/items", params=params)
            print(f"Status: {resp.status_code}")
            data = resp.json()
            print(json.dumps(data, ensure_ascii=False, indent=2)[:2000])
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_2gis_direct())
