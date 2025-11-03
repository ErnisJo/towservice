import asyncio
import json
import subprocess
import sys
from pathlib import Path

import websockets

BASE_DIR = Path(__file__).resolve().parent.parent
PYTHON = BASE_DIR / ".venv" / "Scripts" / ("python.exe" if sys.platform.startswith("win") else "python")
SERVER_SCRIPT = BASE_DIR / "run.py"
USER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzYyMDIwMDM0fQ.oiMTOSNJXopvAM0qCp_qmrEVSt2dZi93xyF1CVr5VPY"


async def run_roundtrip() -> None:
    server = subprocess.Popen(
        [str(PYTHON), str(SERVER_SCRIPT)],
        cwd=BASE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        # Give the server a moment to start
        await asyncio.sleep(3)
        user_uri = "ws://127.0.0.1:4001/ws/user"
        admin_uri = "ws://127.0.0.1:4001/ws/admin"
        async with websockets.connect(user_uri) as user_ws:
            await user_ws.send(json.dumps({"token": USER_TOKEN}))
            print("[user] connected")
            async with websockets.connect(admin_uri) as admin_ws:
                await admin_ws.send(json.dumps({"userId": 1, "text": "roundtrip"}))
                # Drain admin echo so connection closes cleanly
                admin_response = await asyncio.wait_for(admin_ws.recv(), timeout=5)
                print(f"[admin] received: {admin_response}")
            payload = await asyncio.wait_for(user_ws.recv(), timeout=5)
            print(f"[user] received: {payload}")
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
        if server.stdout:
            print("--- server log ---")
            for line in server.stdout:
                print(line.rstrip())


if __name__ == "__main__":
    asyncio.run(run_roundtrip())
