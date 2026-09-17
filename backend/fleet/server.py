"""MCP-сервер команды: инструменты, которыми главный архитектор (Claude) раздаёт работу агентам.

Экономия токенов держится на одном правиле: объёмные выхлопы уходят в файл,
а в окно Claude возвращается путь и короткая выжимка.
"""

import json
import time
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from . import agents, apply, context, journal, layout, log, migrate, roles, team, usage, web
from .config import ASSIGNMENTS, MODELS, PROJECTS, current_dir, workspace_of

# Единственное, что видит модель-оркестратор до того, как полезет в инструменты:
# клиент вклеивает этот текст в её системный промпт. Поэтому здесь не описание
# сервера, а порядок работы с памятью — иначе о летописи узнаёт только та модель,
# которая случайно прочитала докстринг подходящего инструмента.
INSTRUCTIONS = """Команда агентов проекта и её общая память.

Память команды лежит не в твоём контексте, а в файлах пространства: она
переживает конец сессии и достаётся следующей модели, кто бы ею ни оказался.

Берёшься за работу в проекте — начни с fleet_journal(action="brief"): там где
остановились в прошлый раз, задачи в работе и известные баги. Разведку по
репозиторию начинай только после этого и только если брифа не хватило.

Задачи бери оттуда, а не выводи из истории: доску ведут человек в дашборде и ты
сам — fleet_journal(action="task"|"doing"|"done") и action="bug". Понял, что
делать дальше, — сначала запиши на доску, потом раздавай агентам. Чего на доске
нет, то потеряется вместе с сессией.

Закончил осмысленный кусок — вызови fleet_journal(action="entry", facts="...")
и перечисли голые факты: что просили, что сделано, чем кончилось, что осталось
сломанным. Оформит запись и обновит выжимку летописец — дешёвая модель, твои
токены на это не уходят. Чего нет в летописи, того для следующей сессии не было.

Остальная память проекта — fleet_context: заметки, решения, соглашения.

Пространство не нужно называть словами: оно определяется по рабочему каталогу,
потому что к каждому пространству привязан клон репозитория. Работаешь не из
репозитория проекта — передай project явно.
"""

mcp = FastMCP("fleet", instructions=INSTRUCTIONS)
OUT = layout.OUT

# Порог, после которого ответ агента складывается в файл, а не летит в контекст.
INLINE_LIMIT = 6000


def _space(project: str = "", *, write: bool = False) -> str:
    """Пространство вызова: явно названное либо то, к которому привязан каталог.

    Пустое имя — не «никакой проект», а «тот, в котором работаем»: пространство
    привязано к клону репозитория, и рабочий каталог однозначно на него указывает.
    Запись при несовпадении запрещена: заметки, уехавшие в чужой проект, потом
    приходится вычищать руками, а замечают это не сразу.
    """
    team.sync()
    here = workspace_of(current_dir())
    if not project:
        return here
    if project not in PROJECTS:
        raise ValueError(f"Нет пространства {project!r}. Известны: {', '.join(PROJECTS)}")
    if write and here and here != project:
        raise ValueError(
            f"Рабочий каталог принадлежит пространству {here!r}, а запись идёт в {project!r}. "
            f"Если это правда нужно, смени каталог или отвяжи репозиторий в дашборде."
        )
    return project


def _spill(name: str, text: str) -> str:
    """Кладёт длинный текст в файл, возвращает подсказку со ссылкой."""
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{time.strftime('%Y%m%d-%H%M%S')}-{name}.md"
    path.write_text(text, encoding="utf-8")
    return str(path)


def _maybe_spill(name: str, text: str) -> str:
    if len(text) <= INLINE_LIMIT:
        return text
    path = _spill(name, text)
    return (f"{text[:INLINE_LIMIT]}\n\n"
            f"[…обрезано {len(text) - INLINE_LIMIT} символов]\n"
            f"Полный текст: {path}")


@mcp.tool()
def fleet_ask(role: str, task: str, project: str = "", extra: str = "") -> str:
    """Поручить задачу одному агенту команды.

    role: имя роли из состава команды. Актуальный список с описаниями и
      навыками отдаёт инструмент fleet_roles — состав задаёт человек в
      дашборде, и в коде его нет.
    task: полное ТЗ. Пиши так, чтобы модель поняла без переспрашивания:
      что сделать, где, по каким правилам, что считать готовым.
    project: пространство, чей контекст подмешать. Можно не указывать — тогда
      берётся то, к которому привязан рабочий каталог.
    extra: дополнительные материалы (куски кода, ответы API) — идут в промпт как есть.

    Агенты НЕ пишут в файлы: возвращают код текстом, применяешь его ты.
    """
    a = agents.ask(role, task, _space(project), extra)
    head = (f"[{a.role} · {a.model} · {a.tokens_in}→{a.tokens_out} ток. · "
            f"${a.cost:.5f} · {a.seconds}c]")
    if a.meta.get("substituted"):
        head += f"\n[подмена модели: {a.meta['substituted']}]"
    return f"{head}\n\n{_maybe_spill(a.role, a.text)}"


@mcp.tool()
def fleet_task(role: str, task: str, project: str = "", extra: str = "") -> str:
    """Поручить задачу агенту и сразу применить результат в рабочем дереве.

    Возвращает отчёт о записанных файлах, а не код ответа: токены главного
    архитектора не тратятся на чтение того, что он всё равно не правит руками.
    Подходит для правок в файлах; для вопросов и обсуждений — fleet_ask.

    Агент должен пометить каждый файл строкой-комментарием «# файл: путь»
    (или «// файл: путь») — блоки без пути не записываются.
    """
    space = _space(project, write=True)
    repo = PROJECTS[space].repo if space else ""
    if not repo:
        return ("У пространства не привязан каталог репозитория — применять некуда. "
                "Привяжи его в дашборде, вкладка «Пространства».")

    answer = agents.ask(role, task, space, extra)
    written = apply.write(repo, answer.text)
    summary = (f"[{answer.role} · {answer.model} · "
               f"{answer.tokens_in}→{answer.tokens_out} ток. · "
               f"${answer.cost:.5f} · {answer.seconds}c]")
    lines = [summary, apply.report(written)]
    if not written:
        # Ни одного файла: пусть человек увидит, что модель вообще ответила.
        lines.append(answer.text[:500])
    return "\n".join(lines)


@mcp.tool()
def fleet_council(topic: str, project: str = "", rounds: int = 2) -> str:
    """Собрать совет: один агент предлагает решение, другой его атакует.

    Оппонент из другой семьи моделей, поэтому спорит по существу, а не поддакивает.
    Возвращает позиции сторон — итоговое решение принимаешь ты, а не совет.
    Используй для архитектурных развилок, где ошибка дорого стоит.
    """
    res = agents.council(topic, _space(project), rounds)
    body = "\n\n".join(
        f"### {t['speaker']} ({t['model']})\n{t['text']}" for t in res["transcript"]
    )
    return (f"[совет · {len(res['transcript'])} реплик · ${res['cost']:.5f}]\n\n"
            + _maybe_spill("council", body))


@mcp.tool()
def fleet_batch(tasks: list[str], project: str = "", role: str = "") -> str:
    """Раздать пачку однотипных мелких задач параллельно.

    Пустое имя роли означает «кто умеет писать код» — конкретного исполнителя
    выбирает состав команды, а не этот инструмент. Каждая задача должна быть самостоятельной и полной.
    Результат целиком складывается в файл, в ответ идёт сводка.
    """
    res = agents.batch(tasks, _space(project), role)
    ok = [r for r in res if r["ok"]]
    cost = sum(r.get("cost", 0) for r in ok)
    full = "\n\n".join(
        f"## {r['n']}. {r['task'][:120]}\n"
        + (r["text"] if r["ok"] else f"ОШИБКА: {r['error']}")
        for r in res
    )
    path = _spill("batch", full)
    lines = [f"[{role} ×{len(res)} · успешно {len(ok)} · ${cost:.5f}]",
             f"Полные результаты: {path}", ""]
    for r in res:
        mark = "✓" if r["ok"] else "✗"
        note = f"{len(r['text'])} симв." if r["ok"] else r["error"][:80]
        lines.append(f"{mark} {r['n']}. {r['task'][:90]} — {note}")
    return "\n".join(lines)


@mcp.tool()
def fleet_vision(image_path: str, question: str = "", project: str = "") -> str:
    """Показать картинку зрячему агенту и получить её текстовое описание.

    Для скриншотов, макетов, схем, диаграмм и снимков ошибок. Остальные агенты
    картинок не видят — это единственный способ передать им визуальное.
    """
    a = agents.look(image_path, question, _space(project))
    return (f"[vision · {a.model} · ${a.cost:.5f}]\n\n"
            + _maybe_spill("vision", a.text))


@mcp.tool()
def fleet_research(query: str, project: str = "", pages: int = 3) -> str:
    """Найти в интернете, прочитать источники и вернуть сведённый ответ со ссылками.

    Поиск и чтение делает агент с навыком сжатия, твои токены не тратятся. Если бесплатный поиск недоступен, вернётся
    сообщение об этом — тогда используй свой WebSearch.
    """
    try:
        res = agents.research(query, _space(project), pages)
    except web.SearchUnavailable as exc:
        return f"[поиск недоступен]\n{exc}"
    src = "\n".join(f"- {s['title']}: {s['url']}" for s in res["sources"])
    return (f"[research · {res['backend']} · {len(res['sources'])} источников · "
            f"${res['cost']:.5f}]\n\n{_maybe_spill('research', res['answer'])}\n\n"
            f"## Источники\n{src}")


@mcp.tool()
def fleet_read(url: str, question: str = "", project: str = "") -> str:
    """Прочитать страницу по ссылке и сжать её до выжимки фактов.

    Работает всегда, поисковик не нужен. Основной способ дать команде свежую
    информацию: документация, changelog, issue, RFC. Сжимает агент команды.
    """
    r = agents.read_page(_space(project), url, question)
    return (f"[read · {r['chars']} симв. · ${r['cost']:.5f}]\n\n"
            + _maybe_spill("read", r["summary"]))


@mcp.tool()
def fleet_context(action: str, project: str = "", name: str = "", text: str = "",
                  query: str = "") -> str:
    """Контекст-банк проектов: постоянная память команды между сессиями.

    action:
      list — что лежит в контексте проекта;
      get — прочитать заметку (name);
      search — найти по заметкам (query);
      write — сохранить заметку (name, text), перезаписывает;
      append — дописать в конец заметки (name, text).

    project: можно не указывать — тогда берётся пространство рабочего каталога
      (пространства привязаны к клонам репозиториев в дашборде). Запись в чужое
      пространство из чужого каталога запрещена: так заметки не уезжают в другой проект.

    Заметка _core.md особенная: она всегда целиком уходит в промпт каждого агента.
    Держи в ней стек, соглашения и текущие цели проекта. Решения по ходу работы
    складывай отдельными заметками — так они попадут в промпт только когда нужны.
    """
    if action == "list":
        ov = context.overview(_space(project))
        files = "\n".join(f"- {f['name']} ({f['chars']} б)" for f in ov["files"])
        return f"{ov['description']}\nПостоянный блок: {ov['core_chars']} симв.\n{files or '(пусто)'}"
    if action == "get":
        path = context.project_dir(_space(project)) / (name if name.endswith(".md") else name + ".md")
        if not path.exists():
            return f"Нет заметки {path.name}"
        return _maybe_spill("context", path.read_text(encoding="utf-8"))
    if action == "search":
        hits = context.search(_space(project), query)
        if not hits:
            return "Ничего не найдено"
        return "\n\n".join(f"## {h['file']} (вес {h['score']})\n{h['text']}" for h in hits)
    if action in ("write", "append"):
        path = context.write(_space(project, write=True), name, text, append=(action == "append"))
        return f"Сохранено: {path}"
    return f"Неизвестное действие {action!r}"


@mcp.tool()
def fleet_journal(action: str, facts: str = "", project: str = "", document: str = "",
                  section: str = "") -> str:
    """Летопись проекта: общая память команды между сессиями и моделями.

    Документы лежат в пространстве проекта, а не в чьём-то контексте, поэтому
    их видит и следующая сессия, и агенты: выжимка CONTEXT.md уходит в промпт
    каждого из них.

    action:
      brief — с чего начать сессию: где остановились, задачи, известные баги.
        Читает файлы, модель не зовёт и денег не стоит;
      read — один документ целиком (document: ARCHITECTURE.md, HISTORY.md,
        TASKS.md, BUGS.md, CONTEXT.md);
      entry — дописать в летопись голые факты о сделанном (facts): что просили,
        что сделано, чем кончилось, какие баги остались. Запись оформит и
        выжимку пересоберёт летописец, оформлять руками не нужно;
      refresh — пересобрать выжимку CONTEXT.md по летописи и задачам;
      task — положить задачу (facts) на доску, в раздел «Сделать»;
      doing — перенести задачу в «В работе» (facts — кусок её текста);
      done — перенести задачу в «Готово» (facts — кусок её текста);
      bug — записать баг (facts) в BUGS.md, по умолчанию в «Средние».

    section: раздел доски, если нужен не тот, что по умолчанию: «В работе»,
      «Сделать», «Готово» у задач и «Критические», «Средние», «Мелкие» у багов.

    Доска денег не стоит: её пункт — одна строка, и модель для неё не зовётся.
    Платные здесь только запись в летопись (entry) и выжимка (refresh).
    """
    if action == "brief":
        return _maybe_spill("journal", journal.brief(_space(project)))
    if action == "read":
        text = journal.read(_space(project), document)
        return _maybe_spill("journal", text) if text else f"Нет документа {document!r}"
    if action == "entry":
        if not facts.strip():
            return "Нечего записывать: передай в facts, что было сделано."
        space = _space(project, write=True)
        entry = journal.append_entry(space, facts)
        digest = journal.refresh_context(space)
        return (f"[летопись · {entry['model']} · ${entry['cost'] + digest['cost']:.5f}]\n"
                f"{entry['file']}\n\n{entry['note']}")
    if action == "refresh":
        res = journal.refresh_context(_space(project, write=True))
        return f"[выжимка · {res['model']} · ${res['cost']:.5f}]\n{res['file']}\n\n{res['note']}"
    if action in ("task", "bug", "doing", "done"):
        if not facts.strip():
            return "Нечего записывать: передай текст в facts."
        space = _space(project, write=True)
        try:
            if action == "task":
                where = journal.add_item(space, journal.TASKS, facts, section)
                return f"Задача на доске, раздел «{where}»: {facts.strip()[:120]}"
            if action == "bug":
                where = journal.add_item(space, journal.BUGS, facts, section)
                return f"Баг записан, раздел «{where}»: {facts.strip()[:120]}"
            target = section or ("В работе" if action == "doing" else "Готово")
            moved = journal.move_item(space, journal.TASKS, facts, target)
            return f"Перенесено в «{target}»: {moved[:120]}"
        except (ValueError, LookupError) as exc:
            return f"[не записано] {exc}"
    return f"Неизвестное действие {action!r}"


@mcp.tool()
def fleet_intake(project: str, file_path: str, question: str = "") -> str:
    """Разобрать файл в черновик заметки для контекста проекта.

    Скриншоты, макеты, схемы — читает зрячий агент; логи, выгрузки, csv, json,
    куски кода — сжимает агент с навыком сжатия.
    Заметка НЕ сохраняется сама: прочитай её и положи в контекст через
    fleet_context(action="write"), поправив то, что модель поняла не так.
    """
    try:
        res = agents.intake(_space(project), file_path, question)
    except (FileNotFoundError, ValueError) as exc:
        return f"[не разобрано] {exc}"
    return (f"[intake · {res['kind']} · {res['model']} · ${res['cost']:.5f} · "
            f"{res['source']}]\n\n" + _maybe_spill("intake", res["note"]))


@mcp.tool()
def fleet_roles(project: str = "") -> str:
    """Состав команды пространства: кто есть, на какой модели и что умеет.

    Команда у каждого проекта своя и задаётся человеком в дашборде, поэтому
    единственный честный способ узнать состав — спросить здесь, а не полагаться
    на память. Пространство можно не называть: берётся то, к которому привязан
    рабочий каталог.
    """
    space = _space(project)
    comp = team.of(space)
    lines = []
    for r in roles.all_roles(space):
        marks = [m for m, on in (("главный", r["lead"]), ("заместитель", r["deputy"]),
                                 ("внешний", r["external"])) if on]
        tools = ", ".join(r["tools"]) or "без инструментов"
        tail = f" [{', '.join(marks)}]" if marks else ""
        lines.append(f"{r['icon']} {r['name']} · {r['model']} · {tools}{tail}"
                     f"\n    {r['description']}")
    if comp.role_for:
        lines.append("\nКто чем занят:")
        for key, title in ASSIGNMENTS.items():
            who = comp.role_for.get(key)
            if who:
                lines.append(f"  {title}: {who}")
    return "\n".join(lines) or f"Команда пространства {space!r} пуста — заведите агентов в дашборде."


@mcp.tool()
def fleet_status(project: str = "") -> str:
    """Состояние команды: роли, расходы, остаток на счету провайдера, последние вызовы."""
    t = usage.totals()
    lines = [
        f"Вызовов всего: {t['calls']} (сегодня {t['calls_today']}), ошибок: {t['errors']}",
        f"Потрачено: ${t['cost']:.4f} (сегодня ${t['cost_today']:.4f})",
        f"Токенов: {t['tokens_in']} вход / {t['tokens_out']} выход",
    ]
    try:
        import httpx
        from .config import PROVIDERS
        # Остаток отдаёт не всякий провайдер; спрашиваем тех, у кого есть такой
        # эндпоинт, а какие именно провайдеры заведены — дело человека.
        source = next((p for p in PROVIDERS.values() if p.auth == "bearer" and p.name != "glm"), None)
        if source is None:
            raise RuntimeError("нет провайдера, у которого можно спросить остаток")
        b = httpx.get(f"{source.base_url}/user/balance",
                      headers={"Authorization": f"Bearer {source.api_key}"},
                      timeout=10).json()
        lines.append(f"Остаток у провайдера: ${b['balance_infos'][0]['total_balance']}")
    except Exception as exc:
        lines.append(f"Остаток у провайдера: не получен ({type(exc).__name__})")

    space = _space(project)
    lines.append(f"\nРоли пространства {space or '—'}:")
    for name, r in (team.of(space).roles.items() if space else []):
        model = MODELS.get(r.model)
        # Внешний агент работает на модели вне нашего реестра — это штатно.
        price = ("не в реестре" if model is None
                 else "бесплатно" if model.price_out == 0 else f"${model.price_out}/1M")
        lines.append(f"  {name:11} {r.model:24} {price}")
    if t["by_role"]:
        lines.append("\nРасход по ролям:")
        for name, v in sorted(t["by_role"].items(), key=lambda x: -x[1]["cost"]):
            lines.append(f"  {name:11} {v['calls']:4} вызовов  ${v['cost']:.4f}")
    lines.append("\nПроекты: " + ", ".join(PROJECTS))
    return "\n".join(lines)


def main() -> None:
    # Данные могли приехать с другой машины в прежней раскладке: переносим их
    # до первого обращения к составу команды, иначе сервер увидит пустой флот.
    migrate.run()
    usage.ensure_built()
    mcp.run()


if __name__ == "__main__":
    main()
