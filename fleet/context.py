"""Контекст-банк проектов — то, чем заменён NotebookLM (у него нет публичного API).

Устройство: data/context/<проект>/*.md, обычные markdown-файлы.
Файл _core.md особенный — он всегда целиком попадает в НЕИЗМЕННЫЙ префикс
промпта. Это не украшение: у DeepSeek префиксный кэш дешевле промаха в 50 раз,
поэтому блок контекста обязан быть побайтово одинаковым от вызова к вызову.
Всё, что зависит от задачи, подмешивается ПОСЛЕ него.
"""

import re
from pathlib import Path

from .config import CONTEXT_DIR, PROJECTS

CORE = "_core.md"


def project_dir(project: str) -> Path:
    if project not in PROJECTS:
        raise KeyError(f"Нет проекта {project!r}. Известны: {', '.join(PROJECTS)}")
    d = CONTEXT_DIR / project
    d.mkdir(parents=True, exist_ok=True)
    return d


def files(project: str) -> list[Path]:
    """Все заметки проекта, _core.md первым, остальные по алфавиту."""
    d = project_dir(project)
    rest = sorted(p for p in d.glob("*.md") if p.name != CORE)
    core = d / CORE
    return ([core] if core.exists() else []) + rest


def stable_prefix(project: str) -> str:
    """Неизменный блок контекста проекта. Обязан быть детерминированным."""
    core = project_dir(project) / CORE
    body = core.read_text(encoding="utf-8").strip() if core.exists() else ""
    header = f"# Контекст проекта: {PROJECTS[project]}"
    if not body:
        return f"{header}\n\n(Постоянный контекст ещё не заполнен — см. {CORE}.)"
    return f"{header}\n\n{body}"


def _score(text: str, terms: list[str]) -> int:
    low = text.lower()
    return sum(low.count(t) for t in terms)


def search(project: str, query: str, limit: int = 4, chunk: int = 1800) -> list[dict]:
    """Поиск по заметкам проекта.

    Намеренно без эмбеддингов: заметок десятки, а не тысячи, и частотный поиск
    по словам тут не хуже, зато не тянет зависимостей и не требует индекса.
    """
    terms = [t for t in re.split(r"\W+", query.lower()) if len(t) > 2]
    if not terms:
        return []
    hits: list[dict] = []
    for path in files(project):
        if path.name == CORE:
            continue  # ядро и так в префиксе, дублировать незачем
        text = path.read_text(encoding="utf-8", errors="ignore")
        # Режем по заголовкам, чтобы вернуть осмысленный кусок, а не обрывок.
        parts = re.split(r"\n(?=#{1,3} )", text) or [text]
        for part in parts:
            s = _score(part, terms)
            if s:
                hits.append({"file": path.name, "score": s, "text": part.strip()[:chunk]})
    hits.sort(key=lambda h: -h["score"])
    return hits[:limit]


def build(project: str, task: str, extra: str = "", retrieve: bool = True) -> str:
    """Полный контекстный блок для промпта: сначала неизменное, потом релевантное."""
    parts = [stable_prefix(project)]
    if retrieve:
        found = search(project, task)
        if found:
            notes = "\n\n".join(f"## Из {h['file']}\n{h['text']}" for h in found)
            parts.append(f"# Относящиеся к задаче заметки проекта\n\n{notes}")
    if extra:
        parts.append(f"# Дополнительные материалы\n\n{extra}")
    return "\n\n---\n\n".join(parts)


def write(project: str, name: str, text: str, append: bool = False) -> Path:
    """Сохранить заметку. Имя без .md — расширение добавится."""
    safe = re.sub(r"[^\w.-]+", "-", name).strip("-") or "note"
    if not safe.endswith(".md"):
        safe += ".md"
    path = project_dir(project) / safe
    if append and path.exists():
        path.write_text(
            path.read_text(encoding="utf-8").rstrip() + "\n\n" + text.strip() + "\n",
            encoding="utf-8",
        )
    else:
        path.write_text(text.strip() + "\n", encoding="utf-8")
    return path


def overview(project: str) -> dict:
    return {
        "project": project,
        "description": PROJECTS[project],
        "files": [
            {"name": p.name, "chars": p.stat().st_size} for p in files(project)
        ],
        "core_chars": len(stable_prefix(project)),
    }
