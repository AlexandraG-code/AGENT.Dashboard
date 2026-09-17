"""API команды: живая лента вызовов, статистика, агенты, модели, контекст, запуск задач.

Запуск: ./run-dashboard.sh → http://localhost:8770. В браузере по этому адресу лежит
Swagger (`/docs`), интерфейс живёт отдельно на http://localhost:3001.
Отдельной базы нет: читаем тот же jsonl, что пишет MCP-сервер.
Ответы описаны схемами (`schemas.py`) — из них генерируются типы фронта.
"""

import re
import sys
import time
from dataclasses import asdict
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.openapi.docs import get_redoc_html
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, RedirectResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dashboard import jobs  # noqa: E402
from dashboard.schemas import (  # noqa: E402
    CallOut, CatalogOut, ChartOut, ChatOut, CheckOut, ContextOut, CouncilOut, DirsOut,
    DocTextOut, EventsOut, HintsOut, JobOut, JobsOut, OrgOut, PromptsOut, RulesFoundOut,
    RunOut, SavedOut, SetupOut, StateOut, StatsOut, UploadOut,
)
from fleet import (agents, avatars, chart, charter, chat, context, hints, layout,  # noqa: E402
                   log, migrate, paths, prompts, providers, repo_rules, roles,
                   running, secrets, stats, team, transcript, usage)
from fleet.config import (ASSIGNMENTS, MODELS, PROJECTS, PROVIDERS,  # noqa: E402
                          SCOPES, TOOLS)
from fleet.config import provider as get_provider  # noqa: E402

app = FastAPI(
    title="AGENT.Dashboard",
    version="1.0.0",
    # Свой /redoc: встроенный тянет redoc@next с jsdelivr, а этот тег отдаёт 404,
    # и страница остаётся пустой. Версия здесь пиньтся явно.
    redoc_url=None,
    description=(
        "API команды агентов. Интерфейс — отдельное приложение на http://localhost:3001, "
        "здесь живёт только API и его описание."
    ),
)

# Фронт на Next.js во время разработки живёт на 3001, API — на 8770.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_LIMIT = 20 * 1024 * 1024

# Данные могли приехать с другой машины в прежней плоской раскладке: переносим
# их до первого чтения состава, иначе дашборд покажет пустую команду.
migrate.run()
# История расхода могла остаться только в журнале: свод появился позже него.
usage.ensure_built()


class SetupIn(BaseModel):
    """Назначения команды пространства: ключ служебного действия → имя роли."""

    project: str
    assignments: dict[str, str]


class HintIn(BaseModel):
    """Подсказка к промпту: ключ, заголовок кнопки и сам текст."""

    key: str
    title: str = ""
    text: str


class HintsIn(BaseModel):
    hints: list[HintIn]


class PromptsIn(BaseModel):
    """Служебные промпты целиком: ключ → текст."""

    prompts: dict[str, str]


class PromptIn(BaseModel):
    project: str
    role: str
    prompt: str


class TaskIn(BaseModel):
    role: str
    task: str
    project: str = ""
    extra: str = ""


class ProjectIn(BaseModel):
    """Пространство из формы.

    repo=None означает «путь к репозиторию не трогать», sign_code=None —
    «оставить прежнюю настройку подписи кода». Пути (repo, data_dir) живут в
    локальном файле машины и в данные не уезжают.
    """

    id: str
    title: str = ""
    repo: str | None = None
    sign_code: bool | None = None
    rule_globs: list[str] | None = None
    # Папка с данными проекта, если человек выбрал её вне общего клона данных.
    data_dir: str | None = None
    # Взять состав команды из другого пространства — у нового его нет вовсе.
    copy_from: str = ""


class RoleIn(BaseModel):
    """Настройки агента из формы. prompt=None означает «промпт не трогать».

    `lead` — главный, тот кто раздаёт задачи; `external` — работает вне нашего
    клиента (свой процесс, своя подписка), поэтому его модель в реестре не нужна."""

    project: str
    name: str
    model: str = ""
    description: str = ""
    fallback: str | None = None
    thinking: bool = False
    max_tokens: int = 6000
    temperature: float = 0.3
    prompt: str | None = None
    lead: bool = False
    external: bool = False
    deputy: bool = False
    icon: str = ""
    tools: list[str] = []
    team: str = ""


class TeamIn(BaseModel):
    """Отдел из формы. Отдел принадлежит пространству, как и вся его команда."""

    project: str
    name: str
    title: str = ""
    description: str | None = None


class DocIn(BaseModel):
    """Регламент из формы: карточка и текст одним сохранением."""

    project: str
    id: str = ""
    title: str
    scope: str = "space"
    team: str = ""
    order: int = 0
    text: str = ""


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
    # Дополнительные заголовки запроса. Ими живут провайдеры, которым мало ключа:
    # Yandex Cloud требует x-folder-id, иначе не отдаёт ни каталог, ни ответ.
    headers: dict[str, str] | None = None


class ModelIn(BaseModel):
    """Модель из формы. plan — описание тарифа для человека, а не цена."""

    id: str
    provider: str
    title: str = ""
    price_in: float = 0.0
    price_in_cached: float = 0.0
    price_out: float = 0.0
    concurrency: int = 3
    vision: bool = False
    plan: str = ""


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
def state(project: str = "") -> dict:
    """Всё, что нужно для первой отрисовки: агенты, пространства, сводка, баланс.

    Команда возвращается по одному пространству: состав у проектов разный, и
    «все роли сразу» — это склейка разных команд в один список. Пустое
    `project` означает, что пространство ещё не выбрано, — тогда ролей нет.
    """
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
        "roles": roles.all_roles(project) if project in PROJECTS else [],
        "projects": [{"id": k, "title": v.title, "repo": v.repo,
                      "data_dir": paths.data_of(k), "sign_code": v.sign_code,
                      "rule_globs": v.rule_globs} for k, v in PROJECTS.items()],
        "models": {
            k: {"id": k, "title": m.title, "provider": m.provider, "price_in": m.price_in,
                "price_in_cached": m.price_in_cached, "price_out": m.price_out,
                "concurrency": m.concurrency, "vision": m.vision, "plan": m.plan}
            for k, m in MODELS.items()
        },
        "providers": [
            {"name": p.name, "title": p.title, "base_url": p.base_url, "auth": p.auth,
             "key_env": p.key_env, "verify_ssl": p.verify_ssl, "send_thinking": p.send_thinking,
             "headers": p.headers,
             "builtin": p.builtin, "has_key": secrets.has(p.name, p.key_env)}
            for p in PROVIDERS.values()
        ],
        "totals": usage.totals(),
        "balance": balance,
    }


@app.get("/api/events", response_model=EventsOut)
def events(since: float = 0.0, limit: int = 120) -> dict:
    return {"events": log.read(limit=limit, since=since), "totals": usage.totals()}


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


@app.get("/api/team/setup", response_model=SetupOut)
def team_setup(project: str = "") -> dict:
    """Что приложение умеет дать роли и какие служебные места нужно заполнить.

    Инструменты — реальные права (запись в файлы, поиск). Назначения — выбор
    человека: кто сжимает, кто ведёт летопись, кто спорит в совете. И то и
    другое — про команду конкретного пространства.
    """
    comp = team.of(project) if project in PROJECTS else team.Composition(project="")
    return {
        "tools": [{"key": key, "title": title} for key, title in TOOLS.items()],
        "assignments": [
            {"key": key, "title": title, "role": comp.role_for.get(key, "")}
            for key, title in ASSIGNMENTS.items()
        ],
        "teams": [asdict(t) for t in comp.teams.values()],
    }


@app.post("/api/team/setup", response_model=SavedOut)
def save_team_setup(body: SetupIn) -> dict:
    """Сохранить назначения: ключ действия → имя роли (пустая строка снимает)."""
    try:
        for key, role in body.assignments.items():
            team.set_assignment(body.project, key, role)
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    log.emit("assignments_saved", project=body.project, count=len(body.assignments))
    return {"ok": True}


@app.get("/api/hints", response_model=HintsOut)
def read_hints() -> dict:
    """Подсказки к системному промпту: готовые куски текста для вставки."""
    return {"hints": hints.all_hints()}


@app.post("/api/hints", response_model=SavedOut)
def save_hints(body: HintsIn) -> dict:
    """Сохранить набор подсказок целиком — их состав правит человек."""
    hints.save_all([item.model_dump() for item in body.hints])
    log.emit("hints_saved", count=len(body.hints))
    return {"ok": True}


@app.get("/api/prompts", response_model=PromptsOut)
def read_prompts() -> dict:
    """Служебные промпты приложения и допустимые подстановки в каждом."""
    values = prompts.all_prompts()
    return {"prompts": [
        {"key": key, "text": values.get(key, ""), "placeholders": list(names)}
        for key, names in prompts.PLACEHOLDERS.items()
    ]}


@app.post("/api/prompts", response_model=SavedOut)
def save_prompts(body: PromptsIn) -> dict:
    """Сохранить служебные промпты целиком."""
    prompts.save_all(body.prompts)
    log.emit("prompts_saved", keys=len(body.prompts))
    return {"ok": True}


@app.get("/api/org", response_model=OrgOut)
def org(project: str = "") -> dict:
    """Отделы, регламенты и области их действия — в одном пространстве."""
    if project not in PROJECTS:
        return {"teams": [], "documents": [],
                "scopes": [{"key": key, "title": title} for key, title in SCOPES.items()]}
    comp = team.of(project)
    return {
        "teams": [asdict(t) for t in comp.teams.values()],
        "documents": [
            {**asdict(doc), "chars": len(charter.body(project, doc.id))}
            for doc in charter.docs(project)
        ],
        "scopes": [{"key": key, "title": title} for key, title in SCOPES.items()],
    }


@app.post("/api/org/team", response_model=SavedOut)
def org_team_save(body: TeamIn) -> dict:
    """Завести или изменить отдел."""
    try:
        saved = team.set_team(body.project, body.name, body.title,
                              description=body.description)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    log.emit("team_saved", project=body.project, name=saved.name)
    return {"ok": True, "name": saved.name, "title": saved.title}


@app.delete("/api/org/team/{name}", response_model=SavedOut)
def org_team_delete(name: str, project: str) -> dict:
    """Убрать отдел. Агенты остаются без приписки, регламенты отдела удаляются."""
    try:
        team.delete_team(project, name)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    log.emit("team_deleted", project=project, name=name)
    return {"ok": True, "name": name}


@app.get("/api/org/doc/{doc_id}", response_model=DocTextOut)
def org_doc(doc_id: str, project: str) -> dict:
    """Регламент вместе с текстом."""
    found = next((d for d in charter.docs(project) if d.id == doc_id), None)
    if found is None:
        raise HTTPException(404, f"нет регламента {doc_id}")
    text = charter.body(project, doc_id)
    return {**asdict(found), "chars": len(text), "text": text}


@app.post("/api/org/doc", response_model=SavedOut)
def org_doc_save(body: DocIn) -> dict:
    """Сохранить регламент: карточку в состав, текст — файлом."""
    try:
        doc = charter.save(body.project, body.id or body.title, body.title, body.text,
                           scope=body.scope, team_name=body.team, order=body.order)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    log.emit("doc_saved", project=body.project, name=doc.id, scope=doc.scope,
             chars=len(body.text))
    return {"ok": True, "name": doc.id, "title": doc.title}


@app.post("/api/org/doc/upload", response_model=DocTextOut)
def org_doc_upload(project: str = Form(...), title: str = Form(""),
                   scope: str = Form("space"), team_name: str = Form(""),
                   file: UploadFile = File(...)) -> dict:
    """Загрузить регламент файлом (markdown или простой текст).

    Файл не разбирается моделью: устав читают как есть, а не в пересказе.
    """
    blob = file.file.read()
    if len(blob) > UPLOAD_LIMIT:
        raise HTTPException(413, f"файл больше {UPLOAD_LIMIT // 1024 // 1024} МБ")
    try:
        text = blob.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(415, "нужен текстовый файл в UTF-8 (.md или .txt)") from exc

    name = Path(file.filename or "reglament").stem
    try:
        doc = charter.save(project, name, title.strip() or name, text, scope=scope,
                           team_name=team_name)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    log.emit("doc_uploaded", project=project, name=doc.id, scope=doc.scope, chars=len(text))
    return {**asdict(doc), "chars": len(text), "text": text}


@app.delete("/api/org/doc/{doc_id}", response_model=SavedOut)
def org_doc_delete(doc_id: str, project: str) -> dict:
    """Убрать регламент вместе с текстом."""
    try:
        charter.remove(project, doc_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    log.emit("doc_deleted", project=project, name=doc_id)
    return {"ok": True, "name": doc_id}


@app.get("/api/team/chart", response_model=ChartOut)
def team_chart(project: str) -> dict:
    """Схема команды пространства: кто кому подчиняется и что будет при отказе."""
    if project not in PROJECTS:
        raise HTTPException(404, f"нет пространства {project}")
    data = chart.tree(project)
    data["failover"] = chart.failover(project)
    data["mermaid"] = chart.mermaid(project)
    return data


@app.get("/api/team/chart.md", response_class=PlainTextResponse)
def team_chart_markdown(project: str) -> str:
    """Та же схема одним markdown-файлом — на выгрузку человеку."""
    if project not in PROJECTS:
        raise HTTPException(404, f"нет пространства {project}")
    return chart.markdown(project)


@app.post("/api/role/{name}/avatar", response_model=SavedOut)
async def save_role_avatar(name: str, project: str = Form(...),
                           file: UploadFile = File(...)) -> dict:
    """Загрузить аватар агента. Картинку выбирает человек, как в соцсетях."""
    data = await file.read()
    try:
        avatars.save(project, name, file.filename or "", data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    log.emit("avatar_saved", project=project, role=name)
    return {"ok": True, "name": name}


@app.get("/api/role/{name}/avatar")
def get_role_avatar(name: str, project: str):
    """Отдать картинку аватара. Без response_model: это файл, а не json."""
    path = avatars.path_for(project, name)
    if path is None:
        raise HTTPException(404, f"у агента {name} нет аватара")
    return FileResponse(path, media_type=avatars.media_type(path))


@app.delete("/api/role/{name}/avatar", response_model=SavedOut)
def delete_role_avatar(name: str, project: str) -> dict:
    """Убрать аватар агента — останется эмодзи-значок."""
    avatars.remove(project, name)
    return {"ok": True, "name": name}


@app.post("/api/prompt", response_model=SavedOut)
def save_prompt(body: PromptIn) -> dict:
    """Сохранить промпт агента. Перезапуск MCP-сервера не нужен — он читает файл заново."""
    try:
        roles.save_prompt(body.project, body.role, body.prompt)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    log.emit("prompt_saved", project=body.project, role=body.role, chars=len(body.prompt))
    return {"ok": True, "chars": len(body.prompt)}


@app.post("/api/role", response_model=SavedOut)
def role_save(body: RoleIn) -> dict:
    """Создать агента или изменить его настройки (и промпт, если он прислан)."""
    try:
        role = team.set_role(
            body.project, body.name, model=body.model, description=body.description,
            fallback=body.fallback, thinking=body.thinking,
            max_tokens=body.max_tokens, temperature=body.temperature,
            lead=body.lead, external=body.external, deputy=body.deputy, icon=body.icon,
            tools=body.tools, team=body.team,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if body.prompt is not None:
        roles.save_prompt(body.project, role.name, body.prompt)
    log.emit("role_saved", project=body.project, role=role.name, model=role.model)
    return {"ok": True, "name": role.name}


@app.delete("/api/role/{name}", response_model=SavedOut)
def role_delete(name: str, project: str) -> dict:
    """Убрать агента из команды пространства вместе с его назначениями."""
    try:
        team.delete_role(project, name)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    log.emit("role_deleted", project=project, role=name)
    return {"ok": True, "name": name}


@app.post("/api/project", response_model=SavedOut)
def project_save(body: ProjectIn) -> dict:
    """Создать рабочее пространство или переименовать существующее."""
    try:
        pid = team.set_project(body.id, body.title, body.repo, body.sign_code,
                               body.rule_globs, data_dir=body.data_dir,
                               copy_from=body.copy_from)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    context.project_dir(pid)  # сразу заводим каталог заметок
    log.emit("project_saved", project=pid, name=body.title, repo=PROJECTS[pid].repo)
    return {"ok": True, "id": pid, "title": PROJECTS[pid].title}


@app.delete("/api/project/{pid}", response_model=SavedOut)
def project_delete(pid: str) -> dict:
    """Убрать пространство из списка. Заметки остаются на диске — их можно вернуть."""
    try:
        team.delete_project(pid)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    log.emit("project_deleted", project=pid)
    return {"ok": True, "id": pid}


# Написано агентом senior (deepseek-v4-pro) по ТЗ главного архитектора.
class JobIn(BaseModel):
    """Тело запроса на создание фоновой задачи."""

    kind: str = "run"
    project: str = ""
    role: str = "senior"
    task: str
    extra: str = ""
    rounds: int = 2
    apply_files: bool = False


class ChatIn(BaseModel):
    """Сообщение в общий чат команды."""

    project: str = ""
    author: str = "human"
    text: str


@app.get("/api/chat", response_model=ChatOut)
def read_chat(project: str = "", limit: int = 100, since: float = 0.0) -> dict:
    """Лента общего чата пространства."""
    return {"messages": chat.read(project, limit=limit, since=since)}


@app.post("/api/chat", response_model=ChatOut)
def post_chat(body: ChatIn) -> dict:
    """Публикует сообщение и зовёт упомянутых агентов ответить.

    Ответ агента идёт фоновой задачей: вызов модели живёт минутами, а человек
    должен получить подтверждение сразу и увидеть ответ следующим опросом.
    """
    published = chat.post(body.project, body.author, body.text)
    for role in published["mentions"]:
        jobs.submit(kind="chat", project=body.project, role=role, task=body.text)
    return {"messages": [published]}


@app.post("/api/jobs", response_model=JobOut)
def create_job(body: JobIn) -> dict:
    """Ставит задачу в очередь и возвращает её карточку.

    Работа уходит в фон намеренно: вызов модели живёт минутами, и держать
    на нём HTTP-запрос значит терять результат вместе с вкладкой браузера.
    """
    if body.kind not in ("run", "council", "plan"):
        raise HTTPException(400, f"Недопустимый тип задачи: {body.kind}. "
                                 f"Бывают 'run', 'council' и 'plan'.")
    if body.project and body.project not in PROJECTS:
        raise HTTPException(404, f"нет пространства {body.project}")
    job = jobs.submit(kind=body.kind, project=body.project, role=body.role,
                      task=body.task, extra=body.extra, rounds=body.rounds,
                      apply_files=body.apply_files)
    return asdict(job)


@app.get("/api/jobs", response_model=JobsOut)
def list_jobs(limit: int = 50) -> dict:
    """Последние задачи, новые сверху, и сколько их сейчас в работе.

    Сюда же подмешивается работа из общего файлового реестра: вызовы моделей
    идут из разных процессов (MCP-сервер каждой сессии Claude Code, дашборд),
    и без этого запущенное главным архитектором в интерфейсе не видно.
    """
    dashboard_jobs = [asdict(job) for job in jobs.all_jobs(limit)]
    known = {job["id"] for job in dashboard_jobs}

    live: list[dict] = []
    for item in running.active():
        if item["id"] in known:
            continue
        live.append({
            "id": item["id"], "kind": "fleet", "source": item.get("source", ""),
            "session": item.get("session", ""), "project": item.get("project", ""),
            "role": item.get("role", ""), "task": item.get("task", ""),
            "status": "running", "started": item.get("ts", 0.0), "finished": None,
            "cost": 0.0, "tokens_in": 0, "tokens_out": 0, "error": "",
            "steps": [], "result": "",
        })

    return {"jobs": [*live, *dashboard_jobs], "active": len(jobs.active()) + len(live)}


@app.get("/api/jobs/{job_id}", response_model=JobOut)
def read_job(job_id: str) -> dict:
    """Одна задача целиком: статус, реплики агентов и результат."""
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, f"нет задачи {job_id}")
    return asdict(job)


@app.post("/api/run", response_model=RunOut)
def run(body: TaskIn) -> dict:
    """Запустить задачу на агенте прямо из интерфейса."""
    if body.project not in PROJECTS:
        raise HTTPException(404, f"нет пространства {body.project}")
    if body.role not in team.of(body.project).roles:
        raise HTTPException(404, f"нет агента {body.role} в пространстве {body.project}")
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
    # Оригиналы материалов лежат в папке проекта и в git не уезжают
    # (см. .gitignore): в репозитории живёт только выжимка, попавшая в context/.
    target = layout.uploads_dir(project) / f"{time.strftime('%Y%m%d-%H%M%S')}-{safe}"
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
        fields = dict(title=body.title, base_url=body.base_url, auth=body.auth,
                      key_env=body.key_env, verify_ssl=body.verify_ssl,
                      send_thinking=body.send_thinking)
        # None означает «не трогать прежние»: форма может не знать о заголовках,
        # которые прописали руками в team.json.
        if body.headers is not None:
            fields["headers"] = body.headers
        provider = team.set_provider(body.name, **fields)
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


@app.get("/api/provider/{name}/models", response_model=CatalogOut)
def provider_catalog(name: str) -> dict:
    """Список моделей провайдера — чтобы заводить их выбором, а не набором вручную."""
    # Состав провайдеров живёт в team.json и правится из дашборда: без sync
    # свежий процесс знает только умолчания из кода.
    team.sync()
    try:
        provider = get_provider(name)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    try:
        found = providers.catalog(provider)
    except Exception as exc:
        # Ошибку провайдера показываем как есть: в ней и написано, что не так.
        raise HTTPException(502, str(exc)[:400]) from exc
    for item in found:
        item["registered"] = item["id"] in MODELS
    return {"provider": name, "models": found}


@app.post("/api/model", response_model=SavedOut)
def model_save(body: ModelIn) -> dict:
    """Завести или изменить модель. id — то, что уходит в поле model запроса."""
    try:
        model = team.set_model(
            body.id, provider=body.provider, title=body.title, price_in=body.price_in,
            price_in_cached=body.price_in_cached, price_out=body.price_out,
            concurrency=body.concurrency, vision=body.vision, plan=body.plan,
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
    team.sync()
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


# Что считаем признаком репозитория в обзоре каталогов: по этим файлам собираются
# правила проекта (полный список — repo_rules.PATTERNS), их наличие и подсвечиваем.
REPO_MARKS = (".git", "CLAUDE.md", "AGENTS.md", ".cursorrules")


@app.get("/api/fs/dirs", response_model=DirsOut)
def list_dirs(path: str = "") -> dict:
    """Каталоги на машине команды — чтобы репозиторий выбирался мышью, а не набирался руками.

    Отдаются только имена каталогов, без файлов и без их содержимого. API слушает
    127.0.0.1 и живёт на той же машине, что и репозитории, — это тот же доступ,
    который уже есть у импорта правил, просто теперь его видно.
    """
    root = Path(path).expanduser() if path else Path.home()
    try:
        root = root.resolve()
    except OSError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not root.exists():
        raise HTTPException(404, f"нет каталога {root}")
    if not root.is_dir():
        raise HTTPException(400, f"{root} — не каталог")

    entries = []
    try:
        for item in sorted(root.iterdir(), key=lambda p: p.name.lower()):
            # Скрытые каталоги прячем: среди них нет рабочих деревьев, зато их сотни.
            if not item.is_dir() or item.name.startswith("."):
                continue
            entries.append({
                "name": item.name,
                "path": str(item),
                "is_repo": any((item / mark).exists() for mark in REPO_MARKS),
            })
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc

    return {
        "path": str(root),
        "parent": str(root.parent) if root.parent != root else None,
        "entries": entries,
    }


@app.get("/api/workspace/rules/probe", response_model=RulesFoundOut)
def workspace_rules_probe(project: str = "", repo: str = "") -> dict:
    """Что нашлось по маскам — до вызова модели.

    Человек должен видеть список файлов раньше, чем потратит время и токены
    на сжатие: если маски не те, это видно сразу.
    """
    team.sync()
    globs = PROJECTS[project].rule_globs if project in PROJECTS else []
    path = repo or (PROJECTS[project].repo if project in PROJECTS else "")
    if not path:
        raise HTTPException(400, "не указан каталог репозитория")
    try:
        files = repo_rules.probe(path, globs or None)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"repo": path, "files": files, "patterns": globs or list(repo_rules.PATTERNS)}


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
