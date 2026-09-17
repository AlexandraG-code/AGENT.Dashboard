"""Перенос данных в раскладку «папка на проект». Выполняется один раз сам.

Раньше данные лежали плоско: общий `team.json` на всю команду, `context/<проект>`
рядом с `charters/`, `chat/` и `uploads/`. Теперь всё, что относится к проекту,
лежит в его папке (см. `fleet.layout`), а общими остались только реестр моделей
и ключи.

Перенос идёт при запуске — и дашборда, и MCP-сервера, — потому что клон данных
приезжает на новую машину как есть, и требовать от человека помнить про
скрипт миграции значит однажды получить пустую команду вместо своей.

Ничего не удаляется: старые файлы переименовываются в `*.migrated`, каталоги
переезжают целиком. Если перенос окажется неверным, исходное состояние на диске.
"""

import json
import shutil
from pathlib import Path

from . import layout, paths
from .config import DATA

OLD_TEAM = DATA / "team.json"
OLD_CONTEXT = DATA / "context"
OLD_CHARTERS = DATA / "charters"
OLD_CHAT = DATA / "chat"
OLD_UPLOADS = DATA / "uploads"
OLD_AVATARS = DATA / "avatars"


def needed() -> bool:
    """Нужен ли перенос: старый общий состав ещё лежит на месте."""
    return OLD_TEAM.exists()


def run() -> list[str]:
    """Перенести данные в новую раскладку. Возвращает список сделанного."""
    if not needed():
        return []
    done: list[str] = []
    data = json.loads(OLD_TEAM.read_text(encoding="utf-8"))

    # Реестр провайдеров и моделей — общий на клон данных.
    registry = {"providers": data.get("providers") or {}, "models": data.get("models") or {}}
    if not layout.REGISTRY.exists():
        layout.REGISTRY.parent.mkdir(parents=True, exist_ok=True)
        layout.REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n",
                                   encoding="utf-8")
        done.append(f"реестр: {len(registry['providers'])} провайдеров, "
                    f"{len(registry['models'])} моделей")

    # Состав команды был один на всех — значит в каждом пространстве он такой
    # же, каким был вчера. Дальше команды расходятся, но переезд ничего не
    # меняет: человек должен увидеть ровно то, что у него было.
    shared = {
        "assignments": data.get("assignments") or {},
        "teams": {name: {k: v for k, v in cfg.items() if k in ("title", "description")}
                  for name, cfg in (data.get("teams") or {}).items()},
        # Область «вся организация» исчезла вместе с общей командой: регламент
        # принадлежит пространству, в котором лежит.
        "documents": {doc_id: {**{k: v for k, v in cfg.items()
                                  if k in ("title", "scope", "team", "order")},
                               "scope": "space" if cfg.get("scope", "org") == "org"
                                        else cfg.get("scope")}
                      for doc_id, cfg in (data.get("documents") or {}).items()},
        "roles": data.get("roles") or {},
    }

    projects = data.get("projects") or {}
    for pid, cfg in projects.items():
        name = layout.slug(pid)
        folder = layout.project_dir(name, create=True)
        if isinstance(cfg, str):
            cfg = {"title": cfg}

        file = layout.project_file(name, create=True)
        if not file.exists():
            file.write_text(json.dumps({
                "title": cfg.get("title", name),
                "sign_code": bool(cfg.get("sign_code", True)),
                "rule_globs": list(cfg.get("rule_globs") or []),
            }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        # Путь к клону — свойство машины, поэтому уезжает из данных в локальный
        # файл. Каталога может уже не быть (данные приехали с другой машины) —
        # тогда путь просто не переносится, человек укажет свой в дашборде.
        repo = str(cfg.get("repo") or "")
        if repo and Path(repo).expanduser().is_dir() and not paths.repo_of(name):
            paths.set_path(name, repo=repo)

        team_file = layout.team_file(name, create=True)
        if not team_file.exists():
            team_file.write_text(json.dumps(shared, ensure_ascii=False, indent=2) + "\n",
                                 encoding="utf-8")

        _move_dir(OLD_CONTEXT / pid, folder / layout.CONTEXT_DIR, done, f"{name}: контекст")
        _move_dir(OLD_UPLOADS / pid, folder / layout.UPLOADS_DIR, done, f"{name}: материалы")
        _move_file(OLD_CHAT / f"{pid}.jsonl", folder / layout.CHAT_FILE, done, f"{name}: чат")
        # Регламенты и аватары были общими: они относятся к ролям, а роли
        # теперь у каждого пространства свои — значит копия в каждое.
        _copy_dir(OLD_CHARTERS, folder / layout.CHARTERS_DIR, done, f"{name}: регламенты")
        _copy_dir(OLD_AVATARS, folder / layout.AVATARS_DIR, done, f"{name}: аватары")
        done.append(f"пространство {name}: {folder}")

    _move_file(OLD_CHAT / "_общий.jsonl", DATA / "chat.jsonl", done, "общий чат")
    OLD_TEAM.rename(OLD_TEAM.with_suffix(".json.migrated"))
    done.append("прежний team.json сохранён как team.json.migrated")
    return done


def _move_dir(src: Path, dst: Path, done: list[str], label: str) -> None:
    if not src.is_dir() or dst.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    done.append(label)


def _copy_dir(src: Path, dst: Path, done: list[str], label: str) -> None:
    if not src.is_dir() or not any(src.iterdir()) or dst.exists():
        return
    shutil.copytree(str(src), str(dst))
    done.append(label)


def _move_file(src: Path, dst: Path, done: list[str], label: str) -> None:
    if not src.is_file() or dst.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    done.append(label)
