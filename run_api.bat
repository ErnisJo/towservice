@echo on
setlocal
cd /d %~dp0

IF NOT EXIST ".venv\Scripts\activate.bat" (
  py -m venv .venv
)

call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

python -m uvicorn main:app --reload --host 0.0.0.0 --port 4001
endlocal