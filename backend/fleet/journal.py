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


# Разделы досок. Порядок тот же, что в шаблонах: код кладёт пункт в нужный
# раздел по имени, а не по номеру, — человек волен переставить их местами.
SECTIONS: dict[str, tuple[str, ...]] = {
    TASKS: ("В работе", "Сделать", "Готово"),
    BUGS: ("Критические", "Средние", "Мелкие"),
}
# Куда попадает пункт, если раздел не назвали.
DEFAULT_SECTION = {TASKS: "Сделать", BUGS: "Средние"}


def _split(text: str) -> list[tuple[str, list[str]]]:
    """Документ как список разделов: заголовок второго уровня и его строки.

    Всё, что стоит до первого `## `, попадает в раздел с пустым именем — это
    заголовок документа, и терять его при перезаписи нельзя.
    """
    blocks: list[tuple[str, list[str]]] = [("", [])]
    for line in text.splitlines():
        if line.startswith("## "):
            blocks.append((line[3:].strip(), []))
        else:
            blocks[-1][1].append(line)
    return blocks


def _join(blocks: list[tuple[str, list[str]]]) -> str:
    out: list[str] = []
    for title, lines in blocks:
        if title:
            out.append(f"## {title}")
        out.extend(lines)
    return "\n".join(out).strip() + "\n"


def add_item(project: str, document: str, text: str, section: str = "") -> str:
    """Положить пункт в раздел доски. Возвращает имя раздела.

    Без вызова модели: задача — это одна строка, и платить за её оформление
    нечем. Оформление нужно записи в летописи, где из голых фактов получается
    связный абзац, а доска и так состоит из коротких пунктов.
    """
    ensure(project)
    known = SECTIONS.get(document)
    if known is None:
        raise ValueError(f"У документа {document!r} нет разделов: доски — {', '.join(SECTIONS)}")
    target = section.strip() or DEFAULT_SECTION[document]
    if target not in known:
        raise ValueError(f"Нет раздела {target!r} в {document}. Есть: {', '.join(known)}")

    item = text.strip().replace("\n", " ")
    if not item:
        raise ValueError("Пустой пункт")
    blocks = _split(read(project, document))
    for title, lines in blocks:
        if title != target:
            continue
        # Пункт дописывается в конец раздела, но перед хвостом из пустых строк:
        # иначе между разделами копятся пробелы, и документ расползается.
        end = len(lines)
        while end > 0 and not lines[end - 1].strip():
            end -= 1
        lines.insert(end, f"- {item}")
        context.write(project, document, _join(blocks))
        return target
    raise ValueError(f"В {document} не нашлось раздела «{target}» — поправь документ руками")


def move_item(project: str, document: str, needle: str, section: str) -> str:
    """Перенести пункт доски в другой раздел по куску его текста.

    Поиск по подстроке намеренно: идентификаторов у пунктов нет и заводить их
    незачем — доску читает человек, а не машина. Если совпадений несколько,
    берётся первое сверху, а неоднозначность видна в ответе.
    """
    ensure(project)
    known = SECTIONS.get(document)
    if known is None:
        raise ValueError(f"У документа {document!r} нет разделов: доски — {', '.join(SECTIONS)}")
    if section not in known:
        raise ValueError(f"Нет раздела {section!r} в {document}. Есть: {', '.join(known)}")

    query = needle.strip().lower()
    blocks = _split(read(project, document))
    found = ""
    for title, lines in blocks:
        if title == section:
            continue
        for i, line in enumerate(lines):
            if line.strip().startswith("- ") and query in line.lower():
                found = lines.pop(i).strip()[2:].strip()
                break
        if found:
            break
    if not found:
        raise LookupError(f"В {document} нет пункта со словами {needle!r}")

    context.write(project, document, _join(blocks))
    add_item(project, document, found, section)
    return found


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
