"""MCP-сервер флота: инструменты, которыми главный архитектор (Claude) правит командой.

Экономия токенов держится на одном правиле: объёмные выхлопы уходят в файл,
а в окно Claude возвращается путь и короткая выжимка.
"""

import json
import time
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from . import agents, context, log, roles, web
from .config import DATA, MODELS, PROJECTS, ROLES

mcp = FastMCP("fleet")
OUT = DATA / "out"

# Порог, после которого ответ агента складывается в файл, а не летит в контекст.
INLINE_LIMIT = 6000


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
    """Поручить задачу одному агенту флота.

    role: consultant (второе мнение по архитектуре), senior (сложный код),
      junior (простой код), analyst (логи и данные), condenser (сжать текст),
      opponent (найти дыры в решении).
    task: полное ТЗ. Пиши так, чтобы модель поняла без переспрашивания:
      что сделать, где, по каким правилам, что считать готовым.
    project: biqube | shaks-site | shaks-daylik | shaks-llmframework — подмешивает
      контекст проекта.
    extra: дополнительные материалы (куски кода, ответы API) — идут в промпт как есть.

    Агенты НЕ пишут в файлы: возвращают код текстом, применяешь его ты.
    """
    a = agents.ask(role, task, project, extra)
    head = (f"[{a.role} · {a.model} · {a.tokens_in}→{a.tokens_out} ток. · "
            f"${a.cost:.5f} · {a.seconds}c]")
    if a.meta.get("substituted"):
        head += f"\n[подмена модели: {a.meta['substituted']}]"
    return f"{head}\n\n{_maybe_spill(a.role, a.text)}"


@mcp.tool()
def fleet_council(topic: str, project: str = "", rounds: int = 2) -> str:
    """Собрать совет: консультант предлагает решение, оппонент его атакует.

    Оппонент из другой семьи моделей, поэтому спорит по существу, а не поддакивает.
    Возвращает позиции сторон — итоговое решение принимаешь ты, а не совет.
    Используй для архитектурных развилок, где ошибка дорого стоит.
    """
    res = agents.council(topic, project, rounds)
    body = "\n\n".join(
        f"### {t['speaker']} ({t['model']})\n{t['text']}" for t in res["transcript"]
    )
    return (f"[совет · {len(res['transcript'])} реплик · ${res['cost']:.5f}]\n\n"
            + _maybe_spill("council", body))


@mcp.tool()
def fleet_batch(tasks: list[str], project: str = "", role: str = "junior") -> str:
    """Раздать пачку однотипных мелких задач параллельно.

    У джунов нулевая цена и лимит параллелизма 50, поэтому десять правок разумно
    делать одновременно. Каждая задача должна быть самостоятельной и полной.
    Результат целиком складывается в файл, в ответ идёт сводка.
    """
    res = agents.batch(tasks, project, role)
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
    a = agents.look(image_path, question, project)
    return (f"[vision · {a.model} · ${a.cost:.5f}]\n\n"
            + _maybe_spill("vision", a.text))


@mcp.tool()
def fleet_research(query: str, project: str = "", pages: int = 3) -> str:
    """Найти в интернете, прочитать источники и вернуть сведённый ответ со ссылками.

    Это роль «второго архитектора, который ищет»: поиск и чтение делает GLM,
    твои токены не тратятся. Если бесплатный поиск недоступен, вернётся
    сообщение об этом — тогда используй свой WebSearch.
    """
    try:
        res = agents.research(query, project, pages)
    except web.SearchUnavailable as exc:
        return f"[поиск недоступен]\n{exc}"
    src = "\n".join(f"- {s['title']}: {s['url']}" for s in res["sources"])
    return (f"[research · {res['backend']} · {len(res['sources'])} источников · "
            f"${res['cost']:.5f}]\n\n{_maybe_spill('research', res['answer'])}\n\n"
            f"## Источники\n{src}")


@mcp.tool()
def fleet_read(url: str, question: str = "") -> str:
    """Прочитать страницу по ссылке и сжать её до выжимки фактов.

    Работает всегда, поисковик не нужен. Основной способ дать флоту свежую
    информацию: документация, changelog, issue, RFC. Сжатие делает GLM бесплатно.
    """
    r = agents.read_page(url, question)
    return (f"[read · {r['chars']} симв. · ${r['cost']:.5f}]\n\n"
            + _maybe_spill("read", r["summary"]))


@mcp.tool()
def fleet_context(action: str, project: str, name: str = "", text: str = "",
                  query: str = "") -> str:
    """Контекст-банк проектов: постоянная память флота между сессиями.

    action:
      list — что лежит в контексте проекта;
      get — прочитать заметку (name);
      search — найти по заметкам (query);
      write — сохранить заметку (name, text), перезаписывает;
      append — дописать в конец заметки (name, text).

    Заметка _core.md особенная: она всегда целиком уходит в промпт каждого агента.
    Держи в ней стек, соглашения и текущие цели проекта. Решения по ходу работы
    складывай отдельными заметками — так они попадут в промпт только когда нужны.
    """
    if action == "list":
        ov = context.overview(project)
        files = "\n".join(f"- {f['name']} ({f['chars']} б)" for f in ov["files"])
        return f"{ov['description']}\nПостоянный блок: {ov['core_chars']} симв.\n{files or '(пусто)'}"
    if action == "get":
        path = context.project_dir(project) / (name if name.endswith(".md") else name + ".md")
        if not path.exists():
            return f"Нет заметки {path.name}"
        return _maybe_spill("context", path.read_text(encoding="utf-8"))
    if action == "search":
        hits = context.search(project, query)
        if not hits:
            return "Ничего не найдено"
        return "\n\n".join(f"## {h['file']} (вес {h['score']})\n{h['text']}" for h in hits)
    if action in ("write", "append"):
        path = context.write(project, name, text, append=(action == "append"))
        return f"Сохранено: {path}"
    return f"Неизвестное действие {action!r}"


@mcp.tool()
def fleet_intake(project: str, file_path: str, question: str = "") -> str:
    """Разобрать файл в черновик заметки для контекста проекта.

    Скриншоты, макеты, схемы — читает зрячий агент; логи, выгрузки, csv, json,
    куски кода — сжимает condenser. Обе роли бесплатные.
    Заметка НЕ сохраняется сама: прочитай её и положи в контекст через
    fleet_context(action="write"), поправив то, что модель поняла не так.
    """
    try:
        res = agents.intake(project, file_path, question)
    except (FileNotFoundError, ValueError) as exc:
        return f"[не разобрано] {exc}"
    return (f"[intake · {res['kind']} · {res['model']} · ${res['cost']:.5f} · "
            f"{res['source']}]\n\n" + _maybe_spill("intake", res["note"]))


@mcp.tool()
def fleet_status() -> str:
    """Состояние флота: роли, расходы, остаток на счёте DeepSeek, последние вызовы."""
    t = log.totals()
    lines = [
        f"Вызовов всего: {t['calls']} (за сутки {t['calls_24h']}), ошибок: {t['errors']}",
        f"Потрачено: ${t['cost']:.4f} (за сутки ${t['cost_24h']:.4f})",
        f"Токенов: {t['tokens_in']} вход / {t['tokens_out']} выход",
    ]
    try:
        import httpx
        from .config import DEEPSEEK
        b = httpx.get(f"{DEEPSEEK.base_url}/user/balance",
                      headers={"Authorization": f"Bearer {DEEPSEEK.api_key}"},
                      timeout=10).json()
        lines.append(f"Остаток DeepSeek: ${b['balance_infos'][0]['total_balance']}")
    except Exception as exc:
        lines.append(f"Остаток DeepSeek: не получен ({type(exc).__name__})")

    lines.append("\nРоли:")
    for name, r in ROLES.items():
        price = "бесплатно" if MODELS[r.model].price_out == 0 else f"${MODELS[r.model].price_out}/1M"
        lines.append(f"  {name:11} {r.model:24} {price}")
    if t["by_role"]:
        lines.append("\nРасход по ролям:")
        for name, v in sorted(t["by_role"].items(), key=lambda x: -x[1]["cost"]):
            lines.append(f"  {name:11} {v['calls']:4} вызовов  ${v['cost']:.4f}")
    lines.append("\nПроекты: " + ", ".join(PROJECTS))
    return "\n".join(lines)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
