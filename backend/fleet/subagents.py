"""Субагенты Claude Code из состава команды.

Внешний главный (Claude Code по подписке) может запускать в своём процессе
субагентов — другие модели Anthropic со своим промптом и правами: дешёвого
валидатора, дорогого эксперта на тупики. Claude Code находит их по файлам
`.claude/agents/<имя>.md` в репозитории, где идёт работа. Промпт такой роли
человек правит в дашборде, поэтому файл пишется отсюда при каждом сохранении
состава: копия, которую надо не забыть обновить руками, разошлась бы с
оригиналом на первой же правке.

Файлы ложатся в клон пространства, а не в ~/.claude: команда у каждого
пространства своя, и валидатор фронтенда на React не обязан совпадать с
валидатором фреймворка для LLM. В git клона они не уезжают — путь дописывается
в `.git/info/exclude`: рабочий репозиторий принадлежит проекту, а не нам.

Чужие файлы в `.claude/agents/` не трогаются. Наш опознаётся по метке сразу
после шапки, и только такой переписывается или убирается, когда роль
перестала быть субагентом.
"""

import json
from pathlib import Path

from .config import Role

MARK = "<!-- Сгенерировано AGENT.Dashboard"

# Права роли в дашборде → инструменты Claude Code. Пустой список `tools` в
# шапке Claude Code понимает как «все инструменты», а субагент без чтения
# проекта слеп, поэтому роль без прав получает чтение, а не всё сразу.
CLAUDE_TOOLS: dict[str, tuple[str, ...]] = {
    "read": ("Read", "Grep", "Glob"),
    "files": ("Read", "Grep", "Glob", "Edit", "Write"),
    "web": ("WebFetch", "WebSearch"),
}
DEFAULT_TOOLS = CLAUDE_TOOLS["read"]

# Что Claude Code принимает в поле model субагента. inherit — модель главного.
MODELS: tuple[str, ...] = ("haiku", "sonnet", "opus", "inherit")


def _tools(role: Role) -> list[str]:
    granted = [name for key in role.tools for name in CLAUDE_TOOLS.get(key, ())]
    return list(dict.fromkeys(granted or DEFAULT_TOOLS))


def render(project: str, role: Role) -> str:
    """Файл субагента: шапка для Claude Code, метка и промпт роли.

    Строки шапки пишутся json-строками: это валидный YAML, и двоеточие или
    кавычка в описании роли не сломают разбор.
    """
    description = role.description.strip() or role.title or role.name
    head = "\n".join((
        "---",
        f"name: {role.name}",
        f"description: {json.dumps(description, ensure_ascii=False)}",
        f"model: {role.model or 'inherit'}",
        f"tools: {', '.join(_tools(role))}",
        "---",
    ))
    mark = (f"{MARK} из роли «{role.name}» пространства «{project}». "
            f"Правится в дашборде, ручные правки перезапишутся. -->")
    return f"{head}\n{mark}\n\n{role.prompt.strip()}\n"


def _exclude(root: Path, names: list[str]) -> None:
    """Спрятать файлы от git клона, не трогая его .gitignore.

    `.git` бывает файлом (worktree, submodule) — тогда исключения живут в
    другом месте, и гадать, где именно, дороже, чем оставить файл видимым.
    """
    info = root / ".git" / "info"
    if not (root / ".git").is_dir():
        return
    file = info / "exclude"
    text = file.read_text(encoding="utf-8") if file.exists() else ""
    have = set(text.splitlines())
    fresh = [line for line in (f"/.claude/agents/{name}.md" for name in names)
             if line not in have]
    if not fresh:
        return
    info.mkdir(parents=True, exist_ok=True)
    head = text if not text or text.endswith("\n") else text + "\n"
    file.write_text(head + "\n".join(fresh) + "\n", encoding="utf-8")


def write(project: str, roles: dict[str, Role], repo: str) -> list[str]:
    """Привести `.claude/agents/` клона к составу команды. Возвращает имена записанных.

    Клона на этой машине может не быть (пространство заведено, путь не указан),
    и это не ошибка: файлы появятся, когда путь укажут и состав сохранят снова.
    """
    root = Path(repo).expanduser() if repo else None
    if root is None or not root.is_dir():
        return []
    folder = root / ".claude" / "agents"
    wanted = {r.name: render(project, r) for r in roles.values() if r.subagent}

    if folder.is_dir():
        for file in folder.glob("*.md"):
            if file.stem not in wanted and MARK in file.read_text(encoding="utf-8"):
                file.unlink()

    written: list[str] = []
    for name, text in wanted.items():
        file = folder / f"{name}.md"
        old = file.read_text(encoding="utf-8") if file.exists() else None
        if old is not None and MARK not in old:
            raise ValueError(f"{file} уже есть и написан не дашбордом. "
                             f"Переименуйте ключ роли или уберите файл сами.")
        if old != text:
            folder.mkdir(parents=True, exist_ok=True)
            file.write_text(text, encoding="utf-8")
        written.append(name)
    _exclude(root, written)
    return written


def briefing(project: str, roles: dict[str, Role]) -> str:
    """Кто в комитете и кого звать: раздел брифа для главного.

    Главный-внешний свой промпт иначе не увидит: наш клиент его не вызывает,
    а бриф — первое, что он читает в каждой сессии.
    """
    lead = next((r for r in roles.values() if r.lead and r.external), None)
    subs = [r for r in roles.values() if r.subagent]
    if (lead is None or not lead.prompt.strip()) and not subs:
        return ""
    parts = [f"# Как устроена команда «{project}»"]
    if lead is not None and lead.prompt.strip():
        parts.append(f"Твоя роль — {lead.icon} {lead.title or lead.name}:\n\n"
                     f"{lead.prompt.strip()}")
    if subs:
        lines = [f"- {r.icon} `{r.name}` ({r.model or 'inherit'}) — "
                 f"{r.description or r.title or 'без описания'}" for r in subs]
        parts.append("Субагенты Claude Code — запускаются инструментом Agent по имени, "
                     "через fleet их не вызвать:\n" + "\n".join(lines))
    return "\n\n".join(parts)
