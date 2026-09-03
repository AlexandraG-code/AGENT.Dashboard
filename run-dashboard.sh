#!/usr/bin/env bash
# Дашборд флота на http://localhost:8770
cd "$(dirname "$0")" || exit 1
exec ./.venv/bin/uvicorn dashboard.app:app --host 127.0.0.1 --port 8770 "$@"
