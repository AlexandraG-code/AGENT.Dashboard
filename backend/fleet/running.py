"""Реестр выполняющихся задач, общий для всех процессов через файл.

Реестр файловый, потому что процессов несколько: MCP-сервер запускается
на каждую сессию Claude Code, а дашборд работает в собственном процессе,
и общей памяти у них нет. Файл в data/logs/running.jsonl — единственный
способ видеть работу, запущенную из любого процесса.
"""
import json
import os
import threading
import time
import uuid

from .config import DATA

_RUNNING_FILE = DATA / "logs" / "running.jsonl"
_lock = threading.Lock()
_write_counter = 0
_PRUNE_EVERY = 100
_TASK_SIGNATURE_LIMIT = 200


def _read_lines() -> list[dict]:
    """Прочитать все валидные события из файла реестра.

    Битые строки json пропускаются молча, потому что реестр могут писать
    несколько процессов и при сбое одного из них не должны страдать другие.
    """
    if not _RUNNING_FILE.exists():
        return []

    events = []
    with _RUNNING_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                # Строка побилась при параллельной записи или была неполной —
                # пропускаем, чтобы не терять весь реестр.
                continue
    return events


def _append(event: dict) -> None:
    """Дописать одно событие в конец файла.

    Вызывается только под `_lock`, поэтому сам блокировку не берёт.
    """
    _RUNNING_FILE.parent.mkdir(parents=True, exist_ok=True)
    with _RUNNING_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def start(source: str, role: str, model: str, project: str, task: str) -> str:
    """Записать начало задачи и вернуть её идентификатор.

    Возвращает uuid4 hex, который затем передаётся в `finish`.
    Подпись задачи обрезается до 200 символов, потому что это подпись для
    человека, а не хранилище полного текста задачи.
    """
    global _write_counter

    task_id = uuid.uuid4().hex
    session = (
        os.environ.get("CLAUDE_SESSION_ID")
        or os.environ.get("FLEET_SESSION")
        or f"pid-{os.getpid()}"
    )
    cwd = os.environ.get("FLEET_CWD") or os.getcwd()

    event = {
        "id": task_id,
        "event": "start",
        "ts": time.time(),
        "source": source,
        "session": session,
        "project": project,
        "role": role,
        "model": model,
        "task": task[:_TASK_SIGNATURE_LIMIT],
        "pid": os.getpid(),
        "cwd": cwd,
    }

    with _lock:
        _append(event)
        _write_counter += 1
        need_prune = _write_counter % _PRUNE_EVERY == 0

    # Не вызываем prune внутри `with _lock`, чтобы не удерживать блокировку
    # дольше необходимого и не создавать лишнюю вложенность.
    if need_prune:
        prune()
    return task_id


def finish(task_id: str, ok: bool, cost: float = 0.0, error: str = "") -> None:
    """Записать завершение задачи по её идентификатору.

    Ищет событие start, чтобы перенести в finish поля, которые у finish
    отсутствуют: source, session, project, role, model. Если start не найден,
    пишет finish с пустыми значениями — такое возможно, если файл уже
    переписан prune и старая запись потеряна.
    """
    with _lock:
        start_event = None
        if _RUNNING_FILE.exists():
            # Читаем все валидные события и ищем последний start с нужным id.
            # Идём с конца, потому что файл ограничен и так быстрее.
            events = _read_lines()
            for ev in reversed(events):
                if ev.get("id") == task_id and ev.get("event") == "start":
                    start_event = ev
                    break

        event = {
            "id": task_id,
            "event": "finish",
            "ts": time.time(),
            "source": start_event.get("source", "") if start_event else "",
            "session": start_event.get("session", "") if start_event else "",
            "project": start_event.get("project", "") if start_event else "",
            "role": start_event.get("role", "") if start_event else "",
            "model": start_event.get("model", "") if start_event else "",
            "pid": os.getpid(),
            "ok": ok,
            "cost": cost,
            "error": error,
        }
        _append(event)


def active(max_age: float = 3600.0) -> list[dict]:
    """Вернуть задачи, которые начались и ещё не завершились.

    Возвращает список событий start. Задачи старше max_age секунд
    отбрасываются, потому что процесс мог умереть, не записав finish,
    иначе такие «вечные» задачи висели бы в интерфейсе навсегда.
    """
    with _lock:
        events = _read_lines()

    by_id: dict[str, dict] = {}
    for ev in events:
        if "id" not in ev or "event" not in ev:
            continue
        by_id.setdefault(ev["id"], {})
        if ev["event"] == "start":
            by_id[ev["id"]]["start"] = ev
        elif ev["event"] == "finish":
            by_id[ev["id"]]["finish"] = ev

    now = time.time()
    active_list = []
    for item in by_id.values():
        start_ev = item.get("start")
        if start_ev is None or "finish" in item:
            continue
        age = now - start_ev.get("ts", 0)
        if age > max_age:
            continue
        active_list.append(start_ev)

    # Сортируем по времени старта для стабильного отображения в UI.
    active_list.sort(key=lambda ev: ev.get("ts", 0))
    return active_list


def prune(keep: int = 2000) -> None:
    """Ограничить размер файла: оставить только последние keep событий.

    Переписывание в отдельный временный файл с уникальным именем и атомарная
    замена позволяют не бояться одновременного вызова prune из разных
    процессов.
    """
    with _lock:
        events = _read_lines()
        if len(events) <= keep:
            return

        tail = events[-keep:]
        tmp_path = _RUNNING_FILE.with_name(f"running.tmp.{uuid.uuid4().hex}")
        with tmp_path.open("w", encoding="utf-8") as f:
            for ev in tail:
                f.write(json.dumps(ev, ensure_ascii=False) + "\n")
        tmp_path.replace(_RUNNING_FILE)
