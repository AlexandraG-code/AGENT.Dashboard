"""Летопись проекта: постоянные документы пространства и их ведение.

главного: `extra` строкой вместо словаря (ask ждёт строку), относительные
импорты как во всём пакете и `retrieve=False` — по летописи искать нечего,
факты приходят в самом запросе.

Летопись нужна, чтобы новая сессия архитектора начиналась с чтения коротких
документов, а не с разведки по всему репозиторию: пять файлов на 2-3 тысячи
токенов вместо обхода всего дерева. Документы живут рядом с остальными
заметками — в `projects/<проект>/context/` — и доступны и команде, и человеку.
"""

import time

from . import agents, context, prompts, roles

ARCHITECTURE = "ARCHITECTURE.md"
HISTORY = "HISTORY.md"
TASKS = "TASKS.md"
BUGS = "BUGS.md"
# Имя выжимки знает контекст-банк: она лежит в его постоянном блоке, и два
# независимых определения имени рано или поздно разъедутся.
CONTEXT = context.DIGEST

TEMPLATES: dict[str, str] = {
    ARCHITECTURE: """# Архитектура

Взгляд с высоты: из чего состоит система и что с чем связано. Подробности —
в коде; здесь то, что редко меняется.

## Сущности

## Связи

## Технологии

## Интеграции
""",
    HISTORY: """# Летопись сессий

Пример записи:

## 2026-01-01 — что сделано
- Архитектор: модель
- Исполнители: модели
- Задача: кратко
- Результат: кратко
- Баги: кратко или «нет»
""",
    TASKS: """# Задачи

## В работе

## Сделать

## Готово
""",
    BUGS: """# Известные баги

## Критические

## Средние

## Мелкие
""",
    CONTEXT: """# Контекст проекта

## Статус

## Последние действия

## Ближайшие цели
""",
}


def ensure(project: str) -> list[str]:
    """Создаёт недостающие документы из шаблонов, возвращает имена созданных.

    Существующие документы не трогаем: шаблон — только для первого запуска,
    дальше их наполняют человек и технический писатель.
    """
    created = []
    directory = context.project_dir(project)
    for name, template in TEMPLATES.items():
        if not (directory / name).exists():
            context.write(project, name, template)
            created.append(name)
    return created


def read(project: str, name: str) -> str:
    """Текст документа или пустая строка, если его ещё нет."""
    path = context.project_dir(project) / name
    return path.read_text(encoding="utf-8") if path.exists() else ""


def brief(project: str) -> str:
    """С чего начинается сессия: где остановились, что в работе, что сломано.

    Собирается чтением файлов, без вызова модели, поэтому её не жалко звать
    в начале каждой сессии. Архитектура и полная летопись сюда не входят: они
    длинные и нужны не всегда, их читают отдельно и по надобности.
    """
    ensure(project)
    parts = [read(project, name).strip() for name in (CONTEXT, TASKS, BUGS)]
    return "\n\n---\n\n".join(part for part in parts if part)


def append_entry(project: str, facts: str, name: str = HISTORY) -> dict:
    """Дописывает запись в летопись руками агента с навыком «ведёт тексты».

    Тот, кто ставит задачу, передаёт голые факты, а формат держит агент с
    навыком «ведёт тексты»: у главного токены дороже всех, и тратить их на
    оформление записи незачем. Дата подставляется здесь — модели её выдумывать
    нельзя.
    """
    today = time.strftime("%Y-%m-%d")
    task = prompts.render("journal_entry", project=project, document=name,
                          today=today, facts=facts)
    answer = agents.ask(roles.need(project, "writer").name, task, project, retrieve=False)
    path = context.write(project, name, answer.text, append=True)
    return {"note": answer.text, "model": answer.model, "cost": answer.cost, "file": str(path)}


def refresh_context(project: str) -> dict:
    """Пересобирает CONTEXT.md — короткую выжимку для начала следующей сессии."""
    task = prompts.render("journal_context", project=project,
                          history=read(project, HISTORY), tasks=read(project, TASKS))
    answer = agents.ask(roles.need(project, "writer").name, task, project, retrieve=False)
    path = context.write(project, CONTEXT, answer.text)
    return {"note": answer.text, "model": answer.model, "cost": answer.cost, "file": str(path)}
