"""Диалект Anthropic: Claude говорит не на OpenAI-совместимом протоколе.

Отличий ровно столько, что общий клиент их не переваривает:
  * адрес `/v1/messages`, а не `/chat/completions`;
  * ключ едет в заголовке `x-api-key`, а не в `Authorization`, и обязателен
    заголовок версии API;
  * системный промпт — отдельное поле `system`, а не сообщение с ролью system;
  * ответ приходит списком блоков (`text`, `thinking`), а не строкой;
  * `temperature` у моделей 4.6 и новее УБРАН из API: запрос с ним отвергается
    четырёхсоткой, поэтому температура роли здесь не отправляется;
  * размышления включаются как `{"type": "adaptive"}` — фиксированный бюджет
    токенов (`budget_tokens`) на этих моделях тоже отвергается.

Цены на вызовы задаются в реестре моделей руками: тарифы Anthropic провайдер
в ответе не отдаёт, а придумывать их в отчёте о расходах нельзя.
"""

from typing import Any

from .config import Model, Provider

VERSION = "2023-06-01"


def url(provider: Provider) -> str:
    return f"{provider.base_url.rstrip('/')}/messages"


def headers(provider: Provider) -> dict[str, str]:
    return {
        "x-api-key": provider.api_key,
        "anthropic-version": VERSION,
        "Content-Type": "application/json",
        **provider.headers,
    }


def payload(model: Model, messages: list[dict], thinking: bool, max_tokens: int) -> dict:
    """Тело запроса Messages API. Системные сообщения вынимаются в поле system."""
    system = "\n\n".join(
        str(m.get("content", "")) for m in messages if m.get("role") == "system"
    ).strip()
    body: dict[str, Any] = {
        "model": model.id,
        "max_tokens": max_tokens,
        "messages": [m for m in messages if m.get("role") != "system"],
    }
    if system:
        body["system"] = system
    # Выключать размышления явно не просим: на части моделей это отдельная
    # четырёхсотка, а на Opus 5 они и так включены по умолчанию.
    if thinking:
        body["thinking"] = {"type": "adaptive"}
    return body


def read(data: dict, requested: str) -> dict:
    """Ответ Messages API в тех же полях, что и у OpenAI-совместимых провайдеров."""
    blocks = data.get("content") or []
    text = "\n".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
    reasoning = "\n".join(
        b.get("thinking", "") for b in blocks if b.get("type") == "thinking"
    ).strip()
    usage = data.get("usage") or {}
    # cache_creation — это тоже вход, просто оплаченный по другой ставке.
    tokens_in = (
        (usage.get("input_tokens") or 0)
        + (usage.get("cache_creation_input_tokens") or 0)
        + (usage.get("cache_read_input_tokens") or 0)
    )
    return {
        "text": text,
        "model": data.get("model") or requested,
        "tokens_in": tokens_in,
        "tokens_out": usage.get("output_tokens") or 0,
        "tokens_cached": usage.get("cache_read_input_tokens") or 0,
        # Отдельного счётчика размышлений в ответе нет: они уже посчитаны в выходе.
        "tokens_reasoning": 0,
        "reasoning": reasoning,
    }
