"""Раскладка каталога данных: единственное место, где зашиты имена файлов.

Данные команды живут в отдельном репозитории (`AGENT.Dashboard.DATA`), который
клонируется в `data/` или задаётся переменной `FLEET_DATA`. Смысл разделения —
переезд: на новой машине достаточно поставить инструмент и склонировать данные,
и команда, её промпты, контекст и летопись оказываются на месте.

Отсюда три правила раскладки:

- **Всё, что относится к проекту, лежит в его папке** `projects/<проект>/`.
  Папку можно скопировать, переименовать пространство, унести проект в другой
  клон данных — и он приедет целиком, вместе с составом команды и летописью.
- **Общее — только то, что принадлежит машине или аккаунту**, а не проекту:
  реестр провайдеров и моделей, служебные промпты приложения, ключи.
- **Пути к клонам репозиториев в git не уезжают.** На маке это
  `/Users/alex/...`, на windows `D:\\...`; хранить их в общем файле означает
  править его после каждого переезда. Они лежат в `paths.local.json`, который
  не коммитится (см. `fleet.paths`).

Рантайм — журнал вызовов, транскрипты и выхлопы агентов — общий и не делится
по проектам намеренно: сводка расходов считается по всем пространствам сразу,
а сами файлы не коммитятся и переезда не переживают.
"""

import re
from pathlib import Path

from . import paths
from .config import DATA

# Общее на весь клон данных.
REGISTRY = DATA / "registry.json"      # провайдеры и модели
PROMPTS = DATA / "prompts.json"        # служебные промпты приложения
HINTS = DATA / "hints.json"            # подсказки к системным промптам
SECRETS = DATA / "secrets.json"        # ключи провайдеров, вне git

# Рантайм: не коммитится, восстанавливается сам.
LOGS = DATA / "logs"
CALLS = DATA / "calls"
OUT = DATA / "out"

PROJECTS_DIR = DATA / "projects"

# Имена внутри папки проекта.
PROJECT_FILE = "project.json"   # название пространства, подпись кода, маски правил
TEAM_FILE = "team.json"         # роли, отделы, карточки регламентов, назначения
CHAT_FILE = "chat.jsonl"        # лента команды проекта
CONTEXT_DIR = "context"         # заметки и летопись
CHARTERS_DIR = "charters"       # тексты регламентов
AVATARS_DIR = "avatars"         # картинки ролей
UPLOADS_DIR = "uploads"         # исходники загруженных материалов
MEMORY_DIR = "memory"           # нативная память Claude Code (см. fleet.memory)


# Кириллица в латиницу: идентификатор уходит в имя каталога и в адрес запроса,
# а название человек пишет по-русски — без транслитерации слаг оказывался пустым.
TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e",
    "ю": "yu", "я": "ya",
}


def slug(value: str) -> str:
    """Имя как идентификатор: без сюрпризов в пути и в адресе запроса.

    Одна функция на всё приложение: идентификатор пространства становится
    именем каталога, а имена ролей и отделов — ключами в его файлах, и две
    независимые нормализации рано или поздно разъедутся.
    """
    lowered = value.strip().lower().translate({ord(k): v for k, v in TRANSLIT.items()})
    return re.sub(r"[^a-z0-9_-]+", "-", lowered).strip("-")


def project_dir(project: str, create: bool = False) -> Path:
    """Папка пространства. `create` — завести её, если проект новый.

    Обычно это `data/projects/<проект>`, но человек может выбрать в дашборде
    свою папку — тогда она записана в локальных путях этой машины и данные
    проекта лежат там (см. `fleet.paths`).
    """
    name = slug(project)
    if not name:
        raise ValueError("Пустой идентификатор пространства")
    chosen = paths.data_of(name)
    path = Path(chosen).expanduser() if chosen else PROJECTS_DIR / name
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path


def known_projects() -> list[str]:
    """Пространства, доступные на этой машине.

    Источник истины — каталоги, а не список: список отдельным файлом пришлось
    бы держать в согласии с диском, и про папку проекта, скопированную руками,
    он бы не узнал. К проектам из `data/projects` добавляются те, чьи данные
    человек увёл в свою папку.
    """
    found = set()
    if PROJECTS_DIR.is_dir():
        found.update(p.name for p in PROJECTS_DIR.iterdir()
                     if p.is_dir() and (p / PROJECT_FILE).exists())
    for project, local in paths.all_paths().items():
        if local.get("data") and (Path(local["data"]).expanduser() / PROJECT_FILE).exists():
            found.add(slug(project))
    return sorted(found)


def project_file(project: str, create: bool = False) -> Path:
    return project_dir(project, create) / PROJECT_FILE


def team_file(project: str, create: bool = False) -> Path:
    return project_dir(project, create) / TEAM_FILE


def chat_file(project: str) -> Path:
    """Лента команды. Без пространства — общий чат в корне данных."""
    if not project:
        return DATA / "chat.jsonl"
    return project_dir(project, create=True) / CHAT_FILE


def context_dir(project: str) -> Path:
    path = project_dir(project, create=True) / CONTEXT_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def charters_dir(project: str) -> Path:
    path = project_dir(project, create=True) / CHARTERS_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def avatars_dir(project: str) -> Path:
    path = project_dir(project, create=True) / AVATARS_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def uploads_dir(project: str) -> Path:
    path = project_dir(project, create=True) / UPLOADS_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def memory_dir(project: str) -> Path:
    """Каталог нативной памяти Claude Code. Создаётся при первой привязке."""
    return project_dir(project, create=True) / MEMORY_DIR
