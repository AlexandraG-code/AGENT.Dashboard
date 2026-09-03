"""Дашборд флота: живая лента вызовов, редактор промптов, контекст-банк, запуск задач.

Запуск: ./run-dashboard.sh  →  http://localhost:8770
Отдельной базы нет: читаем тот же jsonl, что пишет MCP-сервер.
"""

import sys
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fleet import agents, context, log, roles  # noqa: E402
from fleet.config import DEEPSEEK, MODELS, PROJECTS, ROLES  # noqa: E402

app = FastAPI(title="AGENT.Dashboard")
INDEX = Path(__file__).parent / "index.html"


class PromptIn(BaseModel):
    role: str
    prompt: str


class TaskIn(BaseModel):
    role: str
    task: str
    project: str = ""
    extra: str = ""


class NoteIn(BaseModel):
    project: str
    name: str
    text: str


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return INDEX.read_text(encoding="utf-8")


@app.get("/api/state")
def state() -> dict:
    """Всё, что нужно для первой отрисовки: роли, проекты, сводка, баланс."""
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


@app.get("/api/events")
def events(since: float = 0.0, limit: int = 120) -> dict:
    return {"events": log.read(limit=limit, since=since), "totals": log.totals()}


@app.post("/api/prompt")
def save_prompt(body: PromptIn) -> dict:
    """Сохранить промпт роли. Перезапуск MCP-сервера не нужен — он читает файл заново."""
    try:
        roles.save_prompt(body.role, body.prompt)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    log.emit("prompt_saved", role=body.role, chars=len(body.prompt))
    return {"ok": True, "chars": len(body.prompt)}


@app.post("/api/run")
def run(body: TaskIn) -> dict:
    """Запустить задачу на роли прямо из интерфейса."""
    if body.role not in ROLES:
        raise HTTPException(404, f"нет роли {body.role}")
    try:
        a = agents.ask(body.role, body.task, body.project, body.extra)
    except Exception as exc:
        raise HTTPException(500, str(exc)[:500]) from exc
    return {"text": a.text, "model": a.model, "cost": a.cost, "seconds": a.seconds,
            "tokens_in": a.tokens_in, "tokens_out": a.tokens_out,
            "reasoning": a.tokens_reasoning}


@app.post("/api/council")
def council(body: TaskIn) -> dict:
    return agents.council(body.task, body.project, rounds=2)


@app.get("/api/context/{project}")
def ctx_list(project: str) -> dict:
    try:
        ov = context.overview(project)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    ov["notes"] = {p.name: p.read_text(encoding="utf-8") for p in context.files(project)}
    return ov


@app.post("/api/context")
def ctx_save(body: NoteIn) -> dict:
    path = context.write(body.project, body.name, body.text)
    log.emit("context_saved", project=body.project, name=path.name,
             chars=len(body.text))
    return {"ok": True, "file": path.name}
