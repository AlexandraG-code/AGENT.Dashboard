"""Единый клиент к моделям команды.

Основной протокол — OpenAI-совместимый (GLM, DeepSeek, Yandex, GigaChat).
Claude говорит на своём, поэтому у провайдера с авторизацией `anthropic`
тело запроса и разбор ответа берутся из `anthropic.py`; всё остальное —
лимиты, fallback, журнал, стоимость — общее. Важные особенности,
выясненные живыми запросами:
  * GLM отвечает только через coding-эндпоинт, часть имён моделей молча подменяется;
  * DeepSeek V4 по умолчанию РАЗМЫШЛЯЕТ, и размышления биллятся как выход,
    поэтому thinking выключается явно через {"type": "disabled"}
    (reasoning_effort="minimal" не работает — проверено);
  * max_tokens у обоих провайдеров ограничивает ВЕСЬ выход, включая размышления,
    поэтому у думающей роли лимит легко уходит целиком в раздумья, а ответ
    приходит пустым. Лечится headroom-ом: max_tokens роли означает длину ОТВЕТА,
    а бюджет на размышления добавляется сверху (см. REASONING_HEADROOM);
  * у DeepSeek есть автоматический префиксный кэш (в 50 раз дешевле), поэтому
    неизменный блок контекста проекта всегда идёт в начало промпта.
"""

import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from . import anthropic, log, providers, running, transcript
from .config import MODELS, Model, provider as get_provider


class FleetError(RuntimeError):
    pass


# Запас токенов на размышления сверх лимита ответа и потолок запроса.
REASONING_HEADROOM = 9000
MAX_TOKENS_CAP = 32000


@dataclass
class Answer:
    text: str
    model: str
    role: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    tokens_cached: int = 0
    tokens_reasoning: int = 0
    cost: float = 0.0
    seconds: float = 0.0
    reasoning: str = ""
    meta: dict = field(default_factory=dict)

    def __str__(self) -> str:
        return self.text


def _payload(model: Model, messages: list[dict], thinking: bool, max_tokens: int,
             temperature: float) -> dict:
    """Тело запроса для OpenAI-совместимого провайдера."""
    body: dict[str, Any] = {
        # Имя модели в запросе не всегда равно её идентификатору в реестре:
        # Yandex ждёт URI с каталогом (см. providers.model_ref).
        "model": providers.model_ref(get_provider(model.provider), model.id),
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    # Оба провайдера понимают этот ключ; выключение экономит выходные токены.
    # Параметр понимают GLM и DeepSeek; сторонним OpenAI-совместимым эндпоинтам
    # (Yandex, GigaChat) лишнее поле ломает запрос, поэтому оно опционально.
    if get_provider(model.provider).send_thinking:
        body["thinking"] = {"type": "enabled" if thinking else "disabled"}
    return body


def _budget(max_tokens: int, thinking: bool, headroom: int = REASONING_HEADROOM) -> int:
    """Сколько токенов просить у модели, чтобы ответ пережил размышления."""
    return min(MAX_TOKENS_CAP, max_tokens + (headroom if thinking else 0))


def _read(data: dict, requested: str) -> dict:
    """Ответ OpenAI-совместимого провайдера в полях Answer."""
    choice = data["choices"][0]["message"]
    usage = data.get("usage", {}) or {}
    details = usage.get("completion_tokens_details") or {}
    cached = usage.get("prompt_cache_hit_tokens") or (
        usage.get("prompt_tokens_details") or {}
    ).get("cached_tokens") or 0
    return {
        "text": (choice.get("content") or "").strip(),
        "model": data.get("model", requested),
        "tokens_in": usage.get("prompt_tokens", 0),
        "tokens_out": usage.get("completion_tokens", 0),
        "tokens_cached": cached,
        "tokens_reasoning": details.get("reasoning_tokens", 0) or 0,
        "reasoning": (choice.get("reasoning_content") or "").strip(),
    }


def call(
    model_id: str,
    messages: list[dict],
    *,
    role: str = "",
    project: str = "",
    thinking: bool = False,
    max_tokens: int = 4000,
    temperature: float = 0.3,
    timeout: float = 180.0,
    fallback: str | None = None,
    task: str = "",
    _headroom: int = REASONING_HEADROOM,
) -> Answer:
    """Один запрос к модели. Логирует стоимость, при сбое пробует fallback."""
    model = MODELS.get(model_id)
    if model is None:
        raise FleetError(f"Неизвестная модель: {model_id}")

    provider = get_provider(model.provider)
    claude = provider.auth == "anthropic"
    started = time.monotonic()
    # Регистрируем до сетевого обращения: упавший вызов тоже должен быть виден в реестре.
    task_id = running.start("fleet", role, model_id, project, task)
    try:
        # Клиент на запрос, а не глобальный: у провайдеров разная проверка TLS
        # (у GigaChat цепочка подписана НУЦ Минцифры и системным хранилищем не берётся).
        with httpx.Client(timeout=timeout, verify=provider.verify_ssl) as http:
            resp = http.post(
                providers.chat_url(provider),
                headers=providers.headers(provider),
                json=(
                    anthropic.payload(model, messages, thinking, _budget(max_tokens, thinking, _headroom))
                    if claude
                    else _payload(model, messages, thinking,
                                  _budget(max_tokens, thinking, _headroom), temperature)
                ),
            )
        data = resp.json()
    except Exception as exc:  # сеть, таймаут, невалидный json
        log.emit("error", role=role, model=model_id, project=project, error=str(exc)[:400])
        running.finish(task_id, False, error=str(exc)[:400])
        if fallback:
            return call(fallback, messages, role=role, project=project, thinking=thinking,
                        max_tokens=max_tokens, temperature=temperature, timeout=timeout,
                        task=task)
        raise FleetError(f"{model_id}: {exc}") from exc

    if "error" in data:
        msg = str(data["error"].get("message", data["error"]))[:400]
        log.emit("error", role=role, model=model_id, project=project, error=msg)
        running.finish(task_id, False, error=msg)
        if fallback:
            return call(fallback, messages, role=role, project=project, thinking=thinking,
                        max_tokens=max_tokens, temperature=temperature, timeout=timeout,
                        task=task)
        raise FleetError(f"{model_id}: {msg}")

    fields = anthropic.read(data, model_id) if claude else _read(data, model_id)
    ans = Answer(role=role, seconds=round(time.monotonic() - started, 2), **fields)
    # Считаем по фактически ответившей модели: GLM умеет подменить её на другую.
    billed = MODELS.get(ans.model, model)
    ans.cost = billed.cost(ans.tokens_in, ans.tokens_out, ans.tokens_cached)

    if ans.model != model_id:
        ans.meta["substituted"] = f"{model_id} → {ans.model}"

    call_id = transcript.save(ans, messages, project=project, requested=model_id, task=task)
    log.emit(
        "call", id=call_id, role=role, model=ans.model, requested=model_id, project=project,
        task=task[:200], tokens_in=ans.tokens_in, tokens_out=ans.tokens_out,
        tokens_cached=ans.tokens_cached, tokens_reasoning=ans.tokens_reasoning,
        cost=ans.cost, seconds=ans.seconds, chars_out=len(ans.text),
    )
    if not ans.text:
        # Размышления съели весь бюджет. Один раз пробуем с удвоенным запасом,
        # потом уходим в fallback — иначе роль молча выпадает из работы.
        if ans.tokens_reasoning and _headroom < REASONING_HEADROOM * 4:
            log.emit("retry", role=role, model=ans.model, project=project,
                     reason="пустой ответ, размышления сожгли бюджет",
                     reasoning=ans.tokens_reasoning, headroom=_headroom)
            running.finish(task_id, False, error="пустой ответ, размышления сожгли бюджет")
            return call(model_id, messages, role=role, project=project,
                        thinking=thinking, max_tokens=max_tokens,
                        temperature=temperature, timeout=timeout,
                        fallback=fallback, task=task,
                        _headroom=_headroom * 3)
        msg = (f"{ans.model} вернул пустой ответ "
               f"(размышления сожгли {ans.tokens_reasoning} токенов)")
        log.emit("error", role=role, model=ans.model, project=project, error=msg)
        running.finish(task_id, False, error=msg)
        if fallback:
            return call(fallback, messages, role=role, project=project,
                        thinking=thinking, max_tokens=max_tokens,
                        temperature=temperature, timeout=timeout, task=task)
        raise FleetError(msg)
    running.finish(task_id, True, ans.cost)
    return ans
