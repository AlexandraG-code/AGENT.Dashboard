"""API дашборда: живая лента вызовов, статистика, роли, контекст, запуск задач.

Запуск: ./run-dashboard.sh  →  http://localhost:8770
Отдельной базы нет: читаем тот же jsonl, что пишет MCP-сервер.
Ответы описаны схемами (`schemas.py`) — из них генерируются типы фронта.
"""

import re
import sys
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dashboard.schemas import (  # noqa: E402
    CallOut, ContextOut, CouncilOut, EventsOut, RunOut, SavedOut, StateOut,
    StatsOut, UploadOut,
)
from fleet import agents, context, log, roles, stats, team, transcript  # noqa: E402
from fleet.config import DATA, DEEPSEEK, MODELS, PROJECTS, ROLES  # noqa: E402

app = FastAPI(title="AGENT.Dashboard", version="1.0.0")

# Фронт на Next.js во время разработки живёт на 3000, API — на 8770.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

INDEX = Path(__file__).parent / "index.html"

# Оригиналы загруженных материалов. В git не уезжают (см. .gitignore):
# в репозитории живёт только выжимка, попавшая в context/.
UPLOADS = DATA / "uploads"
UPLOAD_LIMIT = 20 * 1024 * 1024


class PromptIn(BaseModel):
    role: str
    prompt: str


class TaskIn(BaseModel):
    role: str
    task: str
    project: str = ""
    extra: str = ""


class ProjectIn(BaseModel):
    id: str
    title: str = ""


class RoleIn(BaseModel):
    """Настройки агента из формы. prompt=None означает «промпт не трогать»."""

    name: str
    model: str = ""
    description: str = ""
    fallback: str | None = None
    thinking: bool = False
    max_tokens: int = 6000
    temperature: float = 0.3
    prompt: str | None = None


class NoteIn(BaseModel):
    project: str
    name: str
    text: str


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def index() -> str:
    """Лёгкий интерфейс одним файлом — работает без сборки фронта."""
    return INDEX.read_text(encoding="utf-8")


@app.get("/api/state", response_model=StateOut)
def state() -> dict:
    """Всё, что нужно для первой отрисовки: агенты, пространства, сводка, баланс."""
    team.sync()
    balance = None
    try:
        r = httpx.get(f"{DEEPSEEK.base_url}/user/balance",
                      headers={"Authorization": f"Bearer {DEEPSEEK.api_key}"},
                      timeout=8).json()
        balance = float(r["balance_infos"][0]["total_balance"])
    except Exception:
        pass
    return {
        "roles": roles.all_roles(),
        "projects": [{"id": k, "title": v} for k, v in PROJECTS.items()],
        "models": {
            k: {"provider": m.provider.name, "price_out": m.price_out,
                "concurrency": m.concurrency, "vision": m.vision}
            for k, m in MODELS.items()
        },
        "totals": log.totals(),
        "balance": balance,
    }


@app.get("/api/events", response_model=EventsOut)
def events(since: float = 0.0, limit: int = 120) -> dict:
    return {"events": log.read(limit=limit, since=since), "totals": log.totals()}


@app.get("/api/stats", response_model=StatsOut)
def statistics(days: int = 30, project: str = "") -> dict:
    """Полная статистика: итог, проекты × модели × роли, расход по дням.

    `project` пустой — сводка по всем пространствам; иначе только по одному.
    """
    return stats.summary(days, project)


@app.get("/api/call/{call_id}", response_model=CallOut)
def call_detail(call_id: str) -> dict:
    """Что именно ушло в модель и что она ответила — по одному вызову."""
    rec = transcript.read(call_id)
    if rec is None:
        raise HTTPException(404, "разговор не найден (мог быть вычищен по сроку)")
    return rec


@app.post("/api/prompt", response_model=SavedOut)
def save_prompt(body: PromptIn) -> dict:
    """Сохранить промпт агента. Перезапуск MCP-сервера не нужен — он читает файл заново."""
    try:
        roles.save_prompt(body.role, body.prompt)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    log.emit("prompt_saved", role=body.role, chars=len(body.prompt))
    return {"ok": True, "chars": len(body.prompt)}


@app.post("/api/role", response_model=SavedOut)
def role_save(body: RoleIn) -> dict:
    """Создать агента или изменить его настройки (и промпт, если он прислан)."""
    try:
        role = team.set_role(
            body.name, model=body.model, description=body.description,
            fallback=body.fallback, thinking=body.thinking,
            max_tokens=body.max_tokens, temperature=body.temperature,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if body.prompt is not None:
        roles.save_prompt(role.name, body.prompt)
    log.emit("role_saved", role=role.name, model=role.model)
    return {"ok": True, "name": role.name}


@app.delete("/api/role/{name}", response_model=SavedOut)
def role_delete(name: str) -> dict:
    """Убрать агента. Промпт остаётся в roles/ — роль можно вернуть без потерь."""
    try:
        team.delete_role(name)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    log.emit("role_deleted", role=name)
    return {"ok": True, "name": name}


@app.post("/api/project", response_model=SavedOut)
def project_save(body: ProjectIn) -> dict:
    """Создать рабочее пространство или переименовать существующее."""
    try:
        pid = team.set_project(body.id, body.title)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    context.project_dir(pid)  # сразу заводим каталог заметок
    log.emit("project_saved", project=pid, name=body.title)
    return {"ok": True, "id": pid, "title": PROJECTS[pid]}


@app.delete("/api/project/{pid}", response_model=SavedOut)
def project_delete(pid: str) -> dict:
    """Убрать пространство из списка. Заметки остаются на диске — их можно вернуть."""
    try:
        team.delete_project(pid)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    log.emit("project_deleted", project=pid)
    return {"ok": True, "id": pid}


@app.post("/api/run", response_model=RunOut)
def run(body: TaskIn) -> dict:
    """Запустить задачу на агенте прямо из интерфейса."""
    if body.role not in ROLES:
        raise HTTPException(404, f"нет агента {body.role}")
    try:
        a = agents.ask(body.role, body.task, body.project, body.extra)
    except Exception as exc:
        raise HTTPException(500, str(exc)[:500]) from exc
    return {"text": a.text, "model": a.model, "cost": a.cost, "seconds": a.seconds,
            "tokens_in": a.tokens_in, "tokens_out": a.tokens_out,
            "reasoning": a.tokens_reasoning}


@app.post("/api/council", response_model=CouncilOut)
def council(body: TaskIn) -> dict:
    return agents.council(body.task, body.project, rounds=2)


@app.get("/api/context/{project}", response_model=ContextOut)
def ctx_list(project: str) -> dict:
    try:
        ov = context.overview(project)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    ov["notes"] = {p.name: p.read_text(encoding="utf-8") for p in context.files(project)}
    return ov


@app.post("/api/context", response_model=SavedOut)
def ctx_save(body: NoteIn) -> dict:
    path = context.write(body.project, body.name, body.text)
    log.emit("context_saved", project=body.project, name=path.name, chars=len(body.text))
    return {"ok": True, "file": path.name}


@app.post("/api/upload", response_model=UploadOut)
def upload(project: str = Form(...), question: str = Form(""),
           file: UploadFile = File(...)) -> dict:
    """Принять материал и вернуть черновик заметки для контекста проекта.

    Разбирает бесплатная роль: картинку — зрячий агент, текст — condenser.
    В контекст черновик попадает не сам, а когда его сохранят: материал стоит
    прочитать глазами прежде, чем он уедет в промпт каждого агента.
    """
    if project not in PROJECTS:
        raise HTTPException(404, f"нет пространства {project}")

    blob = file.file.read()
    if len(blob) > UPLOAD_LIMIT:
        raise HTTPException(413, f"файл больше {UPLOAD_LIMIT // 1024 // 1024} МБ")

    safe = re.sub(r"[^\w.-]+", "-", Path(file.filename or "file").name).strip("-") or "file"
    target = UPLOADS / project / f"{time.strftime('%Y%m%d-%H%M%S')}-{safe}"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(blob)

    try:
        res = agents.intake(project, str(target), question)
    except ValueError as exc:
        raise HTTPException(415, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, str(exc)[:500]) from exc

    res["name"] = Path(safe).stem + ".md"
    res["stored"] = str(target)
    res["bytes"] = len(blob)
    return res
