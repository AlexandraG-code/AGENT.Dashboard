"""Слой делегирования: как главный архитектор поручает работу флоту.

Топология — звезда, а не общий чат. Свободная переписка агентов между собой
жжёт токены и уплывает от задачи, поэтому обсуждение выполняется ЗДЕСЬ,
внутри процесса, а наружу отдаётся только результат: позиции и разногласия.
"""

import base64
import mimetypes
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import client, context, log, roles, web
from .config import MODELS


def _messages(role, project: str, task: str, extra: str = "", retrieve: bool = True):
    """Собирает промпт. Порядок важен: неизменное — строго первым (префиксный кэш)."""
    blocks = []
    if project:
        blocks.append(context.build(project, task, extra=extra, retrieve=retrieve))
    elif extra:
        blocks.append(extra)
    blocks.append(f"# Задача\n\n{task}")
    return [
        {"role": "system", "content": role.prompt},
        {"role": "user", "content": "\n\n---\n\n".join(blocks)},
    ]


def ask(role_name: str, task: str, project: str = "", extra: str = "",
        retrieve: bool = True, max_tokens: int | None = None) -> client.Answer:
    """Поручить задачу роли и получить ответ."""
    role = roles.get(role_name)
    return client.call(
        role.model,
        _messages(role, project, task, extra, retrieve),
        role=role_name,
        project=project,
        thinking=role.thinking,
        max_tokens=max_tokens or role.max_tokens,
        temperature=role.temperature,
        fallback=role.fallback,
        task=task,
    )


def batch(tasks: list[str], project: str = "", role_name: str = "junior",
          extra: str = "") -> list[dict]:
    """Раздать пачку однотипных задач параллельно.

    Смысл в том, что у glm-5.3-flash лимит параллелизма 50 и нулевая цена —
    десять мелких правок разумно делать одновременно, а не по очереди.
    """
    role = roles.get(role_name)
    workers = min(len(tasks), MODELS[role.model].concurrency, 12)

    def one(item: tuple[int, str]) -> dict:
        i, t = item
        try:
            a = ask(role_name, t, project, extra)
            return {"n": i, "task": t, "ok": True, "text": a.text,
                    "cost": a.cost, "model": a.model}
        except Exception as exc:
            return {"n": i, "task": t, "ok": False, "error": str(exc)[:300]}

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        out = list(pool.map(one, enumerate(tasks, 1)))
    return sorted(out, key=lambda r: r["n"])


def council(topic: str, project: str = "", rounds: int = 2,
            extra: str = "") -> dict:
    """Совет: консультант предлагает, оппонент атакует, консультант отвечает.

    Оппонент намеренно из другой семьи моделей (DeepSeek против GLM): две модели
    одной семьи ошибаются одинаково и охотно соглашаются друг с другом, а такой
    совет бесполезен. Наружу уходят позиции и разногласия — решение принимает
    главный архитектор, а не совет.
    """
    transcript: list[dict] = []
    cost = 0.0

    proposal = ask("consultant", topic, project, extra)
    cost += proposal.cost
    transcript.append({"speaker": "consultant", "model": proposal.model,
                       "text": proposal.text})

    last = proposal.text
    for i in range(max(1, rounds)):
        attack = ask(
            "opponent",
            f"Разбери предложенное решение и найди, где оно неверно.\n\n"
            f"# Обсуждаемый вопрос\n{topic}\n\n"
            f"# Позиция консультанта\n{last}",
            project, extra, retrieve=False,
        )
        cost += attack.cost
        transcript.append({"speaker": "opponent", "model": attack.model,
                           "text": attack.text})

        if i == rounds - 1:
            break

        reply = ask(
            "consultant",
            f"Оппонент возразил. Ответь: с чем соглашаешься и меняешь позицию, "
            f"а что отводишь и почему.\n\n"
            f"# Вопрос\n{topic}\n\n# Твоя позиция\n{last}\n\n"
            f"# Возражения\n{attack.text}",
            project, extra, retrieve=False,
        )
        cost += reply.cost
        transcript.append({"speaker": "consultant", "model": reply.model,
                           "text": reply.text})
        last = reply.text

    log.emit("council", project=project, topic=topic[:200],
             rounds=rounds, cost=cost, turns=len(transcript))
    return {"topic": topic, "transcript": transcript, "cost": round(cost, 5)}


def read_page(url: str, question: str = "") -> dict:
    """Прочитать страницу и сжать её до выжимки фактов (замена Web-Reader)."""
    text = web.fetch(url)
    q = question or "Изложи содержание страницы по существу."
    a = ask("condenser", f"{q}\n\n# Текст страницы {url}\n\n{text}", retrieve=False)
    return {"url": url, "chars": len(text), "summary": a.text, "cost": a.cost}


def research(query: str, project: str = "", pages: int = 3) -> dict:
    """Поиск + чтение найденного + сжатие. Роль «второго архитектора, который ищет»."""
    results, backend = web.search(query, count=max(pages + 2, 5))
    read: list[dict] = []
    cost = 0.0
    for item in results[:pages]:
        try:
            r = read_page(item["url"], question=query)
            read.append({"title": item["title"], **r})
            cost += r["cost"]
        except Exception as exc:
            read.append({"title": item["title"], "url": item["url"],
                         "error": str(exc)[:200]})

    joined = "\n\n".join(
        f"## {r['title']}\n{r.get('summary') or r.get('error', '')}\nИсточник: {r['url']}"
        for r in read
    )
    final = ask(
        "condenser",
        f"Сведи материалы источников в один ответ на вопрос.\n"
        f"Отметь, если источники противоречат друг другу. Сохрани ссылки.\n\n"
        f"# Вопрос\n{query}\n\n# Материалы\n{joined}",
        project, retrieve=False,
    )
    cost += final.cost
    log.emit("research", project=project, query=query[:200], backend=backend,
             pages=len(read), cost=cost)
    return {
        "query": query, "backend": backend, "answer": final.text,
        "sources": [{"title": r["title"], "url": r["url"]} for r in read],
        "cost": round(cost, 5),
    }


def look(image_path: str, question: str = "", project: str = "") -> client.Answer:
    """Показать картинку зрячему аналитику."""
    path = Path(image_path).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"Нет файла {path}")
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    b64 = base64.b64encode(path.read_bytes()).decode()

    role = roles.get("vision")
    prefix = context.stable_prefix(project) + "\n\n---\n\n" if project else ""
    return client.call(
        role.model,
        [
            {"role": "system", "content": role.prompt},
            {"role": "user", "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime};base64,{b64}"}},
                {"type": "text", "content": None,
                 "text": prefix + (question or "Опиши изображение по правилам роли.")},
            ]},
        ],
        role="vision", project=project, thinking=role.thinking,
        max_tokens=role.max_tokens, temperature=role.temperature,
        task=f"[изображение] {question[:150]}",
    )


# Что флот разбирает сам, без внешних конвертеров.
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
TEXT_SUFFIXES = {
    ".md", ".txt", ".json", ".csv", ".log", ".yml", ".yaml", ".xml", ".html",
    ".ts", ".tsx", ".js", ".jsx", ".py", ".sql", ".scss", ".css", ".sh",
}

INTAKE_RULES = (
    "Составь заметку для постоянного контекста проекта.\n"
    "Оставь только то, что пригодится в работе позже: стек, соглашения, принятые решения,\n"
    "имена сущностей и полей, ограничения, цифры.\n"
    "Формат — markdown с заголовками и короткими пунктами, без воды и пересказа очевидного.\n"
    "Не выдумывай: чего в материале нет, того не пиши."
)


def intake(project: str, file_path: str, question: str = "") -> dict:
    """Разобрать материал (скриншот, макет, лог, выгрузку) в черновик заметки контекста.

    Картинку смотрит зрячий агент, текст сжимает condenser — обе роли на GLM и
    стоят ноль, поэтому разбор материалов можно гонять по любой мелочи.
    Заметку функция НЕ сохраняет: сначала её читает человек, потом кладёт в контекст.
    """
    path = Path(file_path).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"Нет файла {path}")

    suffix = path.suffix.lower()
    task = (question.strip() + "\n\n" if question.strip() else "") + INTAKE_RULES

    if suffix in IMAGE_SUFFIXES:
        a = look(str(path), task, project)
        kind = "изображение"
    elif suffix in TEXT_SUFFIXES:
        text = path.read_text(encoding="utf-8", errors="ignore")[:60000]
        a = ask("condenser", f"{task}\n\n# Материал: {path.name}\n\n{text}",
                project, retrieve=False, max_tokens=4000)
        kind = "текст"
    else:
        raise ValueError(
            f"Не умею разбирать {suffix or 'файл без расширения'}. "
            f"Картинки: {', '.join(sorted(IMAGE_SUFFIXES))}. "
            f"Текст: {', '.join(sorted(TEXT_SUFFIXES))}."
        )

    note = (f"# {path.name}\n\n"
            f"_Разобрано {time.strftime('%d.%m.%Y')} · {kind} · {a.model}._\n\n"
            f"{a.text.strip()}\n")
    log.emit("intake", project=project, name=path.name, kind=kind, cost=a.cost)
    return {"kind": kind, "note": note, "model": a.model, "cost": a.cost,
            "source": path.name}
