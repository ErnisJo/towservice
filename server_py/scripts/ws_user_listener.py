import asyncio
import json

import websockets

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzYyMDIwMDM0fQ.oiMTOSNJXopvAM0qCp_qmrEVSt2dZi93xyF1CVr5VPY"


async def main() -> None:
    uri = "ws://127.0.0.1:4001/ws/user"
    async with websockets.connect(uri) as websocket:
        await websocket.send(json.dumps({"token": TOKEN}))
        print("Подключено к /ws/user, ожидаем одно сообщение...")
        try:
            payload = await asyncio.wait_for(websocket.recv(), timeout=60)
        except asyncio.TimeoutError:
            print("Таймаут ожидания сообщения")
            return
        print(f"Получено: {payload}")


if __name__ == "__main__":
    asyncio.run(main())
