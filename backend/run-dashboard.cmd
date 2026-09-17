@echo off
rem Дашборд команды на http://localhost:8770
cd /d "%~dp0"
".venv\Scripts\uvicorn.exe" dashboard.app:app --host 127.0.0.1 --port 8770 %*
