# файл: backend/fleet/chat.py
"""Общий чат команды: человек, архитектор и агенты пишут в одну ленту.

Написано агентом senior (deepseek-v4-pro) по ТЗ главного архитектора.

Человек видит, кто чем занят, и может позвать конкретного агента упоминанием,
а агент отвечает, видя общий контекст разговора: без общей ленты каждый вызов
живёт сам по себе и спросить «что ты сейчас делаешь» некому.
"""

import json
import re
import time
from pathlib import Path

from . import agents, layout, prompts, team


def path(project: str) -> Path:
    """Файл ленты пространства; пустое имя — общий чат вне проектов."""
    return layout.chat_file(project)


def mentions_of(project: str, text: str) -> list[str]:
    """Упоминания `@имя`, оставляем только роли этого пространства.

    Регистр не важен: человек пишет как удобно, а роль в пространстве одна.
    """
    result: list[str] = []
    known = {role.lower(): role for role in team.of(project).roles}
    for mention in re.findall(r"@([A-Za-z0-9_-]+)", text):
        role = known.get(mention.lower())
        if role is not None and role not in result:
            result.append(role)
    return result


def post(project: str, author: str, text: str, model: str = "", cost: float = 0.0) -> dict:
    """Дописывает сообщение в ленту и возвращает его."""
    message = {
        "ts": time.time(),
        "author": author,
        "text": text,
        "mentions": mentions_of(project, text),
        "model": model,
        "cost": cost,
    }
    with path(project).open("a", encoding="utf-8") as f:
        f.write(json.dumps(message, ensure_ascii=False) + "\n")
    return message


def read(project: str, limit: int = 100, since: float = 0.0) -> list[dict]:
    """Последние сообщения, старые сверху.

    Битые строки пропускаем молча: файл пишется дозаписью и может оборваться
    на середине строки, а падать из-за этого ленте незачем.
    """
    file_path = path(project)
    if not file_path.exists():
        return []
    messages = []
    with file_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            if message.get("ts", 0) >= since:
                messages.append(message)
    return messages[-limit:]


def context(project: str, limit: int = 12) -> str:
    """Хвост переписки одним текстом — его видит отвечающий агент."""
    return "\n\n".join(f"{m['author']}: {m['text']}" for m in read(project, limit=limit))


def answer(project: str, role: str, question: str) -> dict:
    """Просит агента ответить в чат и публикует ответ от его имени."""
    text = prompts.render("chat_answer", context=context(project), question=question)
    response = agents.ask(role, text, project, retrieve=False)
    return post(project, role, response.text, model=response.model, cost=response.cost)
