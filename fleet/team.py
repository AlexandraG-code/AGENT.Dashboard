"""Состав команды и список рабочих пространств, редактируемые из дашборда.

В коде (`config.py`) лежат только значения по умолчанию — то, с чем флот
поднимается на чистой машине. Всё, что человек правит руками, живёт в
`data/team.json` и перечитывается по mtime: добавил проект или агента в
дашборде — MCP-сервер это увидит сам, перезапускать его не нужно.

Промпты агентов тут не хранятся: они лежат отдельными файлами `roles/*.md`
(см. `roles.py`), потому что это тексты на страницу, а не конфигурация.
"""

import json
import re
from dataclasses import replace

from .config import DATA, MODELS, PROJECTS, PROVIDERS, ROLES, Model, Provider, Role

FILE = DATA / "team.json"
FIELDS = ("model", "thinking", "max_tokens", "temperature", "fallback", "description")
PROVIDER_FIELDS = ("title", "base_url", "auth", "key_env", "verify_ssl", "headers", "send_thinking")
MODEL_FIELDS = ("provider", "price_in", "price_in_cached", "price_out", "concurrency", "vision", "title")
AUTH_KINDS = ("bearer", "api-key", "gigachat")

_mtime = -1.0


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "-", value.strip().lower()).strip("-")


def _dump() -> dict:
    return {
        "projects": dict(PROJECTS),
        "roles": {
            name: {f: getattr(role, f) for f in FIELDS} for name, role in ROLES.items()
        },
        "providers": {
            name: {f: getattr(p, f) for f in PROVIDER_FIELDS} for name, p in PROVIDERS.items()
        },
        "models": {
            name: {f: getattr(m, f) for f in MODEL_FIELDS} for name, m in MODELS.items()
        },
    }


def save() -> None:
    """Записать текущий состав команды в data/team.json."""
    global _mtime
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(_dump(), ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    _mtime = FILE.stat().st_mtime


def sync() -> None:
    """Подтянуть состав из файла, если он менялся. Дёргается перед любым чтением ролей."""
    global _mtime
    if not FILE.exists():
        save()  # первый запуск: фиксируем умолчания из кода, дальше правит человек
        return
    mtime = FILE.stat().st_mtime
    if mtime == _mtime:
        return
    data = json.loads(FILE.read_text(encoding="utf-8"))
    _mtime = mtime

    projects = data.get("projects") or {}
    if projects:
        PROJECTS.clear()
        PROJECTS.update(projects)

    stored_providers = data.get("providers") or {}
    if stored_providers:
        PROVIDERS.clear()
        for name, cfg in stored_providers.items():
            PROVIDERS[name] = Provider(name=name, title=cfg.get("title", name),
                                       base_url=cfg.get("base_url", ""),
                                       **{f: cfg[f] for f in PROVIDER_FIELDS
                                          if f in cfg and f not in ("title", "base_url")})

    stored_models = data.get("models") or {}
    if stored_models:
        MODELS.clear()
        for name, cfg in stored_models.items():
            MODELS[name] = Model(id=name, **{f: cfg[f] for f in MODEL_FIELDS if f in cfg})

    roles = data.get("roles") or {}
    if roles:
        ROLES.clear()
        for name, cfg in roles.items():
            ROLES[name] = Role(name=name, **{f: cfg[f] for f in FIELDS if f in cfg})


def _clean(fields: dict) -> dict:
    """Привести присланное из формы к типам Role и проверить модели."""
    out: dict = {}
    if "model" in fields:
        out["model"] = str(fields["model"])
    if "description" in fields:
        out["description"] = str(fields["description"]).strip()
    if "thinking" in fields:
        out["thinking"] = bool(fields["thinking"])
    if "max_tokens" in fields:
        out["max_tokens"] = max(256, min(32000, int(fields["max_tokens"])))
    if "temperature" in fields:
        out["temperature"] = max(0.0, min(2.0, float(fields["temperature"])))
    if "fallback" in fields:
        fb = (fields["fallback"] or "").strip()
        out["fallback"] = fb or None

    for key in ("model", "fallback"):
        value = out.get(key)
        if value and value not in MODELS:
            raise ValueError(f"Нет модели {value!r}. Известны: {', '.join(MODELS)}")
    return out


def set_role(name: str, **fields) -> Role:
    """Создать или изменить агента. Возвращает готовую роль."""
    sync()
    slug = _slug(name)
    if not slug:
        raise ValueError("Пустое имя агента")
    base = ROLES.get(slug) or Role(name=slug, model="glm-5.3-flash")
    ROLES[slug] = replace(base, name=slug, **_clean(fields))
    save()
    return ROLES[slug]


def delete_role(name: str) -> None:
    """Убрать агента из состава. Его промпт остаётся в roles/ — вернуть роль можно без потерь."""
    sync()
    if name not in ROLES:
        raise KeyError(f"Нет агента {name!r}")
    if len(ROLES) <= 1:
        raise ValueError("Нельзя удалить последнего агента")
    del ROLES[name]
    save()


def set_project(project_id: str, title: str) -> str:
    """Создать или переименовать рабочее пространство."""
    sync()
    slug = _slug(project_id)
    if not slug:
        raise ValueError("Пустой идентификатор пространства")
    PROJECTS[slug] = title.strip() or slug
    save()
    return slug


def delete_project(project_id: str) -> None:
    """Убрать пространство из списка. Заметки в data/context остаются на диске."""
    sync()
    if project_id not in PROJECTS:
        raise KeyError(f"Нет пространства {project_id!r}")
    del PROJECTS[project_id]
    save()


def set_provider(name: str, **fields) -> Provider:
    """Завести или изменить провайдера. Ключ сюда не передаётся — он в secrets."""
    sync()
    slug = _slug(name)
    if not slug:
        raise ValueError("Пустое имя провайдера")
    auth = fields.get("auth", "bearer")
    if auth not in AUTH_KINDS:
        raise ValueError(f"Неизвестный способ авторизации {auth!r}. Доступны: {', '.join(AUTH_KINDS)}")
    base_url = str(fields.get("base_url", "")).strip().rstrip("/")
    if not base_url.startswith(("http://", "https://")):
        raise ValueError("Адрес должен начинаться с http:// или https://")

    base = PROVIDERS.get(slug)
    PROVIDERS[slug] = Provider(
        name=slug,
        title=str(fields.get("title") or (base.title if base else slug)),
        base_url=base_url,
        auth=auth,
        key_env=str(fields.get("key_env", base.key_env if base else "")),
        verify_ssl=bool(fields.get("verify_ssl", base.verify_ssl if base else True)),
        headers=dict(fields.get("headers") or (base.headers if base else {})),
        send_thinking=bool(fields.get("send_thinking", base.send_thinking if base else False)),
        builtin=base.builtin if base else False,
    )
    save()
    return PROVIDERS[slug]


def delete_provider(name: str) -> None:
    sync()
    if name not in PROVIDERS:
        raise KeyError(f"Нет провайдера {name!r}")
    used = [m for m, model in MODELS.items() if model.provider == name]
    if used:
        raise ValueError(f"На провайдере висят модели: {', '.join(used)}. Сначала убери их.")
    del PROVIDERS[name]
    save()


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
    )
    save()
    return MODELS[ident]


def delete_model(model_id: str) -> None:
    sync()
    if model_id not in MODELS:
        raise KeyError(f"Нет модели {model_id!r}")
    used = [r for r, role in ROLES.items() if model_id in (role.model, role.fallback)]
    if used:
        raise ValueError(f"Модель занята агентами: {', '.join(used)}. Сначала переведи их.")
    if len(MODELS) <= 1:
        raise ValueError("Нельзя удалить последнюю модель")
    del MODELS[model_id]
    save()
