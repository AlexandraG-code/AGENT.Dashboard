"""Статистика команды: сколько кто потратил — по проектам, моделям и ролям.

Считается из свода (`fleet.usage`), а не из журнала вызовов. Журнал — рантайм:
он лежит вне git и на новой машине начинается заново, а свод коммитится вместе
с памятью команды, поэтому история расхода переживает переезд.

Разрезы отдаются в обе стороны (в проекте — по моделям, у модели — по проектам):
вопрос «сколько сожрала эта модель везде» и вопрос «на что ушли деньги в этом
проекте» одинаково частые, а данных мало — дешевле отдать оба.
"""

from datetime import date, timedelta

from . import claudecode, layout, usage


def _slot() -> dict:
    return usage._slot()


def _merge(into: dict, slot: dict) -> dict:
    """Сложить срез в накопитель. Пустые ключи не выдумываем — берём то, что есть."""
    for key in usage.SLOT:
        value = slot.get(key, 0)
        into[key] = round(into.get(key, 0) + value, 8) if isinstance(value, float) \
            else into.get(key, 0) + value
    return into


def _sum_days(entries: list[dict], cut: str = "") -> dict:
    """Итог по списку дней целиком или по одному разрезу: имя → срез."""
    if not cut:
        total = _slot()
        for entry in entries:
            _merge(total, entry)
        return total
    out: dict[str, dict] = {}
    for entry in entries:
        for name, slot in (entry.get(cut) or {}).items():
            _merge(out.setdefault(name, _slot()), slot)
    return out


def _in_range(data: dict, since: str) -> list[dict]:
    return [entry for day, entry in data["days"].items() if day >= since]


def _pairs(entries: list[dict]) -> dict[tuple[str, str], dict]:
    """Пары «модель · роль» из свода — из них строятся перекрёстные разрезы."""
    out: dict[tuple[str, str], dict] = {}
    for name, slot in _sum_days(entries, "pairs").items():
        model, _, role = name.partition(usage.PAIR)
        _merge(out.setdefault((model, role or "—"), _slot()), slot)
    return out


def summary(days: int = 30, project_filter: str = "") -> dict:
    """Полный срез: итог, сегодняшний день, разрезы и график по дням.

    `project_filter` сужает всё разом: на обзоре это переключатель «все проекты /
    один проект», и цифры во всех блоках обязаны считаться от одной выборки.
    """
    today = date.today()
    start = today - timedelta(days=days - 1)
    since = start.isoformat()

    known = [project_filter] if project_filter else layout.known_projects()
    per_project = {name: usage.read(name) for name in known}
    # Общий свод знает и о вызовах без пространства: их некуда положить в папку
    # проекта, но потерять их значит занизить итог.
    overall = usage.read() if not project_filter else per_project[project_filter]

    entries = _in_range(overall, since)
    total = _sum_days(entries)
    day_of = {day: entry for day, entry in overall["days"].items()}
    pairs = _pairs(entries)

    projects: dict[str, dict] = {}
    for name, data in per_project.items():
        rows = _in_range(data, since)
        if not rows:
            continue
        projects[name] = {
            **_sum_days(rows),
            "by_model": _sum_days(rows, "models"),
            "by_role": _sum_days(rows, "roles"),
        }
    if not project_filter:
        # Вызовы без пространства показываем отдельной строкой без разрезов:
        # выдумывать им проект нельзя, а прятать — врать об итоге.
        loose = {name: slot for name, slot in _sum_days(entries, "projects").items()
                 if name not in projects}
        for name, slot in loose.items():
            projects[name] = {**slot, "by_model": {}, "by_role": {}}

    models: dict[str, dict] = {}
    for name, slot in _sum_days(entries, "models").items():
        models[name] = {
            **slot,
            "by_project": {p: view["by_model"][name]
                           for p, view in projects.items() if name in view["by_model"]},
            "by_role": {role: s for (model, role), s in pairs.items() if model == name},
        }

    roles: dict[str, dict] = {}
    for name, slot in _sum_days(entries, "roles").items():
        roles[name] = {
            **slot,
            "by_model": {model: s for (model, role), s in pairs.items() if role == name},
        }

    # Ось дней должна быть непрерывной: пропуск между датами читается как «данных
    # нет», а не как «в этот день ничего не тратили».
    axis = []
    cursor = start
    while cursor <= today:
        key = cursor.isoformat()
        axis.append({"date": key, **_sum_days([day_of[key]] if key in day_of else [])})
        cursor += timedelta(days=1)

    return {
        "total": total,
        "total_today": _sum_days([day_of[today.isoformat()]] if today.isoformat() in day_of else []),
        "projects": dict(sorted(projects.items(), key=lambda kv: -kv[1]["cost"])),
        "models": dict(sorted(models.items(), key=lambda kv: -kv[1]["cost"])),
        "roles": dict(sorted(roles.items(), key=lambda kv: -kv[1]["cost"])),
        "daily": axis,
        "claude": claudecode.summary(days),
    }
