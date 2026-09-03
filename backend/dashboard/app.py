"""API флота: живая лента вызовов, статистика, агенты, модели, контекст, запуск задач.

Запуск: ./run-dashboard.sh → http://localhost:8770. В браузере по этому адресу лежит
Swagger (`/docs`), интерфейс живёт отдельно на http://localhost:3000.
Отдельной базы нет: читаем тот же jsonl, что пишет MCP-сервер.
Ответы описаны схемами (`schemas.py`) — из них генерируются типы фронта.
"""

import re
import sys
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.openapi.docs import get_redoc_html
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dashboard.schemas import (  # noqa: E402
    CallOut, CheckOut, ContextOut, CouncilOut, EventsOut, RunOut, SavedOut,
    StateOut, StatsOut, UploadOut,
)
from fleet import agents, context, log, providers, roles, secrets, stats, team, transcript  # noqa: E402
from fleet.config import DATA, MODELS, PROJECTS, PROVIDERS, ROLES  # noqa: E402
from fleet.config import provider as get_provider  # noqa: E402

app = FastAPI(
    title="AGENT.Dashboard",
    version="1.0.0",
    # Свой /redoc: встроенный тянет redoc@next с jsdelivr, а этот тег отдаёт 404,
    # и страница остаётся пустой. Версия здесь пиньтся явно.
    redoc_url=None,
    description=(
        "API флота агентов. Интерфейс — отдельное приложение на http://localhost:3000, "
        "здесь живёт только API и его описание."
    ),
)

# Фронт на Next.js во время разработки живёт на 3000, API — на 8770.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

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


class ProviderIn(BaseModel):
    """Провайдер из формы. Ключ приходит отдельным полем и в team.json не попадает."""

    name: str
    title: str = ""
    base_url: str
    auth: str = "bearer"
    key_env: str = ""
    verify_ssl: bool = True
    send_thinking: bool = False
    api_key: str | None = None


class ModelIn(BaseModel):
    id: str
    provider: str
    title: str = ""
    price_in: float = 0.0
    price_in_cached: float = 0.0
    price_out: float = 0.0
    concurrency: int = 3
    vision: bool = False


class NoteIn(BaseModel):
    project: str
    name: str
    text: str


REDOC_JS = "https://cdn.jsdelivr.net/npm/redoc@2.5.0/bundles/redoc.standalone.js"


@app.get("/redoc", include_in_schema=False)
def redoc() -> HTMLResponse:
    """ReDoc с закреплённой версией скрипта."""
    return get_redoc_html(openapi_url="/openapi.json", title="AGENT.Dashboard — API",
                          redoc_js_url=REDOC_JS, with_google_fonts=False)


@app.get("/", include_in_schema=False)
def index() -> RedirectResponse:
    """Корень отдаёт Swagger: смотреть эндпоинты глазами нужнее, чем второй интерфейс."""
    return RedirectResponse("/docs")


@app.get("/api/state", response_model=StateOut)
def state() -> dict:
    """Всё, что нужно для первой отрисовки: агенты, пространства, сводка, баланс."""
    team.sync()
    balance = None
    deepseek = PROVIDERS.get("deepseek")
    if deepseek is not None:
        # Единственный провайдер, который отдаёт остаток счёта. У подписочных
        # (GLM) такого эндпоинта нет — там показываем собственный расход.
        try:
            r = httpx.get(f"{deepseek.base_url}/user/balance",
                          headers={"Authorization": f"Bearer {deepseek.api_key}"},
                          timeout=8).json()
            balance = float(r["balance_infos"][0]["total_balance"])
        except Exception:
            pass
    return {
        "roles": roles.all_roles(),
        "projects": [{"id": k, "title": v} for k, v in PROJECTS.items()],
        "models": {
            k: {"id": k, "title": m.title, "provider": m.provider, "price_in": m.price_in,
                "price_in_cached": m.price_in_cached, "price_out": m.price_out,
                "concurrency": m.concurrency, "vision": m.vision}
            for k, m in MODELS.items()
        },
        "providers": [
            {"name": p.name, "title": p.title, "base_url": p.base_url, "auth": p.auth,
             "key_env": p.key_env, "verify_ssl": p.verify_ssl, "send_thinking": p.send_thinking,
             "builtin": p.builtin, "has_key": secrets.has(p.name, p.key_env)}
            for p in PROVIDERS.values()
        ],
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


@app.post("/api/provider", response_model=SavedOut)
def provider_save(body: ProviderIn) -> dict:
    """Завести или изменить провайдера моделей (OpenAI-совместимый, Yandex, GigaChat)."""
    try:
        provider = team.set_provider(
            body.name, title=body.title, base_url=body.base_url, auth=body.auth,
            key_env=body.key_env, verify_ssl=body.verify_ssl, send_thinking=body.send_thinking,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if body.api_key is not None:
        secrets.put(provider.name, body.api_key.strip())
    log.emit("provider_saved", name=provider.name)
    return {"ok": True, "name": provider.name, "title": provider.title}


@app.delete("/api/provider/{name}", response_model=SavedOut)
def provider_delete(name: str) -> dict:
    try:
        team.delete_provider(name)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    secrets.put(name, "")
    log.emit("provider_deleted", name=name)
    return {"ok": True, "name": name}


@app.post("/api/model", response_model=SavedOut)
def model_save(body: ModelIn) -> dict:
    """Завести или изменить модель. id — то, что уходит в поле model запроса."""
    try:
        model = team.set_model(
            body.id, provider=body.provider, title=body.title, price_in=body.price_in,
            price_in_cached=body.price_in_cached, price_out=body.price_out,
            concurrency=body.concurrency, vision=body.vision,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    log.emit("model_saved", name=model.id, provider=model.provider)
    return {"ok": True, "name": model.id}


@app.delete("/api/model", response_model=SavedOut)
def model_delete(id: str) -> dict:
    """Идентификатор моделью приходит query-параметром: у Yandex он вида gpt://…/latest."""
    try:
        team.delete_model(id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    log.emit("model_deleted", name=id)
    return {"ok": True, "name": id}


@app.post("/api/provider/{name}/check", response_model=CheckOut)
def provider_check(name: str, model: str = "") -> dict:
    """Проверить связь с провайдером. Без модели — запрос каталога, с моделью — короткий вызов."""
    try:
        provider = get_provider(name)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    result = providers.check(provider, model)
    log.emit("provider_check", name=name, model=model, ok=result["ok"],
             status=result["status"], message=result["message"][:200])
    return result


class TextIn(BaseModel):
    project: str
    text: str
    question: str = ""
    source: str = ""


class RulesIn(BaseModel):
    project: str
    repo: str
    compress: bool = True


@app.post("/api/intake/text", response_model=UploadOut)
def intake_text(body: TextIn) -> dict:
    """Разобрать вставленный кусок (лог, код, переписку) в черновик заметки."""
    if body.project not in PROJECTS:
        raise HTTPException(404, f"нет пространства {body.project}")
    if not body.text.strip():
        raise HTTPException(400, "пустой текст")
    try:
        res = agents.digest_text(body.project, body.text, body.question, body.source)
    except Exception as exc:
        raise HTTPException(500, str(exc)[:500]) from exc
    res["name"] = (body.source or "материал").replace(" ", "-")[:60] + ".md"
    res["stored"] = ""
    res["bytes"] = len(body.text.encode())
    return res


@app.post("/api/workspace/rules", response_model=UploadOut)
def workspace_rules(body: RulesIn) -> dict:
    """Забрать правила проекта из его репозитория в черновик _rules.md."""
    if body.project not in PROJECTS:
        raise HTTPException(404, f"нет пространства {body.project}")
    try:
        res = agents.rules_from_repo(body.project, body.repo, body.compress)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, str(exc)[:500]) from exc
    return {"kind": "правила", "note": res["note"], "model": res["model"], "cost": res["cost"],
            "source": ", ".join(res["sources"]), "name": "_rules.md", "stored": body.repo,
            "bytes": res["chars"]}
