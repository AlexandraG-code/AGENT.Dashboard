"""Чтение веба и поиск — бесплатный слой.

Проверено живьём: DuckDuckGo (html и lite) отдаёт антибот-заглушку,
Mojeek — 403, публичные SearXNG — 403/429. Поэтому поиск построен слоями,
а основной рабочей лошадкой сделано ЧТЕНИЕ страницы по ссылке: оно работает
всегда и закрывает большую часть реальных задач (документация, changelog,
issue на GitHub, RFC).
"""

import html
import os
import re
from urllib.parse import quote_plus

import httpx

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# Локальный SearXNG, если он поднят: docker run -d -p 8888:8080 searxng/searxng
SEARXNG = os.environ.get("SEARXNG_URL", "http://localhost:8888")


class SearchUnavailable(RuntimeError):
    """Все бесплатные поисковые бэкенды недоступны."""


def fetch(url: str, timeout: float = 30.0, limit: int = 60000) -> str:
    """Скачать страницу и вытащить из неё читаемый текст."""
    resp = httpx.get(url, headers={"User-Agent": UA}, timeout=timeout,
                     follow_redirects=True)
    resp.raise_for_status()
    raw = resp.text
    raw = re.sub(r"(?is)<(script|style|nav|footer|svg|noscript)[^>]*>.*?</\1>", " ", raw)
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text).strip()
    return text[:limit]


def searxng(query: str, count: int = 6) -> list[dict]:
    """Локальный SearXNG с JSON-выдачей."""
    r = httpx.get(f"{SEARXNG}/search",
                  params={"q": query, "format": "json", "language": "ru"},
                  headers={"User-Agent": UA}, timeout=20.0)
    r.raise_for_status()
    return [
        {"title": x.get("title", ""), "url": x.get("url", ""),
         "snippet": (x.get("content") or "")[:400]}
        for x in r.json().get("results", [])[:count]
    ]


def duckduckgo(query: str, count: int = 6) -> list[dict]:
    """Запасной путь: html-выдача DDG. Часто отдаёт антибот-заглушку."""
    r = httpx.post("https://html.duckduckgo.com/html/", data={"q": query},
                   headers={"User-Agent": UA, "Referer": "https://duckduckgo.com/"},
                   timeout=20.0, follow_redirects=True)
    out: list[dict] = []
    for m in re.finditer(
        r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', r.text, re.S
    ):
        url, title = m.group(1), re.sub(r"<[^>]+>", "", m.group(2))
        out.append({"title": html.unescape(title).strip(), "url": html.unescape(url),
                    "snippet": ""})
        if len(out) >= count:
            break
    return out


def search(query: str, count: int = 6) -> tuple[list[dict], str]:
    """Ищет по всем доступным бэкендам. Возвращает (результаты, имя бэкенда)."""
    errors = []
    for name, fn in (("searxng", searxng), ("duckduckgo", duckduckgo)):
        try:
            res = fn(query, count)
            if res:
                return res, name
            errors.append(f"{name}: пустая выдача")
        except Exception as exc:
            errors.append(f"{name}: {type(exc).__name__}")
    raise SearchUnavailable(
        "Бесплатный поиск недоступен (" + "; ".join(errors) + "). "
        "Подними локальный SearXNG: docker run -d -p 8888:8080 searxng/searxng — "
        "либо воспользуйся встроенным WebSearch самого Claude Code."
    )
