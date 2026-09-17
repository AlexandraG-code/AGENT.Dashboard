"""Пути этой машины: где клон репозитория проекта и где лежат его данные.

Всё остальное в `data/` переезжает между устройствами одним `git clone`, а пути
переехать не могут: сегодня это `/Users/alex/WebstormProjects/...`, завтра
`D:\\projects\\...`. Держать их в общем файле — значит править его после каждого
переезда и ловить конфликты при синхронизации. Поэтому они лежат отдельно, в
`paths.local.json`, и этот файл не коммитится.

На проект хранятся два пути, и они про разное:

- `repo` — клон репозитория, над которым идёт работа. По нему пространство
  опознаётся по рабочему каталогу (`config.workspace_of`), туда пишут файлы
  агенты и оттуда читаются правила проекта.
- `data` — папка с данными проекта, если человек выбрал её сам. Пусто означает
  «по умолчанию», то есть `data/projects/<проект>`. Поле нужно затем, что
  контекст рабочего проекта может жить не в общем клоне данных, а рядом с самим
  проектом или на другом диске — выбор человека, а не приложения.

Файл заполняется из дашборда (выбор папки в модалке), а не руками.
"""

import json
from pathlib import Path

from .config import DATA

FILE = DATA / "paths.local.json"

_cache: tuple[float, dict[str, dict[str, str]]] | None = None


def all_paths() -> dict[str, dict[str, str]]:
    """Все локальные пути: проект → {"repo": ..., "data": ...}.

    Файл перечитывается по mtime: его правит и дашборд, и человек в редакторе.
    """
    global _cache
    if not FILE.exists():
        return {}
    mtime = FILE.stat().st_mtime
    if _cache is None or _cache[0] != mtime:
        raw = json.loads(FILE.read_text(encoding="utf-8"))
        clean: dict[str, dict[str, str]] = {}
        for project, value in raw.items():
            # Первый формат файла — просто строка с путём к репозиторию.
            if isinstance(value, str):
                clean[project] = {"repo": value, "data": ""}
            elif isinstance(value, dict):
                clean[project] = {"repo": str(value.get("repo", "")),
                                  "data": str(value.get("data", ""))}
        _cache = (mtime, clean)
    return _cache[1]


def _save(values: dict[str, dict[str, str]]) -> None:
    global _cache
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(values, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _cache = (FILE.stat().st_mtime, values)


def repo_of(project: str) -> str:
    return all_paths().get(project, {}).get("repo", "")


def data_of(project: str) -> str:
    return all_paths().get(project, {}).get("data", "")


def set_path(project: str, *, repo: str | None = None, data: str | None = None) -> None:
    """Записать путь этой машины. None означает «не трогать прежний».

    Путь проверяется на существование: молча принять опечатку хуже, чем
    отказать — иначе проект просто окажется пустым, и понять почему будет негде.
    """
    values = {p: dict(v) for p, v in all_paths().items()}
    current = values.setdefault(project, {"repo": "", "data": ""})
    for key, value in (("repo", repo), ("data", data)):
        if value is None:
            continue
        cleaned = value.strip()
        if cleaned:
            path = Path(cleaned).expanduser()
            if not path.is_dir():
                raise ValueError(f"Каталога {cleaned!r} нет — выберите существующую папку")
            cleaned = str(path)
        current[key] = cleaned
    if not current["repo"] and not current["data"]:
        values.pop(project, None)
    _save(values)


def forget(project: str) -> None:
    """Убрать пути удалённого пространства, чтобы файл не зарастал."""
    values = {p: dict(v) for p, v in all_paths().items() if p != project}
    _save(values)
