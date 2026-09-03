"""Полные входы и выходы вызовов — то, что не влезает в журнал.

В `events.jsonl` живёт строка на вызов (кто, сколько, почём), а сюда кладётся
сам разговор: системный промпт, собранный контекст, задача, ответ и размышления.
Разделение намеренное: журнал остаётся читаемым глазами и быстрым для сводок,
а тяжёлые тексты лежат отдельными файлами и грузятся только когда их открывают.

Картинки в промпте заменяются на пометку: base64 скриншота весит мегабайты
и в разборе вызова бесполезен.
"""

import json
import re
import time
from pathlib import Path

from .config import DATA

CALLS = DATA / "calls"
KEEP_DAYS = 60
_DATA_URL = re.compile(r"^data:([^;]+);base64,(.*)$", re.S)


def _clean(content):
    """Убирает base64 из мультимодальных сообщений, оставляя пометку о картинке."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "image_url":
                url = (part.get("image_url") or {}).get("url", "")
                m = _DATA_URL.match(url)
                size = len(m.group(2)) * 3 // 4 if m else len(url)
                out.append({"type": "image", "note": f"[{m.group(1) if m else 'изображение'}, "
                                                     f"{size // 1024} КБ]"})
            else:
                out.append(part)
        return out
    return content


def _prune() -> None:
    """Чистит папки старше KEEP_DAYS — иначе разговоры растут без края."""
    edge = time.strftime("%Y-%m-%d", time.localtime(time.time() - KEEP_DAYS * 86400))
    for day in CALLS.glob("20*-*-*"):
        if day.is_dir() and day.name < edge:
            for f in day.iterdir():
                f.unlink()
            day.rmdir()


def save(ans, messages: list[dict], *, project: str = "", requested: str = "",
         task: str = "") -> str:
    """Сохранить разговор целиком. Возвращает идентификатор вызова."""
    ts = time.time()
    day = CALLS / time.strftime("%Y-%m-%d", time.localtime(ts))
    fresh = not day.exists()
    day.mkdir(parents=True, exist_ok=True)
    if fresh:
        _prune()

    call_id = f"{int(ts * 1000)}-{ans.role or 'call'}"
    (day / f"{call_id}.json").write_text(json.dumps({
        "id": call_id,
        "ts": ts,
        "role": ans.role,
        "model": ans.model,
        "requested": requested,
        "project": project,
        "task": task,
        "messages": [{"role": m.get("role"), "content": _clean(m.get("content"))}
                     for m in messages],
        "text": ans.text,
        "reasoning": ans.reasoning,
        "tokens_in": ans.tokens_in,
        "tokens_out": ans.tokens_out,
        "tokens_cached": ans.tokens_cached,
        "tokens_reasoning": ans.tokens_reasoning,
        "cost": ans.cost,
        "seconds": ans.seconds,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    return call_id


def path(call_id: str) -> Path | None:
    """Файл разговора по идентификатору (день вычисляется из метки времени)."""
    if not re.fullmatch(r"\d{10,16}-[\w-]{1,40}", call_id or ""):
        return None
    day = time.strftime("%Y-%m-%d", time.localtime(int(call_id.split("-")[0]) / 1000))
    p = CALLS / day / f"{call_id}.json"
    return p if p.exists() else None


def read(call_id: str) -> dict | None:
    p = path(call_id)
    return json.loads(p.read_text(encoding="utf-8")) if p else None
