"""Как представляться провайдеру: заголовки, адрес и особые случаи.

Четыре способа авторизации покрывают всё, что нам нужно:
- bearer — GLM, DeepSeek и любой OpenAI-совместимый эндпоинт;
- api-key — Yandex Cloud (`Authorization: Api-Key <ключ>`);
- gigachat — Сбер, где ключ сначала меняется на access_token со сроком жизни;
- anthropic — Claude: свой заголовок ключа и свой протокол (см. `anthropic.py`).
"""

import base64
import time
import uuid

import httpx

from . import anthropic
from .config import Provider

GIGACHAT_OAUTH = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
GIGACHAT_SCOPE = "GIGACHAT_API_PERS"

# access_token GigaChat живёт 30 минут — держим его, пока не протух.
_tokens: dict[str, tuple[float, str]] = {}


# Каталог Yandex Cloud: без него имя модели для него бессмысленно.
FOLDER_HEADER = "x-folder-id"


def model_ref(provider: Provider, model_id: str) -> str:
    """Как назвать модель в запросе к этому провайдеру.

    Yandex Cloud принимает не имя, а URI `gpt://<каталог>/<модель>/<версия>` и на
    короткое имя отвечает «Failed to parse model URI». Каталог берётся из
    заголовка x-folder-id провайдера, версия — `latest`, если её не указали.
    Собирается это здесь, а не в реестре моделей: каталог принадлежит провайдеру,
    и хранить его копию в каждой модели значит развести две версии правды.

    Полный URI, введённый руками, не трогаем: у превью-моделей встречаются свои
    схемы (`art://`, `emb://`), и переписывать их нечем.
    """
    folder = provider.headers.get(FOLDER_HEADER, "").strip()
    if not folder or "://" in model_id:
        return model_id
    parts = [part for part in model_id.strip("/").split("/") if part]
    if not parts:
        return model_id
    version = parts[1] if len(parts) > 1 else "latest"
    return f"gpt://{folder}/{parts[0]}/{version}"


def chat_url(provider: Provider) -> str:
    if provider.auth == "anthropic":
        return anthropic.url(provider)
    return f"{provider.base_url.rstrip('/')}/chat/completions"


def _gigachat_token(provider: Provider) -> str:
    cached = _tokens.get(provider.name)
    if cached and cached[0] > time.time() + 60:
        return cached[1]

    key = provider.api_key
    # Ключ авторизации из личного кабинета — это уже base64(client_id:secret).
    # Если дали пару через двоеточие, кодируем сами.
    basic = key if ":" not in key else base64.b64encode(key.encode()).decode()
    resp = httpx.post(
        GIGACHAT_OAUTH,
        headers={
            "Authorization": f"Basic {basic}",
            "RqUID": str(uuid.uuid4()),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"scope": GIGACHAT_SCOPE},
        timeout=30,
        verify=provider.verify_ssl,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data["access_token"]
    # expires_at приходит в миллисекундах.
    _tokens[provider.name] = (data.get("expires_at", 0) / 1000 or time.time() + 1500, token)
    return token


def headers(provider: Provider) -> dict[str, str]:
    if provider.auth == "anthropic":
        return anthropic.headers(provider)
    if provider.auth == "api-key":
        auth = f"Api-Key {provider.api_key}"
    elif provider.auth == "gigachat":
        auth = f"Bearer {_gigachat_token(provider)}"
    else:
        auth = f"Bearer {provider.api_key}"
    return {"Authorization": auth, "Content-Type": "application/json", **provider.headers}


def check(provider: Provider, model_id: str = "") -> dict:
    """Проверка связи: сходить к провайдеру и вернуть его ответ как есть.

    Молча «не работает» — бесполезный ответ, поэтому наружу отдаётся ровно то,
    что сказал провайдер: код HTTP и его текст ошибки. Чаще всего там прямым
    текстом написано, что не так с ключом, адресом или именем модели.
    """
    started = time.monotonic()
    try:
        head = headers(provider)
    except Exception as exc:  # нет ключа или не вышел обмен на токен GigaChat
        return {"ok": False, "status": 0, "message": str(exc)[:400],
                "detail": "", "seconds": 0.0, "model": model_id}

    url = chat_url(provider) if model_id else f"{provider.base_url.rstrip('/')}/models"
    payload = {"model": model_ref(provider, model_id),
               "messages": [{"role": "user", "content": "ping"}],
               "max_tokens": 8} if model_id else None
    try:
        with httpx.Client(timeout=30, verify=provider.verify_ssl) as http:
            resp = http.post(url, headers=head, json=payload) if payload else http.get(url, headers=head)
    except Exception as exc:
        return {"ok": False, "status": 0, "message": f"{type(exc).__name__}: {exc}"[:400],
                "detail": "", "seconds": round(time.monotonic() - started, 2), "model": model_id}

    seconds = round(time.monotonic() - started, 2)
    body = resp.text[:600]
    try:
        data = resp.json()
    except ValueError:
        data = {}

    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        message = str(error.get("message") or error)
    elif error:
        message = str(error)
    elif isinstance(data, dict) and data.get("message") and not data.get("choices"):
        message = str(data["message"])
    else:
        message = ""

    ok = resp.status_code < 400 and not message
    if ok and model_id and provider.auth == "anthropic":
        answer = anthropic.read(data, model_id)["text"]
    elif ok and model_id:
        answer = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        message = f"ответила: {answer.strip()[:80]}" if answer.strip() else "ответ получен"
    elif ok:
        listed = len(data.get("data") or []) if isinstance(data, dict) else 0
        message = f"связь есть, моделей в каталоге: {listed}" if listed else "связь есть"

    return {"ok": ok, "status": resp.status_code, "message": message[:400],
            "detail": "" if ok else body, "seconds": seconds, "model": model_id}


def short_ref(provider: Provider, model_id: str) -> str:
    """Как эту модель записать в реестр.

    Обратная сторона `model_ref`: Yandex отдаёт в каталоге полные URI со своим
    folder id, а хранить каталог в имени модели незачем — он и так есть у
    провайдера. Всё остальное остаётся как прислали.
    """
    folder = provider.headers.get(FOLDER_HEADER, "").strip()
    prefix = f"gpt://{folder}/"
    if not folder or not model_id.startswith(prefix):
        return model_id
    rest = model_id[len(prefix):]
    name, _, version = rest.partition("/")
    return name if version in ("", "latest") else f"{name}/{version}"


def catalog(provider: Provider) -> list[dict]:
    """Модели, которые провайдер отдаёт в своём каталоге.

    Списком владеет провайдер, а не мы: набирать имена моделей руками — верный
    способ получить опечатку, которая вылезет только на первом вызове. Наружу
    отдаём ровно то, что он прислал (`owned_by`, `type`) — ничего не додумывая;
    чего в каталоге нет, по-прежнему можно вписать вручную.
    """
    with httpx.Client(timeout=30, verify=provider.verify_ssl) as http:
        resp = http.get(f"{provider.base_url.rstrip('/')}/models", headers=headers(provider))
    resp.raise_for_status()
    data = resp.json()
    items = data.get("data") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return []
    found = []
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id") or "")
        if not model_id:
            continue
        found.append({
            "id": short_ref(provider, model_id),
            "raw": model_id,
            "owned_by": str(item.get("owned_by") or ""),
            "kind": str(item.get("type") or item.get("object") or ""),
        })
    return sorted(found, key=lambda item: item["id"].lower())
