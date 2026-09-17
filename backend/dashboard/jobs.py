"""Реестр фоновых задач команды.

Задачи выполняются в отдельном пуле потоков, чтобы HTTP-обработчики
не блокировались на время вызова модели и работа не умирала вместе
с вкладкой браузера.
"""

import threading
import time
import uuid
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from fleet import apply, chat, plan, team
from fleet.agents import ask, council
from fleet import roles as team_roles
from fleet.config import PROJECTS


@dataclass
class Job:
    """Состояние одной задачи команды."""

    id: str
    kind: str
    project: str
    role: str
    task: str
    status: str
    started: float
    finished: float | None = None
    cost: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    error: str = ""
    steps: list[dict] = field(default_factory=list)
    result: str = ""
    apply_files: bool = False


MAX_JOBS = 200
POOL_SIZE = 4

_jobs: dict[str, Job] = {}
_job_ids: deque[str] = deque()
_jobs_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=POOL_SIZE, thread_name_prefix="fleet-job")


def _remember(job: Job) -> None:
    """Кладёт задачу в реестр и вытесняет слишком старые записи."""
    with _jobs_lock:
        _jobs[job.id] = job
        _job_ids.append(job.id)
        while len(_job_ids) > MAX_JOBS:
            oldest_id = _job_ids.popleft()
            _jobs.pop(oldest_id, None)


def submit(kind: str, project: str, role: str, task: str,
           extra: str = "", rounds: int = 2,
           apply_files: bool = False) -> Job:
    """Ставит задачу в очередь и сразу возвращает её карточку."""
    job = Job(
        id=uuid.uuid4().hex,
        kind=kind,
        project=project,
        role=role,
        task=task,
        status="queued",
        started=time.time(),
        apply_files=apply_files,
    )
    _remember(job)
    _executor.submit(_run_job, job.id, extra, rounds)
    return job


def _run_job(job_id: str, extra: str, rounds: int) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        job.status = "running"

    try:
        if job.kind == "run":
            answer = ask(job.role, job.task, job.project, extra)
            result_text = answer.text
            if job.apply_files:
                space = PROJECTS.get(job.project)
                repo = space.repo if space is not None else ""
                if not repo:
                    job.error = (f"Пространство {job.project!r} не привязано к клону "
                                 "репозитория, файлы не записаны")
                else:
                    written = apply.write(repo, answer.text)
                    result_text = f"{answer.text}\n\n{apply.report(written)}"
            with _jobs_lock:
                job.steps = [{"speaker": job.role, "model": answer.model,
                              "text": answer.text, "at": time.time()}]
                job.result = result_text
                job.cost = answer.cost
                job.tokens_in = answer.tokens_in
                job.tokens_out = answer.tokens_out
        elif job.kind == "council":
            result = council(topic=job.task, project=job.project, rounds=rounds, extra=extra)
            transcript = result["transcript"]
            with _jobs_lock:
                job.steps = [{"speaker": item["speaker"], "model": item["model"],
                              "text": item["text"], "at": time.time()} for item in transcript]
                job.cost = result["cost"]
                job.result = "\n\n".join(f"{item['speaker']}: {item['text']}" for item in transcript)
        elif job.kind == "chat":
            message = chat.answer(job.project, job.role, job.task)
            with _jobs_lock:
                job.steps = [{"speaker": job.role, "model": message["model"],
                              "text": message["text"], "at": time.time()}]
                job.result = message["text"]
                job.cost = message.get("cost", 0.0)
        elif job.kind == "plan":
            # Внешним агентам подзадачи не раздаём: у них свой процесс работы.
            descriptions = {name: role.description
                            for name, role in team.of(job.project).roles.items()
                            if not role.external}
            answer = ask(job.role, plan.prompt(job.task, descriptions), job.project, extra)
            items = plan.parse(answer.text, set(descriptions))
            # Рекурсии не будет: подзадачи ставятся с kind="run",
            # а "run" никогда не порождает новых задач.
            # Псевдо-роль council — это не исполнитель, а спор: ставим задачу совета,
            # где консультант предлагает решение, а оппонент его атакует.
            child_ids = [
                submit(kind="council", project=job.project,
                       role=team_roles.need(job.project, "propose").name,
                       task=item["task"]).id
                if item["role"] == plan.COUNCIL
                else submit(kind="run", project=job.project, role=item["role"],
                            task=item["task"], apply_files=item["apply"]).id
                for item in items
            ]
            summary = plan.summary(items)
            children_line = "Запущенные подзадачи: " + (", ".join(child_ids) if child_ids
                                                        else "нет")
            with _jobs_lock:
                job.steps = [{"speaker": job.role, "model": answer.model,
                              "text": summary, "at": time.time()}]
                job.result = f"{summary}\n\n{children_line}"
                job.cost = answer.cost
                job.tokens_in = answer.tokens_in
                job.tokens_out = answer.tokens_out
        else:
            raise ValueError(f"Неизвестный тип задачи: {job.kind!r}")
    except Exception as exc:
        with _jobs_lock:
            job.error = f"{type(exc).__name__}: {exc}"
            job.status = "failed"
            job.finished = time.time()
    else:
        with _jobs_lock:
            job.status = "done"
            job.finished = time.time()


def all_jobs(limit: int = 50) -> list[Job]:
    """Возвращает последние задачи, новые сверху."""
    with _jobs_lock:
        ids = list(reversed(_job_ids))[:limit]
        return [_jobs[job_id] for job_id in ids if job_id in _jobs]


def get(job_id: str) -> Job | None:
    """Возвращает задачу по идентификатору или None."""
    with _jobs_lock:
        return _jobs.get(job_id)


def active() -> list[Job]:
    """Возвращает задачи, которые сейчас в очереди или выполняются."""
    with _jobs_lock:
        return [job for job in _jobs.values() if job.status in ("queued", "running")]
