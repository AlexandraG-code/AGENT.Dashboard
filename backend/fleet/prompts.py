"""Служебные промпты приложения: тексты в данных, в коде только ключи.

Промпт — настройка пользователя, а не часть приложения: в коде остаётся лишь
список ключей и то, какие подстановки в каждом из них допустимы. Сами тексты
лежат в data/prompts.json и правятся из дашборда. Если текст не задан,
операция честно об этом говорит, а не работает по спрятанному в коде шаблону.
"""

import json

from .config import DATA

FILE = DATA / "prompts.json"

# Ключ → какие подстановки в нём можно использовать. Это структура, а не текст:
# формулировки принадлежат человеку.
PLACEHOLDERS: dict[str, tuple[str, ...]] = {
    "condense_page": ("question", "url", "text"),
    "condense_material": ("question", "name", "text"),
    "condense_rules": ("sources", "text"),
    "vision_look": ("question",),
    "journal_entry": ("project", "document", "today", "facts"),
    "journal_context": ("project", "history", "tasks"),
    "plan_split": ("goal", "roles", "limit", "council"),
    "chat_answer": ("context", "question"),
}

_cache: tuple[float, dict[str, str]] | None = None


def all_prompts() -> dict[str, str]:
    """Все служебные промпты. Файл перечитывается при изменении."""
    global _cache
    if not FILE.exists():
        return {}
    mtime = FILE.stat().st_mtime
    if _cache is None or _cache[0] != mtime:
        data = json.loads(FILE.read_text(encoding="utf-8"))
        _cache = (mtime, {k: str(v) for k, v in data.items() if isinstance(v, str)})
    return _cache[1]


def save_all(values: dict[str, str]) -> None:
    """Записать промпты целиком (дашборд правит их формой)."""
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(values, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render(key: str, **values: str) -> str:
    """Подставить значения в промпт по ключу.

    Отсутствующий или пустой промпт — не повод молча продолжить: человек
    должен узнать, что именно нужно заполнить, иначе поведение системы
    определяется невидимым умолчанием.
    """
    text = all_prompts().get(key, "").strip()
    if not text:
        raise KeyError(
            f"Не задан промпт {key!r}. Заполните его в дашборде "
            f"(доступные подстановки: {', '.join(PLACEHOLDERS.get(key, ()))})."
        )
    for name, value in values.items():
        text = text.replace("{" + name + "}", value)
    return text
