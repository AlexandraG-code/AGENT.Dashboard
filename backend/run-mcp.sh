#!/usr/bin/env bash
# MCP-сервер команды для Claude Code (stdio).

# Каталог, из которого Claude Code запустил сервер, — это каталог рабочего проекта.
# Запоминаем его ДО перехода в свою папку: по нему команда понимает, в каком
# пространстве идёт работа, и не пишет заметки в чужой проект.
export FLEET_CWD="${FLEET_CWD:-$PWD}"

cd "$(dirname "$0")" || exit 1

# Ключи не хранятся в конфиге Claude — если их нет в окружении, берём из ~/.zshrc.
if [ -z "$GLM_API_KEY" ] || [ -z "$DEEPSEEK_API_KEY" ]; then
    if [ -f "$HOME/.zshrc" ]; then
        eval "$(grep -E '^[[:space:]]*export (GLM|DEEPSEEK)_API_KEY=' "$HOME/.zshrc")"
    fi
fi

# bin на macOS и Linux, Scripts на Windows: скрипт живёт в обеих системах, и на
# Windows его зовут из Git Bash. Пара к нему — run-mcp.cmd.
python='./.venv/bin/python'
[ -x "$python" ] || python='./.venv/Scripts/python.exe'
[ -x "$python" ] || {
    echo "Нет окружения в $PWD/.venv — поставь зависимости, см. backend/README.md" >&2
    exit 1
}

exec "$python" -m fleet.server
