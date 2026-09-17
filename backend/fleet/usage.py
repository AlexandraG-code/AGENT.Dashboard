"""Свод расхода: сколько потрачено, когда и на что. Переезжает вместе с данными.

Журнал вызовов (`logs/events.jsonl`) — рантайм: он растёт без края, лежит вне
git и на новой машине начинается с нуля. Цифры расхода терять при этом нельзя:
они копятся месяцами и отвечают на вопрос, во что обошёлся проект.

Поэтому рядом с журналом ведётся свод — компактный json по дням:

- `projects/<проект>/stats.json` — расход этого пространства;
- `stats.json` в корне данных — итог по всем сразу.

Оба коммитятся вместе с остальной памятью, так что после `git clone` на новой
машине история расхода на месте. Общий файл нужен не для удобства: без него
«сколько всего потрачено» пришлось бы собирать обходом всех пространств, включая
те, чьи папки на этой машине не склонированы.

Свод пишут несколько процессов сразу — MCP-сервер каждой сессии Claude Code и
дашборд, — поэтому чтение-правка-запись идёт под файловой блокировкой, а сам
файл заменяется целиком (`os.replace`): оборванная запись оставила бы на диске
битый json вместо истории расхода.
"""

import json
import os
import time
from contextlib import contextmanager
from pathlib import Path

from . import layout
from .config import DATA, MODELS

FILE = "stats.json"
TOTAL = DATA / FILE

SLOT = ("calls", "errors", "cost", "tokens_in", "tokens_out", "tokens_cached",
        "tokens_reasoning", "seconds")
# Разрезы дня. `pairs` — пары «модель|роль»: без них не ответить, во что обошлась
# конкретная роль на конкретной модели, а пар в команде десятки, не тысячи.
# Разрез по пространствам есть только в общем файле: в файле пространства он был
# бы колонкой из одного значения.
CUTS = ("models", "roles", "pairs")
TOTAL_CUTS = CUTS + ("projects",)
# Разделитель в ключе пары. Ни в имени модели, ни в имени роли его быть не может:
# слаг роли — латиница с дефисом, имя модели приходит из реестра.
PAIR = " · "

# Блокировка ждёт недолго: запись занимает миллисекунды, а очередь из вызовов
# короткая. Чужой замок старше этого срока считается брошенным — процесс, его
# поставивший, уже убит, и ждать его вечно значит подвесить вызов модели.
WAIT = 5.0
STALE = 30.0


def _slot() -> dict:
    return {key: 0 for key in SLOT} | {"cost": 0.0, "seconds": 0.0}


def _add(slot: dict, rec: dict) -> None:
    if rec.get("event") == "error":
        slot["errors"] += 1
        return
    slot["calls"] += 1
    slot["cost"] = round(slot["cost"] + (rec.get("cost") or 0.0), 8)
    slot["seconds"] = round(slot["seconds"] + (rec.get("seconds") or 0.0), 1)
    for key in ("tokens_in", "tokens_out", "tokens_cached", "tokens_reasoning"):
        slot[key] += rec.get(key) or 0


@contextmanager
def _locked(path: Path):
    """Замок на файл свода, переносимый между ОС.

    Флаговый файл вместо fcntl намеренно: команда работает и на windows, а
    записей тут единицы в минуту — цена простого замка ничтожна.
    """
    lock = path.with_suffix(path.suffix + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + WAIT
    while True:
        try:
            fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            age = time.time() - lock.stat().st_mtime if lock.exists() else 0.0
            if age > STALE:
                lock.unlink(missing_ok=True)
                continue
            if time.time() > deadline:
                raise TimeoutError(f"Свод расхода занят другим процессом: {lock}")
            time.sleep(0.05)
    try:
        os.close(fd)
        yield
    finally:
        lock.unlink(missing_ok=True)


def _read(path: Path) -> dict:
    if not path.exists():
        return {"days": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data.get("days"), dict) else {"days": {}}


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                   encoding="utf-8")
    os.replace(tmp, path)


def _day(data: dict, day: str, cuts: tuple[str, ...]) -> dict:
    entry = data["days"].setdefault(day, _slot())
    for cut in cuts:
        entry.setdefault(cut, {})
    return entry


def _apply(data: dict, rec: dict, cuts: tuple[str, ...], names: dict[str, str]) -> None:
    day = time.strftime("%Y-%m-%d", time.localtime(rec.get("ts") or time.time()))
    entry = _day(data, day, cuts)
    _add(entry, rec)
    for cut in cuts:
        _add(entry[cut].setdefault(names[cut], _slot()), rec)


def model_id(rec: dict) -> str:
    """Имя модели для свода.

    Провайдер может ответить не тем именем, под которым модель заведена: Yandex
    отдаёт полный `gpt://<каталог>/...`, GLM молча подменяет модель на другую.
    В своде нужно то имя, которое человек видит в реестре, иначе расход
    размажется по строкам, которых он никогда не заводил.
    """
    answered = rec.get("model") or ""
    if answered in MODELS:
        return answered
    return rec.get("requested") or answered or "—"


def record(rec: dict) -> None:
    """Учесть событие журнала в своде. Всё, кроме вызовов и ошибок, пропускается."""
    if rec.get("event") not in ("call", "error"):
        return
    names = _names(rec)
    project = rec.get("project") or ""

    if project:
        path = layout.project_dir(project, create=True) / FILE
        with _locked(path):
            data = _read(path)
            _apply(data, rec, CUTS, names)
            _write(path, data)

    with _locked(TOTAL):
        data = _read(TOTAL)
        _apply(data, rec, TOTAL_CUTS, names)
        _write(TOTAL, data)


def _names(rec: dict) -> dict[str, str]:
    """Имена разрезов для одной записи журнала."""
    model = model_id(rec)
    role = rec.get("role") or "—"
    return {"models": model, "roles": role, "pairs": f"{model}{PAIR}{role}",
            "projects": rec.get("project") or "—"}


def read(project: str = "") -> dict:
    """Свод пространства или общий, если имя не назвали."""
    path = (layout.project_dir(project) / FILE) if project else TOTAL
    return _read(path)


def rebuild() -> dict:
    """Пересобрать своды из журнала вызовов. Возвращает, сколько событий учтено.

    Нужно после переезда на новую раскладку и как лекарство, если свод разошёлся
    с журналом: журнал — запись каждого вызова, свод — производная от неё.
    Пересборка идёт по тому журналу, что лежит на этой машине; дни, которых в нём
    уже нет, остаются в своде такими, какими их записали раньше.
    """
    from . import log

    events = [rec for rec in log.read(limit=10**9) if rec.get("event") in ("call", "error")]
    if not events:
        return {"events": 0, "days": 0}

    # Дни, за которые в журнале есть записи, пересчитываются с нуля: повторный
    # запуск обязан дать тот же результат, а не удвоить цифры.
    days = {time.strftime("%Y-%m-%d", time.localtime(rec.get("ts") or 0)) for rec in events}
    total = _read(TOTAL)
    for day in days:
        total["days"].pop(day, None)
    per_project: dict[str, dict] = {}

    for rec in events:
        project = rec.get("project") or ""
        names = _names(rec)
        _apply(total, rec, TOTAL_CUTS, names)
        if project:
            if project not in per_project:
                data = _read(layout.project_dir(project, create=True) / FILE)
                for day in days:
                    data["days"].pop(day, None)
                per_project[project] = data
            _apply(per_project[project], rec, CUTS, names)

    with _locked(TOTAL):
        _write(TOTAL, total)
    for project, data in per_project.items():
        path = layout.project_dir(project, create=True) / FILE
        with _locked(path):
            _write(path, data)
    return {"events": len(events), "days": len(days)}


def ensure_built() -> None:
    """Собрать свод по журналу, если его ещё нет.

    Свод появился позже журнала, и на машине, где команда работала раньше, вся
    история расхода лежит только в `events.jsonl`. Требовать от человека помнить
    про пересборку — тот же промах, что и с миграцией раскладки.
    """
    if not TOTAL.exists():
        rebuild()


def totals() -> dict:
    """Сводка для шапки: всего за всё время, сегодня и разрезы по всем дням."""
    data = read()
    today = time.strftime("%Y-%m-%d")
    acc = _slot() | {"calls_today": 0, "cost_today": 0.0,
                     "by_model": {}, "by_role": {}, "by_project": {}}
    for day, entry in data["days"].items():
        for key in SLOT:
            acc[key] = round(acc[key] + entry.get(key, 0), 8)
        if day == today:
            acc["calls_today"] = entry.get("calls", 0)
            acc["cost_today"] = round(entry.get("cost", 0.0), 8)
        for cut, bucket in (("models", "by_model"), ("roles", "by_role"),
                            ("projects", "by_project")):
            for name, slot in (entry.get(cut) or {}).items():
                into = acc[bucket].setdefault(name, {"calls": 0, "cost": 0.0})
                into["calls"] += slot.get("calls", 0)
                into["cost"] = round(into["cost"] + slot.get("cost", 0.0), 8)
    return acc
