import asyncio
import httpx

async def test():
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Координаты из твоего заказа
        r = await client.get('http://localhost:4001/geocode/reverse?lat=42.9140914&lon=74.4662195')
        print(r.text)

asyncio.run(test())
