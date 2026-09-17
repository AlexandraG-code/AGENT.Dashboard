"""Состав команды пространства и общий реестр провайдеров и моделей.

В коде нет ни одной роли и ни одного пространства: всё, что правит человек,
лежит в клоне данных и перечитывается по mtime — добавил агента в дашборде,
MCP-сервер увидит это сам, перезапускать его не нужно.

Разделение файлов отвечает на вопрос «что переезжает вместе с чем»:

- `projects/<проект>/team.json` — **состав команды этого пространства**: роли с
  их промптами, отделы, карточки регламентов и назначения. Команда у каждого
  проекта своя: у фронтенда на React и у фреймворка для LLM разные роли, разные
  промпты и разное представление о том, кто здесь senior. Папка проекта
  копируется целиком — вместе с командой.
- `registry.json` в корне данных — **провайдеры и модели**. Это свойство
  аккаунта, а не проекта: один и тот же DeepSeek, продублированный в пять
  пространств, разъедется в ценах и лимитах после первого же изменения тарифа.
- `paths.local.json` — пути к клонам репозиториев, они свои на каждой машине
  (см. `fleet.paths`).

Тексты регламентов лежат отдельными файлами (`fleet.charter`): многостраничный
документ внутри json неудобен ни человеку, ни git-у.
"""

import json
from dataclasses import dataclass, field, replace

from . import layout, paths
from .config import (ASSIGNMENTS, MODELS, PROJECTS, PROVIDERS, SCOPES, TOOLS,
                     Document, Model, Provider, Role, Team, Workspace)

FIELDS = ("model", "thinking", "max_tokens", "temperature", "fallback", "description",
          "lead", "external", "deputy", "icon", "prompt", "tools", "team")
TEAM_FIELDS = ("title", "description")
DOC_FIELDS = ("title", "scope", "team", "order")
PROJECT_FIELDS = ("title", "sign_code", "rule_globs")
PROVIDER_FIELDS = ("title", "base_url", "auth", "key_env", "verify_ssl", "headers", "send_thinking")
MODEL_FIELDS = ("provider", "price_in", "price_in_cached", "price_out", "concurrency",
                "vision", "title", "plan")
AUTH_KINDS = ("bearer", "api-key", "gigachat", "anthropic")

slug = layout.slug


@dataclass
class Composition:
    """Команда одного пространства: кто в ней есть и кто чем занят.

    Собрана в один объект намеренно. Пока состав лежал в глобальных словарях,
    «роль» означала одну роль на всё приложение; теперь у каждого пространства
    она своя, и любое чтение обязано сказать, в каком пространстве спрашивает.
    """

    project: str
    roles: dict[str, Role] = field(default_factory=dict)
    teams: dict[str, Team] = field(default_factory=dict)
    docs: dict[str, Document] = field(default_factory=dict)
    # Служебное действие → имя роли: «кто сжимает», «кто ведёт летопись».
    role_for: dict[str, str] = field(default_factory=dict)


_teams: dict[str, tuple[float, Composition]] = {}
_registry_mtime = -1.0
_projects_sig: tuple = ()


# --- пространства и реестр -------------------------------------------------

def _project_sig() -> tuple:
    """Отпечаток списка пространств: по нему видно, надо ли перечитывать.

    Только stat-ы, без разбора json: sync() дёргается перед каждым чтением
    состава, и полный обход файлов на каждом вызове обошёлся бы дороже пользы.
    """
    items = []
    for name in layout.known_projects():
        file = layout.project_file(name)
        items.append((name, file.stat().st_mtime if file.exists() else 0.0))
    local = paths.FILE
    return (tuple(items), local.stat().st_mtime if local.exists() else 0.0)


def _load_projects() -> None:
    PROJECTS.clear()
    for name in layout.known_projects():
        file = layout.project_file(name)
        cfg = json.loads(file.read_text(encoding="utf-8")) if file.exists() else {}
        PROJECTS[name] = Workspace(
            title=str(cfg.get("title", name)),
            # Путь к клону в файле пространства не хранится: он свой на каждой
            # машине, иначе после переезда пришлось бы править данные в git.
            repo=paths.repo_of(name),
            sign_code=bool(cfg.get("sign_code", True)),
            rule_globs=list(cfg.get("rule_globs") or []),
        )


def _load_registry() -> None:
    file = layout.REGISTRY
    if not file.exists():
        return
    data = json.loads(file.read_text(encoding="utf-8"))
    PROVIDERS.clear()
    for name, cfg in (data.get("providers") or {}).items():
        PROVIDERS[name] = Provider(
            name=name, title=cfg.get("title", name), base_url=cfg.get("base_url", ""),
            **{f: cfg[f] for f in PROVIDER_FIELDS if f in cfg and f not in ("title", "base_url")})
    MODELS.clear()
    for name, cfg in (data.get("models") or {}).items():
        MODELS[name] = Model(id=name, **{f: cfg[f] for f in MODEL_FIELDS if f in cfg})


def save_registry() -> None:
    """Записать провайдеров и модели. Ключей здесь нет — они в secrets."""
    data = {
        "providers": {n: {f: getattr(p, f) for f in PROVIDER_FIELDS} for n, p in PROVIDERS.items()},
        "models": {n: {f: getattr(m, f) for f in MODEL_FIELDS} for n, m in MODELS.items()},
    }
    global _registry_mtime
    layout.REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    layout.REGISTRY.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8")
    _registry_mtime = layout.REGISTRY.stat().st_mtime


def sync() -> None:
    """Подтянуть пространства и реестр, если на диске что-то менялось."""
    global _registry_mtime, _projects_sig
    sig = _project_sig()
    if sig != _projects_sig:
        _projects_sig = sig
        _load_projects()
    mtime = layout.REGISTRY.stat().st_mtime if layout.REGISTRY.exists() else -1.0
    if mtime != _registry_mtime:
        _registry_mtime = mtime
        _load_registry()


def project_of(project: str) -> Workspace:
    """Пространство по имени с понятной ошибкой вместо KeyError."""
    sync()
    if project not in PROJECTS:
        raise KeyError(f"Нет пространства {project!r}. Известны: {', '.join(PROJECTS) or 'ни одного'}")
    return PROJECTS[project]


# --- состав команды пространства -------------------------------------------

def of(project: str) -> Composition:
    """Команда пространства. Файл перечитывается при изменении."""
    sync()
    name = slug(project)
    if name not in PROJECTS:
        raise KeyError(f"Нет пространства {project!r}. Известны: {', '.join(PROJECTS) or 'ни одного'}")
    file = layout.team_file(name)
    mtime = file.stat().st_mtime if file.exists() else 0.0
    cached = _teams.get(name)
    if cached is not None and cached[0] == mtime:
        return cached[1]

    comp = Composition(project=name)
    if file.exists():
        data = json.loads(file.read_text(encoding="utf-8"))
        for role_name, cfg in (data.get("roles") or {}).items():
            comp.roles[role_name] = Role(name=role_name,
                                         **{f: cfg[f] for f in FIELDS if f in cfg})
        for team_name, cfg in (data.get("teams") or {}).items():
            comp.teams[team_name] = Team(name=team_name,
                                         project=name,
                                         **{f: cfg[f] for f in TEAM_FIELDS if f in cfg})
        for doc_id, cfg in (data.get("documents") or {}).items():
            comp.docs[doc_id] = Document(id=doc_id, title=cfg.get("title", doc_id),
                                         project=name,
                                         **{f: cfg[f] for f in DOC_FIELDS
                                            if f in cfg and f != "title"})
        # Назначение на несуществующую роль хуже пустого: молча уводит работу
        # в никуда, поэтому такие связи просто не поднимаем.
        comp.role_for.update({k: str(v) for k, v in (data.get("assignments") or {}).items()
                              if k in ASSIGNMENTS and str(v) in comp.roles})
    _teams[name] = (mtime, comp)
    return comp


def save(comp: Composition) -> None:
    """Записать состав команды пространства."""
    data = {
        "assignments": dict(comp.role_for),
        "teams": {n: {f: getattr(t, f) for f in TEAM_FIELDS} for n, t in comp.teams.items()},
        "documents": {i: {f: getattr(d, f) for f in DOC_FIELDS} for i, d in comp.docs.items()},
        "roles": {n: {f: getattr(r, f) for f in FIELDS} for n, r in comp.roles.items()},
    }
    file = layout.team_file(comp.project, create=True)
    file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _teams[comp.project] = (file.stat().st_mtime, comp)


# --- правка состава ---------------------------------------------------------

def _clean(fields: dict) -> dict:
    """Привести присланное из формы к типам Role и проверить модели."""
    out: dict = {}
    if "model" in fields:
        out["model"] = str(fields["model"])
    if "description" in fields:
        out["description"] = str(fields["description"]).strip()
    if "icon" in fields:
        # Одного символа хватает: это значок, а не подпись.
        out["icon"] = str(fields["icon"]).strip()[:4]
    if "prompt" in fields:
        out["prompt"] = str(fields["prompt"])
    if "team" in fields:
        out["team"] = slug(str(fields["team"]))
    if "tools" in fields:
        # Из формы приходит список; неизвестные инструменты приложение выдать
        # не может, поэтому оставляем только те, что оно понимает.
        given = fields["tools"] or []
        out["tools"] = [t for t in (str(x).strip() for x in given) if t in TOOLS]
    if "thinking" in fields:
        out["thinking"] = bool(fields["thinking"])
    for flag in ("lead", "external", "deputy"):
        if flag in fields:
            out[flag] = bool(fields[flag])
    if "max_tokens" in fields:
        out["max_tokens"] = max(256, min(32000, int(fields["max_tokens"])))
    if "temperature" in fields:
        out["temperature"] = max(0.0, min(2.0, float(fields["temperature"])))
    if "fallback" in fields:
        fb = (fields["fallback"] or "").strip()
        out["fallback"] = fb or None

    # Для внешних агентов (external) модель работает вне нашего клиента,
    # поэтому её имени может не быть в реестре MODELS — не проверяем.
    if not out.get("external"):
        for key in ("model", "fallback"):
            value = out.get(key)
            if value and value not in MODELS:
                raise ValueError(f"Нет модели {value!r}. Известны: {', '.join(MODELS)}")
    return out


def set_role(project: str, name: str, **fields) -> Role:
    """Создать или изменить агента в команде пространства."""
    comp = of(project)
    role_name = slug(name)
    if not role_name:
        raise ValueError("Пустое имя агента")
    base = comp.roles.get(role_name) or Role(name=role_name,
                                             model=next(iter(MODELS), ""))
    comp.roles[role_name] = replace(base, name=role_name, **_clean(fields))
    # Главный ровно один: иначе интерфейс не знает, кого поднимать наверх,
    # а человек — кто на самом деле раздаёт задачи.
    if comp.roles[role_name].lead:
        for other, role in comp.roles.items():
            if other != role_name and role.lead:
                comp.roles[other] = replace(role, lead=False)
    save(comp)
    return comp.roles[role_name]


def delete_role(project: str, name: str) -> None:
    """Убрать агента из команды пространства вместе с его назначениями."""
    comp = of(project)
    if name not in comp.roles:
        raise KeyError(f"Нет агента {name!r} в пространстве {project!r}")
    if len(comp.roles) <= 1:
        raise ValueError("Нельзя удалить последнего агента")
    del comp.roles[name]
    for key, who in list(comp.role_for.items()):
        if who == name:
            del comp.role_for[key]
    save(comp)


def set_assignment(project: str, key: str, role: str) -> None:
    """Назначить роль на служебное действие («кто сжимает», «кто ведёт летопись»).

    Пустое имя роли снимает назначение: тогда действие честно скажет, что
    исполнитель не выбран, вместо того чтобы уйти к случайному агенту.
    """
    comp = of(project)
    if key not in ASSIGNMENTS:
        raise KeyError(f"Нет назначения {key!r}. Известны: {', '.join(ASSIGNMENTS)}")
    if role and role not in comp.roles:
        raise ValueError(f"Нет роли {role!r} в пространстве {project!r}. Заведите её в дашборде.")
    if role:
        comp.role_for[key] = role
    else:
        comp.role_for.pop(key, None)
    save(comp)


def set_team(project: str, name: str, title: str = "", description: str | None = None) -> Team:
    """Завести или переименовать отдел.

    Отдел — просто группа агентов с общими регламентами. Приложение не знает
    ни одного отдела по имени: их состав и смысл задаёт человек.
    """
    comp = of(project)
    team_name = slug(name)
    if not team_name:
        raise ValueError("Пустое имя отдела")
    base = comp.teams.get(team_name) or Team(name=team_name, project=comp.project)
    comp.teams[team_name] = replace(
        base,
        name=team_name,
        project=comp.project,
        title=title.strip() or base.title or team_name,
        description=base.description if description is None else description.strip(),
    )
    save(comp)
    return comp.teams[team_name]


def delete_team(project: str, name: str) -> None:
    """Убрать отдел. Агенты остаются, но теряют приписку — их видно в списке «без отдела»."""
    comp = of(project)
    if name not in comp.teams:
        raise KeyError(f"Нет отдела {name!r}")
    del comp.teams[name]
    for role_name, role in list(comp.roles.items()):
        if role.team == name:
            comp.roles[role_name] = replace(role, team="")
    for doc_id, doc in list(comp.docs.items()):
        if doc.team == name:
            del comp.docs[doc_id]
    save(comp)


def set_document(project: str, doc_id: str, title: str, scope: str = "org",
                 team_name: str = "", order: int | None = None) -> Document:
    """Завести или изменить карточку регламента. Текст пишется отдельно (fleet.charter)."""
    comp = of(project)
    ident = slug(doc_id) or slug(title)
    if not ident:
        raise ValueError("Пустое имя регламента")
    if scope not in SCOPES:
        raise ValueError(f"Нет области {scope!r}. Известны: {', '.join(SCOPES)}")
    if scope == "team" and team_name not in comp.teams:
        raise ValueError("Регламент отдела без отдела")
    base = comp.docs.get(ident) or Document(id=ident, title=title)
    comp.docs[ident] = replace(base, id=ident, title=title.strip() or ident, scope=scope,
                               project=comp.project,
                               team=team_name if scope == "team" else "",
                               order=base.order if order is None else int(order))
    save(comp)
    return comp.docs[ident]


def delete_document(project: str, doc_id: str) -> None:
    """Убрать карточку регламента из состава. Файл с текстом удаляет fleet.charter."""
    comp = of(project)
    if doc_id not in comp.docs:
        raise KeyError(f"Нет регламента {doc_id!r}")
    del comp.docs[doc_id]
    save(comp)


# --- пространства -----------------------------------------------------------

def set_project(project_id: str, title: str, repo: str | None = None,
                sign_code: bool | None = None, rule_globs: list[str] | None = None,
                data_dir: str | None = None, copy_from: str = "") -> str:
    """Создать или изменить рабочее пространство.

    `repo` — путь к клону репозитория, `data_dir` — папка с данными проекта,
    если человек выбрал её вне общего клона. Оба пути свои на каждой машине и
    уходят в `paths.local.json`, а не в данные. None у любого поля означает
    «не трогать прежнее».

    `copy_from` — взять состав команды из другого пространства. У нового
    пространства команды нет вообще, а собирать десять ролей с нуля ради
    соседнего проекта на том же стеке — работа впустую.
    """
    sync()
    name = slug(project_id)
    if not name:
        raise ValueError("Пустой идентификатор пространства")

    if data_dir is not None:
        paths.set_path(name, data=data_dir)
    if repo is not None:
        path = repo.strip()
        if path:
            # Один каталог у двух пространств запрещён: тогда по рабочему
            # каталогу нельзя понять, куда писать заметки.
            from pathlib import Path as _Path
            taken = [pid for pid, space in PROJECTS.items()
                     if pid != name and space.repo and _Path(space.repo) == _Path(path)]
            if taken:
                raise ValueError(f"Этот каталог уже занят пространством {taken[0]!r}")
        paths.set_path(name, repo=path)

    file = layout.project_file(name, create=True)
    stored = json.loads(file.read_text(encoding="utf-8")) if file.exists() else {}
    fresh = not file.exists()
    stored["title"] = title.strip() or stored.get("title") or name
    if sign_code is not None:
        stored["sign_code"] = bool(sign_code)
    if rule_globs is not None:
        stored["rule_globs"] = list(rule_globs)
    file.write_text(json.dumps({f: stored.get(f, Workspace(title=name).__dict__[f])
                                for f in PROJECT_FIELDS}, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")

    global _projects_sig
    _projects_sig = ()
    sync()

    if fresh and copy_from:
        donor = of(copy_from)
        save(Composition(project=name, roles=dict(donor.roles), teams=dict(donor.teams),
                         docs=dict(donor.docs), role_for=dict(donor.role_for)))
    return name


def delete_project(project_id: str) -> None:
    """Убрать пространство из списка. Данные на диске остаются.

    Папка проекта не удаляется намеренно: в ней летопись и контекст, нажитые
    за месяцы, а нажатие в интерфейсе — слишком дешёвое действие для такой цены.
    """
    sync()
    if project_id not in PROJECTS:
        raise KeyError(f"Нет пространства {project_id!r}")
    file = layout.project_file(project_id)
    if file.exists():
        # Помечаем папку как отвязанную: без project.json она перестаёт быть
        # пространством, но остаётся на диске и подключается обратно.
        file.rename(file.with_suffix(".json.off"))
    paths.forget(project_id)
    _teams.pop(project_id, None)
    global _projects_sig
    _projects_sig = ()
    sync()


# --- провайдеры и модели ----------------------------------------------------

def set_provider(name: str, **fields) -> Provider:
    """Завести или изменить провайдера. Ключ сюда не передаётся — он в secrets."""
    sync()
    ident = slug(name)
    if not ident:
        raise ValueError("Пустое имя провайдера")
    auth = fields.get("auth", "bearer")
    if auth not in AUTH_KINDS:
        raise ValueError(f"Неизвестный способ авторизации {auth!r}. Доступны: {', '.join(AUTH_KINDS)}")
    base_url = str(fields.get("base_url", "")).strip().rstrip("/")
    if not base_url.startswith(("http://", "https://")):
        raise ValueError("Адрес должен начинаться с http:// или https://")

    base = PROVIDERS.get(ident)
    PROVIDERS[ident] = Provider(
        name=ident,
        title=str(fields.get("title") or (base.title if base else ident)),
        base_url=base_url,
        auth=auth,
        key_env=str(fields.get("key_env", base.key_env if base else "")),
        verify_ssl=bool(fields.get("verify_ssl", base.verify_ssl if base else True)),
        headers=dict(fields.get("headers") or (base.headers if base else {})),
        send_thinking=bool(fields.get("send_thinking", base.send_thinking if base else False)),
        builtin=base.builtin if base else False,
    )
    save_registry()
    return PROVIDERS[ident]


def delete_provider(name: str) -> None:
    sync()
    if name not in PROVIDERS:
        raise KeyError(f"Нет провайдера {name!r}")
    used = [m for m, model in MODELS.items() if model.provider == name]
    if used:
        raise ValueError(f"На провайдере висят модели: {', '.join(used)}. Сначала убери их.")
    del PROVIDERS[name]
    save_registry()


def set_model(model_id: str, **fields) -> Model:
    """Завести или изменить модель. Идентификатор — то, что уходит в поле model запроса."""
    sync()
    ident = (model_id or "").strip()
    if not ident:
        raise ValueError("Пустой идентификатор модели")
    provider_name = str(fields.get("provider", ""))
    if provider_name not in PROVIDERS:
        raise ValueError(f"Нет провайдера {provider_name!r}. Сначала заведи его.")

    base = MODELS.get(ident)
    MODELS[ident] = Model(
        id=ident,
        provider=provider_name,
        price_in=float(fields.get("price_in", base.price_in if base else 0.0)),
        price_in_cached=float(fields.get("price_in_cached", base.price_in_cached if base else 0.0)),
        price_out=float(fields.get("price_out", base.price_out if base else 0.0)),
        concurrency=max(1, int(fields.get("concurrency", base.concurrency if base else 3))),
        vision=bool(fields.get("vision", base.vision if base else False)),
        title=str(fields.get("title", base.title if base else "")),
        plan=str(fields.get("plan", base.plan if base else "")),
    )
    save_registry()
    return MODELS[ident]


def delete_model(model_id: str) -> None:
    """Убрать модель. Занятость проверяется по всем пространствам сразу.

    Реестр общий, а команды разные: модель, свободная в одном пространстве,
    может быть рабочей лошадью в соседнем.
    """
    sync()
    if model_id not in MODELS:
        raise KeyError(f"Нет модели {model_id!r}")
    busy: list[str] = []
    for project in PROJECTS:
        for role in of(project).roles.values():
            if model_id in (role.model, role.fallback):
                busy.append(f"{project}/{role.name}")
    if busy:
        raise ValueError(f"Модель занята агентами: {', '.join(busy)}. Сначала переведи их.")
    if len(MODELS) <= 1:
        raise ValueError("Нельзя удалить последнюю модель")
    del MODELS[model_id]
    save_registry()
