"""Загрузка промптов ролей из roles/*.md с горячей перезагрузкой.

Промпт роли лежит отдельным markdown-файлом, потому что его правят руками
через дашборд. Файл перечитывается при изменении mtime — перезапускать
MCP-сервер после правки промпта не нужно.
"""

import copy
from pathlib import Path

from . import team
from .config import ROLES, ROLES_DIR, Role

_cache: dict[str, tuple[float, str]] = {}


def prompt_path(role: str) -> Path:
    return ROLES_DIR / f"{role}.md"


def load_prompt(role: str) -> str:
    """Текст системного промпта роли; пустая строка, если файла нет."""
    path = prompt_path(role)
    if not path.exists():
        return ""
    mtime = path.stat().st_mtime
    cached = _cache.get(role)
    if cached is None or cached[0] != mtime:
        _cache[role] = (mtime, path.read_text(encoding="utf-8"))
    return _cache[role][1]


def get(role: str) -> Role:
    """Роль с подставленным свежим промптом."""
    team.sync()
    if role not in ROLES:
        raise KeyError(f"Нет роли {role!r}. Доступны: {', '.join(ROLES)}")
    r = copy.copy(ROLES[role])
    r.prompt = load_prompt(role)
    return r


def save_prompt(role: str, text: str) -> None:
    """Сохраняет промпт роли (используется дашбордом)."""
    team.sync()
    if role not in ROLES:
        raise KeyError(f"Нет роли {role!r}")
    ROLES_DIR.mkdir(parents=True, exist_ok=True)
    prompt_path(role).write_text(text, encoding="utf-8")


def all_roles() -> list[dict]:
    """Описание всех ролей для дашборда."""
    team.sync()
    out = []
    for name, r in ROLES.items():
        out.append({
            "name": name,
            "model": r.model,
            "fallback": r.fallback,
            "thinking": r.thinking,
            "max_tokens": r.max_tokens,
            "temperature": r.temperature,
            "description": r.description,
            "prompt": load_prompt(name),
        })
    return out
