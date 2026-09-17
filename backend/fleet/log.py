"""Журнал событий команды: одна строка jsonl на каждый вызов.

Дашборд читает этот же файл — отдельной базы нет намеренно, чтобы журнал
оставался читаемым глазами и grep-ом. Журнал — рантайм: он растёт без края,
лежит вне git и на новой машине начинается заново.

Цифры расхода при этом копятся в своде (`fleet.usage`), который коммитится
вместе с памятью команды. Свод пополняется прямо отсюда: вызов, учтённый в
журнале, но забытый в своде, разошёлся бы со статистикой навсегда.
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
    """Пишет событие в журнал и в свод расхода, возвращает его же."""
    from . import usage

    rec = {"ts": time.time(), "event": event, "pid": os.getpid(), **fields}
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(rec, ensure_ascii=False)
    with _lock:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    usage.record(rec)
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
