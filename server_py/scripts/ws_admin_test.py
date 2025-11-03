import asyncio
import json

import websockets


async def main() -> None:
    uri = "ws://127.0.0.1:4001/ws/admin"
    async with websockets.connect(uri) as websocket:
        await websocket.send(json.dumps({"userId": 1, "text": "Hello from admin WS"}))
        response = await asyncio.wait_for(websocket.recv(), timeout=5)
        print(response)


if __name__ == "__main__":
    asyncio.run(main())
