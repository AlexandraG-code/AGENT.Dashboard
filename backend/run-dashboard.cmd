@echo off
rem Дашборд команды на http://localhost:8770
cd /d "%~dp0"

rem Пара к run-dashboard.sh, и делают они одно и то же: зовут питон окружения и
rem просят его поднять uvicorn. Через python -m, а не через uvicorn.exe, чтобы
rem оба файла запускались одинаково и правка одного читалась в другом.
if not exist ".venv\Scripts\python.exe" (
    rem Кодировку консоли переключаем только здесь: файл в utf-8, а cmd.exe читает
    rem вывод в кодировке консоли, и без этого сообщение вышло бы крякозябрами.
    chcp 65001 >nul
    echo Нет окружения в %CD%\.venv - прогони install-windows.ps1 1>&2
    exit /b 1
)

".venv\Scripts\python.exe" -m uvicorn dashboard.app:app --host 127.0.0.1 --port 8770 %*
