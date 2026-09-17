"""Расход самого Claude Code — главного архитектора команды.

Claude не ходит через наш клиент, поэтому в журнале команды его нет. Зато Claude
Code пишет свои сессии в ~/.claude/projects/<проект>/<сессия>.jsonl, и у каждого
ответа модели там лежит usage. Читаем оттуда: без этого в дашборде видно работу
подчинённых и не видно работу того, кто их гоняет.

Разрез «по проектам» строится по рабочему каталогу записи, но не по его имени:
работа идёт из подпапок, и по именам один проект рассыпался на `backend`,
`frontend`, `src`, `ui` и десяток слайсов. Каталог сопоставляется с путями
клонов, привязанных к пространствам (`config.workspace_of`), а если ни одно не
подошло — берётся корень git-репозитория, и только в последнюю очередь имя папки.

Стоимость не считаем: работа Claude Code идёт по подписке, цена за токен там
не определена, а выдумывать её в отчёте о расходах нельзя.
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path

from . import config
from .config import PROJECTS

SESSIONS = Path(os.environ.get("CLAUDE_HOME", Path.home() / ".claude")) / "projects"

# Сетка для скользящих окон расхода. Пятиминутные корзины кладутся в кэш вместе
# с разбором файла, а окно («за последние 5 часов») суммируется уже при запросе:
# от «сейчас» оно зависит, и закэшировать его нельзя. Точность — 5 минут.
BUCKET = 300
WINDOWS = {"h5": 5 * 3600, "d7": 7 * 86400}

# Отпечаток привязок «пространство → каталог»: по нему видно, что разбор устарел.
_stamps: dict[str, str] = {"projects": ""}


def _projects_stamp() -> str:
    return "|".join(f"{pid}:{space.repo}:{space.title}" for pid, space in sorted(PROJECTS.items()))

# Разбор больших jsonl дорогой, поэтому держим результат до изменения файла.
_cache: dict[str, tuple[float, int, dict]] = {}
# Каталог → проект. Поиск корня git ходит по диску, а каталогов в сессии сотни.
_projects: dict[str, str] = {}


def _slot() -> dict:
    return {"calls": 0, "tokens_in": 0, "tokens_out": 0, "tokens_cached": 0,
            "tokens_reasoning": 0}


def _add(slot: dict, usage: dict) -> None:
    slot["calls"] += 1
    # cache_creation — это тоже вход, просто оплаченный по другой ставке.
    slot["tokens_in"] += (usage.get("input_tokens") or 0) + (usage.get("cache_creation_input_tokens") or 0)
    slot["tokens_cached"] += usage.get("cache_read_input_tokens") or 0
    slot["tokens_out"] += usage.get("output_tokens") or 0
    slot["tokens_reasoning"] += (usage.get("output_tokens_details") or {}).get("thinking_tokens") or 0


def _stamp(value: str) -> float:
    """Момент записи в секундах эпохи. Пустая или битая метка — ноль."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def _project(cwd: str) -> str:
    """Проект записи: пространство по пути клона, иначе корень git, иначе имя папки."""
    if not cwd:
        return "—"
    cached = _projects.get(cwd)
    if cached is not None:
        return cached

    space = config.workspace_of(cwd)
    if space:
        name = PROJECTS[space].title.split(" — ")[0]
    else:
        path = Path(cwd)
        root = next((parent for parent in (path, *path.parents) if (parent / ".git").exists()), None)
        name = (root or path).name or "—"
    _projects[cwd] = name
    return name


def _parse(path: Path) -> dict:
    """Разбор одного файла сессии: итог, разрезы по дням, моделям, каталогам и корзинам."""
    out = {"total": _slot(), "daily": {}, "models": {}, "projects": {}, "buckets": {}}
    with path.open(encoding="utf-8", errors="ignore") as f:
        for line in f:
            # Дешёвый отсев: строк без usage в файле большинство.
            if '"usage"' not in line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            message = rec.get("message") or {}
            usage = message.get("usage")
            if not usage or rec.get("type") != "assistant":
                continue
            stamp = rec.get("timestamp") or ""
            day = stamp[:10]
            seconds = _stamp(stamp)
            model = message.get("model") or "claude"
            if model.startswith("<"):
                continue  # служебные записи Claude Code, не вызовы модели
            project = _project(rec.get("cwd") or "")
            targets = [out["total"],
                       out["daily"].setdefault(day, _slot()),
                       out["models"].setdefault(model, _slot()),
                       out["projects"].setdefault(project, _slot())]
            if seconds:
                targets.append(out["buckets"].setdefault(int(seconds // BUCKET), _slot()))
            for slot in targets:
                _add(slot, usage)
    return out


def _merge(into: dict, extra: dict) -> None:
    for key, value in extra.items():
        if key == "total":
            for field, number in value.items():
                into["total"][field] += number
            continue
        for name, slot in value.items():
            target = into[key].setdefault(name, _slot())
            for field, number in slot.items():
                target[field] += number


def summary(days: int = 30) -> dict:
    """Сводка по работе Claude Code за последние `days` дней."""
    # Привязки пространств к каталогам могли поменяться в дашборде — перечитываем
    # состав и сбрасываем разбор, иначе расход остался бы разложенным по-старому.
    from . import team

    team.sync()
    if _projects_stamp() != _stamps["projects"]:
        _stamps["projects"] = _projects_stamp()
        _projects.clear()
        _cache.clear()

    result = {"total": _slot(), "daily": {}, "models": {}, "projects": {}, "buckets": {},
              "windows": {name: _slot() for name in WINDOWS}, "available": False}
    if not SESSIONS.exists():
        return result

    edge = time.time() - days * 86400
    for path in SESSIONS.glob("*/*.jsonl"):
        try:
            stat = path.stat()
        except OSError:
            continue
        if stat.st_mtime < edge:
            continue
        key = str(path)
        cached = _cache.get(key)
        if cached is None or cached[0] != stat.st_mtime or cached[1] != stat.st_size:
            _cache[key] = (stat.st_mtime, stat.st_size, _parse(path))
        _merge(result, _cache[key][2])
        result["available"] = True

    # Оставляем только окно запроса: файл сессии мог начаться раньше.
    first_day = time.strftime("%Y-%m-%d", time.localtime(edge))
    result["daily"] = {d: v for d, v in sorted(result["daily"].items()) if d >= first_day}

    now = time.time()
    for name, length in WINDOWS.items():
        border = (now - length) // BUCKET
        for key, slot in result["buckets"].items():
            if key >= border:
                for field, number in slot.items():
                    result["windows"][name][field] += number
    # Корзины наружу не отдаём: это внутренняя сетка, а не данные для показа.
    result.pop("buckets")
    return result
