"""Состав команды и список рабочих пространств, редактируемые из дашборда.

В коде (`config.py`) лежат только значения по умолчанию — то, с чем флот
поднимается на чистой машине. Всё, что человек правит руками, живёт в
`data/team.json` и перечитывается по mtime: добавил проект или агента в
дашборде — MCP-сервер это увидит сам, перезапускать его не нужно.

Промпты агентов тут не хранятся: они лежат отдельными файлами `roles/*.md`
(см. `roles.py`), потому что это тексты на страницу, а не конфигурация.
"""

import json
import re
from dataclasses import replace

from .config import DATA, MODELS, PROJECTS, ROLES, Role

FILE = DATA / "team.json"
FIELDS = ("model", "thinking", "max_tokens", "temperature", "fallback", "description")

_mtime = -1.0


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "-", value.strip().lower()).strip("-")


def _dump() -> dict:
    return {
        "projects": dict(PROJECTS),
        "roles": {
            name: {f: getattr(role, f) for f in FIELDS} for name, role in ROLES.items()
        },
    }


def save() -> None:
    """Записать текущий состав команды в data/team.json."""
    global _mtime
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(_dump(), ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    _mtime = FILE.stat().st_mtime


def sync() -> None:
    """Подтянуть состав из файла, если он менялся. Дёргается перед любым чтением ролей."""
    global _mtime
    if not FILE.exists():
        save()  # первый запуск: фиксируем умолчания из кода, дальше правит человек
        return
    mtime = FILE.stat().st_mtime
    if mtime == _mtime:
        return
    data = json.loads(FILE.read_text(encoding="utf-8"))
    _mtime = mtime

    projects = data.get("projects") or {}
    if projects:
        PROJECTS.clear()
        PROJECTS.update(projects)

    roles = data.get("roles") or {}
    if roles:
        ROLES.clear()
        for name, cfg in roles.items():
            ROLES[name] = Role(name=name, **{f: cfg[f] for f in FIELDS if f in cfg})


def _clean(fields: dict) -> dict:
    """Привести присланное из формы к типам Role и проверить модели."""
    out: dict = {}
    if "model" in fields:
        out["model"] = str(fields["model"])
    if "description" in fields:
        out["description"] = str(fields["description"]).strip()
    if "thinking" in fields:
        out["thinking"] = bool(fields["thinking"])
    if "max_tokens" in fields:
        out["max_tokens"] = max(256, min(32000, int(fields["max_tokens"])))
    if "temperature" in fields:
        out["temperature"] = max(0.0, min(2.0, float(fields["temperature"])))
    if "fallback" in fields:
        fb = (fields["fallback"] or "").strip()
        out["fallback"] = fb or None

    for key in ("model", "fallback"):
        value = out.get(key)
        if value and value not in MODELS:
            raise ValueError(f"Нет модели {value!r}. Известны: {', '.join(MODELS)}")
    return out


def set_role(name: str, **fields) -> Role:
    """Создать или изменить агента. Возвращает готовую роль."""
    sync()
    slug = _slug(name)
    if not slug:
        raise ValueError("Пустое имя агента")
    base = ROLES.get(slug) or Role(name=slug, model="glm-5.3-flash")
    ROLES[slug] = replace(base, name=slug, **_clean(fields))
    save()
    return ROLES[slug]


def delete_role(name: str) -> None:
    """Убрать агента из состава. Его промпт остаётся в roles/ — вернуть роль можно без потерь."""
    sync()
    if name not in ROLES:
        raise KeyError(f"Нет агента {name!r}")
    if len(ROLES) <= 1:
        raise ValueError("Нельзя удалить последнего агента")
    del ROLES[name]
    save()


def set_project(project_id: str, title: str) -> str:
    """Создать или переименовать рабочее пространство."""
    sync()
    slug = _slug(project_id)
    if not slug:
        raise ValueError("Пустой идентификатор пространства")
    PROJECTS[slug] = title.strip() or slug
    save()
    return slug


def delete_project(project_id: str) -> None:
    """Убрать пространство из списка. Заметки в data/context остаются на диске."""
    sync()
    if project_id not in PROJECTS:
        raise KeyError(f"Нет пространства {project_id!r}")
    del PROJECTS[project_id]
    save()
