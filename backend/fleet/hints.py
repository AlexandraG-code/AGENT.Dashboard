"""Подсказки к системному промпту: готовые куски текста, которые человек
добавляет в промпт роли одним нажатием.

Тексты — данные пользователя (data/hints.json), в коде только структура записи:
ключ, заголовок для кнопки и сам текст. Приложение их не толкует и не
подставляет само: оно лишь помогает не набирать одно и то же руками.
"""

import json

from .config import DATA

FILE = DATA / "hints.json"

_cache: tuple[float, list[dict]] | None = None


def all_hints() -> list[dict]:
    """Все подсказки. Файл перечитывается при изменении."""
    global _cache
    if not FILE.exists():
        return []
    mtime = FILE.stat().st_mtime
    if _cache is None or _cache[0] != mtime:
        data = json.loads(FILE.read_text(encoding="utf-8"))
        items = [
            {"key": str(item.get("key", "")), "title": str(item.get("title", "")),
             "text": str(item.get("text", ""))}
            for item in data
            if isinstance(item, dict) and item.get("key") and item.get("text")
        ]
        _cache = (mtime, items)
    return _cache[1]


def save_all(items: list[dict]) -> None:
    """Записать подсказки целиком: их состав правит человек."""
    FILE.parent.mkdir(parents=True, exist_ok=True)
    clean = [
        {"key": str(item["key"]).strip(), "title": str(item.get("title", "")).strip(),
         "text": str(item["text"])}
        for item in items
        if str(item.get("key", "")).strip() and str(item.get("text", "")).strip()
    ]
    FILE.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
