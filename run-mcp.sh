#!/usr/bin/env bash
# MCP-сервер флота для Claude Code (stdio).
cd "$(dirname "$0")" || exit 1

# Ключи не хранятся в конфиге Claude — если их нет в окружении, берём из ~/.zshrc.
if [ -z "$GLM_API_KEY" ] || [ -z "$DEEPSEEK_API_KEY" ]; then
    if [ -f "$HOME/.zshrc" ]; then
        eval "$(grep -E '^[[:space:]]*export (GLM|DEEPSEEK)_API_KEY=' "$HOME/.zshrc")"
    fi
fi

exec ./.venv/bin/python -m fleet.server
