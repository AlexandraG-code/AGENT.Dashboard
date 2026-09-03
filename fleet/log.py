"""Журнал событий флота: одна строка jsonl на каждый вызов.

Дашборд читает этот же файл — отдельной базы нет намеренно, чтобы журнал
оставался читаемым глазами и grep-ом.
"""

import json
import os
import threading
import time
from pathlib import Path
from typing import Any

from .config import LOG_FILE

_lock = threading.Lock()


def emit(event: str, **fields: Any) -> dict:
    """Пишет событие в журнал и возвращает его же."""
    rec = {"ts": time.time(), "event": event, "pid": os.getpid(), **fields}
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(rec, ensure_ascii=False)
    with _lock:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    return rec


def read(limit: int = 200, since: float = 0.0, path: Path | None = None) -> list[dict]:
    """Последние события журнала, новые в конце."""
    f = path or LOG_FILE
    if not f.exists():
        return []
    out: list[dict] = []
    # Файл растёт медленно (одна строка на вызов), читаем целиком и режем хвост.
    for raw in f.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not raw.strip():
            continue
        try:
            rec = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if rec.get("ts", 0) >= since:
            out.append(rec)
    return out[-limit:]


def totals(path: Path | None = None) -> dict:
    """Сводка по расходам и вызовам: всего, за сутки, по моделям, по проектам."""
    day_ago = time.time() - 86400
    acc = {
        "calls": 0, "cost": 0.0, "tokens_in": 0, "tokens_out": 0,
        "calls_24h": 0, "cost_24h": 0.0, "errors": 0,
        "by_model": {}, "by_role": {}, "by_project": {},
    }
    for rec in read(limit=10**9, path=path):
        if rec.get("event") == "error":
            acc["errors"] += 1
        if rec.get("event") != "call":
            continue
        cost = rec.get("cost", 0.0) or 0.0
        acc["calls"] += 1
        acc["cost"] += cost
        acc["tokens_in"] += rec.get("tokens_in", 0) or 0
        acc["tokens_out"] += rec.get("tokens_out", 0) or 0
        if rec.get("ts", 0) >= day_ago:
            acc["calls_24h"] += 1
            acc["cost_24h"] += cost
        for key, bucket in (("model", "by_model"), ("role", "by_role"), ("project", "by_project")):
            name = rec.get(key) or "—"
            slot = acc[bucket].setdefault(name, {"calls": 0, "cost": 0.0})
            slot["calls"] += 1
            slot["cost"] += cost
    return acc
