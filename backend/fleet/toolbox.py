"""Инструменты агентов: чем модель может действовать, а не только отвечать.

Права выдаёт человек в карточке агента (`Role.tools`), и выдаёт их приложение,
а не промпт: модель получает описания ровно тех функций, что ей разрешены, и
вызвать другую не может — для неё такой функции просто нет.

Работа с репозиторием идёт только внутри клона пространства. Пути приходят из
текста модели, поэтому каждый проходит `apply.safe_path`, запись — ещё и список
расширений `apply.put`. Удаления нет: файл можно перезаписать, но не стереть.
Служебные каталоги (`.git`, зависимости, сборка) и файлы окружения скрыты:
агенту в них делать нечего, а в `.env` лежат ключи.

Правка файла сделана заменой куска (`edit_file`), а не только перезаписью: у
дешёвой модели переписанный целиком файл на тысячу строк — это и токены, и
шанс потерять по дороге то, чего она не заметила.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

from . import apply, web
from .config import PROJECTS, Role

# Сколько раз модель может сходить в инструменты за одну задачу. Потолок нужен,
# чтобы зациклившийся агент не жёг деньги до таймаута.
MAX_STEPS = 24

SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", ".next", "dist",
             "build", ".idea", ".pytest_cache", ".mypy_cache"}
READ_LIMIT = 40000
LIST_LIMIT = 400
GREP_LIMIT = 120

_READ = [
    {"name": "list_dir",
     "description": "Список файлов и папок в каталоге проекта (папки — с «/» на конце).",
     "parameters": {"type": "object", "properties": {
         "path": {"type": "string", "description": "Путь от корня проекта; пусто — корень."},
     }}},
    {"name": "read_file",
     "description": "Прочитать текстовый файл проекта целиком или диапазон строк.",
     "parameters": {"type": "object", "properties": {
         "path": {"type": "string", "description": "Путь от корня проекта."},
         "start": {"type": "integer", "description": "Первая строка, с 1."},
         "end": {"type": "integer", "description": "Последняя строка включительно; 0 — до конца."},
     }, "required": ["path"]}},
    {"name": "grep",
     "description": "Найти строки по регулярному выражению во всех текстовых файлах проекта.",
     "parameters": {"type": "object", "properties": {
         "pattern": {"type": "string", "description": "Регулярное выражение Python."},
         "path": {"type": "string", "description": "Где искать; пусто — весь проект."},
     }, "required": ["pattern"]}},
]

_WRITE = [
    {"name": "write_file",
     "description": "Создать файл или перезаписать его целиком. Для точечной правки — edit_file.",
     "parameters": {"type": "object", "properties": {
         "path": {"type": "string", "description": "Путь от корня проекта."},
         "content": {"type": "string", "description": "Полное новое содержимое файла."},
     }, "required": ["path", "content"]}},
    {"name": "edit_file",
     "description": ("Заменить в файле кусок текста. old должен встречаться в файле ровно "
                     "один раз, с точностью до пробелов и отступов."),
     "parameters": {"type": "object", "properties": {
         "path": {"type": "string", "description": "Путь от корня проекта."},
         "old": {"type": "string", "description": "Заменяемый кусок как есть в файле."},
         "new": {"type": "string", "description": "Чем заменить."},
     }, "required": ["path", "old", "new"]}},
]

_WEB = [
    {"name": "web_search",
     "description": "Поиск в интернете: заголовки, ссылки и короткие выдержки.",
     "parameters": {"type": "object", "properties": {
         "query": {"type": "string"},
     }, "required": ["query"]}},
    {"name": "fetch_page",
     "description": "Скачать страницу по ссылке и вернуть её текст.",
     "parameters": {"type": "object", "properties": {
         "url": {"type": "string"},
     }, "required": ["url"]}},
]


def specs(role: Role) -> list[dict]:
    """Описания функций, разрешённых роли. Запись без чтения не выдаётся."""
    out: list[dict] = []
    if "read" in role.tools or "files" in role.tools:
        out += _READ
    if "files" in role.tools:
        out += _WRITE
    if "web" in role.tools:
        out += _WEB
    return out


def note(role: Role) -> str:
    """Строка для системного промпта: что агент может сделать сам.

    Без неё модель без инструментов обещает «сейчас прочитаю файл», а модель с
    инструментами пересказывает код в ответе вместо того, чтобы его записать.
    """
    can_read = "read" in role.tools or "files" in role.tools
    lines = ["# Твои возможности", ""]
    if can_read:
        lines.append("- Читаешь файлы проекта сам: list_dir, read_file, grep. "
                     "Сначала смотри код, потом делай выводы.")
    else:
        lines.append("- Файлов проекта ты не видишь: работай с тем, что дали в задаче.")
    if "files" in role.tools:
        lines.append("- Правишь файлы проекта сам: edit_file для точечной правки, "
                     "write_file для нового файла. Код в ответе не повторяй — "
                     "перечисли, что и где изменил. Удалять файлы нельзя.")
    else:
        lines.append("- Записывать файлы ты не можешь: код возвращай текстом, "
                     "с путём файла строкой-комментарием «# файл: путь» над блоком.")
    if "web" in role.tools:
        lines.append("- Ищешь в интернете сам: web_search и fetch_page.")
    lines.append("- Не обещай действий, для которых у тебя нет инструмента.")
    return "\n".join(lines)


@dataclass
class Session:
    """Инструменты одной задачи: корень репозитория и что уже записано."""

    project: str
    written: list[dict] = field(default_factory=list)

    @property
    def root(self) -> Path:
        repo = PROJECTS[self.project].repo if self.project in PROJECTS else ""
        if not repo:
            raise ValueError("У пространства не привязан каталог репозитория — "
                             "файлов проекта нет. Привязать его можно в дашборде.")
        return Path(repo)

    def run(self, name: str, args: dict) -> str:
        """Выполнить вызов и вернуть текст для модели. Ошибка — тоже ответ, а не исключение."""
        if "_error" in args:
            return f"Ошибка: {args['_error']}"
        handler = getattr(self, f"_{name}", None)
        if handler is None:
            return f"Ошибка: инструмента {name} нет."
        try:
            return handler(**args)
        except TypeError as exc:
            return f"Ошибка в аргументах {name}: {exc}"
        except Exception as exc:
            return f"Ошибка: {exc}"

    def _path(self, relative: str) -> Path:
        root = self.root
        target = apply.safe_path(root, relative or ".")
        parts = target.relative_to(root.resolve()).parts
        if any(p in SKIP_DIRS for p in parts) or any(p.startswith(".env") for p in parts):
            raise ValueError(f"{relative}: служебный каталог или файл окружения, доступа нет")
        return target

    def _rel(self, path: Path) -> str:
        return path.relative_to(self.root.resolve()).as_posix()

    def _list_dir(self, path: str = "") -> str:
        target = self._path(path)
        if not target.is_dir():
            return f"Ошибка: {path or '.'} — не каталог."
        entries = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name))
        names = [f"{p.name}/" if p.is_dir() else p.name for p in entries
                 if p.name not in SKIP_DIRS and not p.name.startswith(".env")]
        tail = f"\n… и ещё {len(names) - LIST_LIMIT}" if len(names) > LIST_LIMIT else ""
        return "\n".join(names[:LIST_LIMIT]) + tail or "(пусто)"

    def _read_file(self, path: str, start: int = 1, end: int = 0) -> str:
        target = self._path(path)
        if not target.is_file():
            return f"Ошибка: файла {path} нет."
        lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
        first = max(1, start)
        last = len(lines) if end <= 0 else min(end, len(lines))
        body = "\n".join(lines[first - 1:last])
        cut = ""
        if len(body) > READ_LIMIT:
            body = body[:READ_LIMIT]
            cut = f"\n[обрезано: файл длиннее {READ_LIMIT} символов, читай диапазонами строк]"
        return f"[{self._rel(target)}: строки {first}–{last} из {len(lines)}]\n{body}{cut}"

    def _grep(self, pattern: str, path: str = "") -> str:
        regex = re.compile(pattern)
        base = self._path(path)
        files = [base] if base.is_file() else sorted(base.rglob("*"))
        hits: list[str] = []
        for file in files:
            rel = file.relative_to(base if base.is_dir() else base.parent).parts
            if not file.is_file() or any(p in SKIP_DIRS or p.startswith(".env") for p in rel):
                continue
            try:
                text = file.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for n, line in enumerate(text.splitlines(), 1):
                if regex.search(line):
                    hits.append(f"{self._rel(file)}:{n}: {line.strip()[:200]}")
                    if len(hits) >= GREP_LIMIT:
                        return "\n".join(hits) + "\n[совпадений больше — сузь поиск]"
        return "\n".join(hits) or "Совпадений нет."

    def _save(self, path: str, content: str) -> str:
        self._path(path)
        item = apply.put(self.root, path, content)
        if item["action"] == "пропущен":
            return f"Не записано: {item['reason']}"
        self.written.append(item)
        return apply.report([item]).splitlines()[0]

    def _write_file(self, path: str, content: str) -> str:
        return self._save(path, content)

    def _edit_file(self, path: str, old: str, new: str) -> str:
        target = self._path(path)
        if not target.is_file():
            return f"Ошибка: файла {path} нет — новый файл создаётся write_file."
        text = target.read_text(encoding="utf-8")
        count = text.count(old) if old else 0
        if count != 1:
            return (f"Не записано: кусок встречается {count} раз(а), нужен ровно один. "
                    f"Перечитай файл и возьми кусок точнее.")
        return self._save(path, text.replace(old, new, 1))

    def _web_search(self, query: str) -> str:
        results, backend = web.search(query)
        return "\n\n".join(f"{r['title']}\n{r['url']}\n{r['snippet']}" for r in results) + \
            f"\n\n[поиск: {backend}]"

    def _fetch_page(self, url: str) -> str:
        return web.fetch(url, limit=READ_LIMIT)
