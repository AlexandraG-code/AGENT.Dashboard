"""Как представляться провайдеру: заголовки, адрес и особые случаи.

Три способа авторизации покрывают всё, что нам нужно:
- bearer — GLM, DeepSeek и любой OpenAI-совместимый эндпоинт;
- api-key — Yandex Cloud (`Authorization: Api-Key <ключ>`);
- gigachat — Сбер, где ключ сначала меняется на access_token со сроком жизни.
"""

import base64
import time
import uuid

import httpx

from .config import Provider

GIGACHAT_OAUTH = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
GIGACHAT_SCOPE = "GIGACHAT_API_PERS"

# access_token GigaChat живёт 30 минут — держим его, пока не протух.
_tokens: dict[str, tuple[float, str]] = {}


def chat_url(provider: Provider) -> str:
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
    payload = {"model": model_id, "messages": [{"role": "user", "content": "ping"}],
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
    if ok and model_id:
        answer = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        message = f"ответила: {answer.strip()[:80]}" if answer.strip() else "ответ получен"
    elif ok:
        listed = len(data.get("data") or []) if isinstance(data, dict) else 0
        message = f"связь есть, моделей в каталоге: {listed}" if listed else "связь есть"

    return {"ok": ok, "status": resp.status_code, "message": message[:400],
            "detail": "" if ok else body, "seconds": seconds, "model": model_id}
