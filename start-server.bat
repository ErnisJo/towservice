@echo off
setlocal
set ROOT=%~dp0

rem === API (FastAPI, порт 4001) ===
start "API 4001" cmd /k "cd /d %ROOT%server_python && ^
if not exist .venv\Scripts\activate.bat (py -m venv .venv) && ^
call .venv\Scripts\activate && ^
python -m pip install --upgrade pip && ^
pip install -r requirements.txt && ^
python -m uvicorn main:app --reload --host 0.0.0.0 --port 4001"

rem === Admin (Vite) ===
start "Admin Vite" cmd /k "cd /d %ROOT%admin && npm run dev"

rem === Expo (мобильное приложение) ===
start "Expo" cmd /k "cd /d %ROOT% && npx expo start --lan"

endlocal