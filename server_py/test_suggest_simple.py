import httpx
import json
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get("http://localhost:4001/geocode/suggest?query=Мира&limit=5")
            print(f"Status: {resp.status_code}")
            print(f"Response: {resp.text}")
            if resp.status_code == 200:
                data = resp.json()
                print(json.dumps(data, ensure_ascii=False, indent=2))
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
