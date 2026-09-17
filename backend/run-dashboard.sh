#!/usr/bin/env bash
# Дашборд команды на http://localhost:8770
cd "$(dirname "$0")" || exit 1

# Исполняемые файлы окружения лежат в bin на macOS и Linux и в Scripts на
# Windows. Этот скрипт зовут и там и там: на Windows — из Git Bash, которым
# Claude Code выполняет команды, — поэтому питон ищется, а не угадывается.
# Запуск идёт через него (`python -m uvicorn`), чтобы не знать ещё и про то,
# что сам uvicorn на Windows зовётся uvicorn.exe.
python='./.venv/bin/python'
[ -x "$python" ] || python='./.venv/Scripts/python.exe'
[ -x "$python" ] || {
    echo "Нет окружения в $PWD/.venv — поставь зависимости, см. backend/README.md" >&2
    exit 1
}

exec "$python" -m uvicorn dashboard.app:app --host 127.0.0.1 --port 8770 "$@"
