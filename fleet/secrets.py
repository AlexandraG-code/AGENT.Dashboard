"""Ключи провайдеров.

Лежат в data/secrets.json и НЕ версионируются: data-репозиторий приватный, но
ключи в git не место всё равно. Наружу ключ не отдаётся никогда — дашборд
получает только признак «задан».
"""

import json
import os
from pathlib import Path

from .config import DATA

FILE = DATA / "secrets.json"


def _read() -> dict[str, str]:
    if not FILE.exists():
        return {}
    try:
        data = json.loads(FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return {k: str(v) for k, v in data.items() if isinstance(v, str)}


def get(provider: str) -> str:
    return _read().get(provider, "")


def has(provider: str, key_env: str = "") -> bool:
    """Есть ли чем авторизоваться: ключ из дашборда или из окружения."""
    return bool(get(provider) or (key_env and os.environ.get(key_env)))


def put(provider: str, key: str) -> None:
    """Сохранить ключ. Пустая строка удаляет его."""
    data = _read()
    if key:
        data[provider] = key
    else:
        data.pop(provider, None)
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Ключи читает только владелец: файл лежит рядом с контекстом проектов.
    FILE.chmod(0o600)
