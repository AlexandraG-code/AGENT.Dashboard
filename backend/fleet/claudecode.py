"""Расход самого Claude Code — главного архитектора флота.

Claude не ходит через наш клиент, поэтому в журнале флота его нет. Зато Claude
Code пишет свои сессии в ~/.claude/projects/<проект>/<сессия>.jsonl, и у каждого
ответа модели там лежит usage. Читаем оттуда: без этого в дашборде видно работу
подчинённых и не видно работу того, кто их гоняет.

Стоимость не считаем: работа Claude Code идёт по подписке, цена за токен там
не определена, а выдумывать её в отчёте о расходах нельзя.
"""

import json
import os
import time
from pathlib import Path

SESSIONS = Path(os.environ.get("CLAUDE_HOME", Path.home() / ".claude")) / "projects"

# Разбор больших jsonl дорогой, поэтому держим результат до изменения файла.
_cache: dict[str, tuple[float, int, dict]] = {}


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


def _parse(path: Path) -> dict:
    """Разбор одного файла сессии: итог, разрезы по дням, моделям и каталогам."""
    out = {"total": _slot(), "daily": {}, "models": {}, "projects": {}}
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
            day = (rec.get("timestamp") or "")[:10]
            model = message.get("model") or "claude"
            if model.startswith("<"):
                continue  # служебные записи Claude Code, не вызовы модели
            project = Path(rec.get("cwd") or "").name or "—"
            for slot in (out["total"],
                         out["daily"].setdefault(day, _slot()),
                         out["models"].setdefault(model, _slot()),
                         out["projects"].setdefault(project, _slot())):
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
    result = {"total": _slot(), "daily": {}, "models": {}, "projects": {}, "available": False}
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
    return result
