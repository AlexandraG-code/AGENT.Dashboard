"""Статистика флота: сколько кто потратил — по проектам, моделям и ролям.

Считается из того же журнала `data/logs/events.jsonl`, отдельной базы нет.
Журнал растёт на одну строку в вызов, поэтому полный пересчёт дешевле любого
индекса и всегда согласован с тем, что видно глазами в файле.
"""

import time
from collections import defaultdict
from datetime import date, timedelta

from . import claudecode, log


def _slot() -> dict:
    return {"calls": 0, "cost": 0.0, "tokens_in": 0, "tokens_out": 0,
            "tokens_cached": 0, "tokens_reasoning": 0, "seconds": 0.0, "errors": 0}


def _add(slot: dict, rec: dict) -> None:
    slot["calls"] += 1
    slot["cost"] += rec.get("cost", 0.0) or 0.0
    slot["tokens_in"] += rec.get("tokens_in", 0) or 0
    slot["tokens_out"] += rec.get("tokens_out", 0) or 0
    slot["tokens_cached"] += rec.get("tokens_cached", 0) or 0
    slot["tokens_reasoning"] += rec.get("tokens_reasoning", 0) or 0
    slot["seconds"] += rec.get("seconds", 0.0) or 0.0


def _round(slot: dict) -> dict:
    slot["cost"] = round(slot["cost"], 6)
    slot["seconds"] = round(slot["seconds"], 1)
    return slot


def summary(days: int = 30, project_filter: str = "") -> dict:
    """Полный срез: итог, разрезы проект × модель × роль и график по дням.

    `project_filter` сужает всё разом: на обзоре это переключатель «все проекты /
    один проект», и цифры во всех блоках обязаны считаться от одной выборки.

    Разрезы считаются в обе стороны (в проекте — по моделям, у модели — по
    проектам): вопрос «сколько сожрала эта модель везде» и вопрос «на что ушли
    деньги в этом проекте» одинаково частые, а данных мало — дешевле отдать оба.
    """
    day_ago = time.time() - 86400
    total = _slot()
    projects: dict[str, dict] = defaultdict(lambda: {**_slot(), "by_model": {}, "by_role": {}})
    models: dict[str, dict] = defaultdict(lambda: {**_slot(), "by_project": {}, "by_role": {}})
    roles: dict[str, dict] = defaultdict(lambda: {**_slot(), "by_model": {}})
    daily: dict[str, dict] = defaultdict(_slot)
    total_24h = _slot()

    for rec in log.read(limit=10**9):
        event = rec.get("event")
        project = rec.get("project") or "—"
        model = rec.get("model") or "—"
        role = rec.get("role") or "—"

        if event == "error":
            if project_filter and project != project_filter:
                continue
            total["errors"] += 1
            projects[project]["errors"] += 1
            models[model]["errors"] += 1
            roles[role]["errors"] += 1
            continue
        if event != "call":
            continue
        if project_filter and project != project_filter:
            continue

        _add(total, rec)
        if rec.get("ts", 0) >= day_ago:
            _add(total_24h, rec)
        _add(projects[project], rec)
        _add(models[model], rec)
        _add(roles[role], rec)
        _add(projects[project]["by_model"].setdefault(model, _slot()), rec)
        _add(projects[project]["by_role"].setdefault(role, _slot()), rec)
        _add(models[model]["by_project"].setdefault(project, _slot()), rec)
        _add(models[model]["by_role"].setdefault(role, _slot()), rec)
        _add(roles[role]["by_model"].setdefault(model, _slot()), rec)
        _add(daily[time.strftime("%Y-%m-%d", time.localtime(rec["ts"]))], rec)

    for bucket in (projects, models, roles):
        for slot in bucket.values():
            _round(slot)
            for nested in ("by_model", "by_project", "by_role"):
                for inner in slot.get(nested, {}).values():
                    _round(inner)

    # Ось дней должна быть непрерывной: пропуск между датами читается как «данных
    # нет», а не как «в этот день ничего не тратили».
    today = date.today()
    start = today - timedelta(days=days - 1)
    days_sorted = []
    cursor = start
    while cursor <= today:
        days_sorted.append(cursor.isoformat())
        cursor += timedelta(days=1)

    return {
        "total": _round(total),
        "total_24h": _round(total_24h),
        "projects": {k: v for k, v in sorted(projects.items(), key=lambda kv: -kv[1]["cost"])},
        "models": {k: v for k, v in sorted(models.items(), key=lambda kv: -kv[1]["cost"])},
        "roles": {k: v for k, v in sorted(roles.items(), key=lambda kv: -kv[1]["cost"])},
        "daily": [{"date": d, **_round(daily.get(d, _slot()))} for d in days_sorted],
        "claude": claudecode.summary(days),
    }
