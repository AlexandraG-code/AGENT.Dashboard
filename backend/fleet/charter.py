"""Регламенты: общие тексты, которые агенты читают до своей роли.

Промпт роли отвечает на вопрос «кто я и как работаю», а регламент — «как
устроена организация вокруг меня»: какие есть отделы, кто кому подчиняется,
куда идти за результатом, каким уставом всё это накрыто. Такие вещи одинаковы
для целого отдела или всего пространства, и дублировать их в промпт каждого
агента — гарантированный рассинхрон.

Раскладка: карточка документа (название, область) лежит в составе команды
пространства, текст — в `projects/<проект>/charters/<id>.md`. Файлом, потому
что регламент правят и руками, и загрузкой готового устава, а json для страниц
текста не предназначен.
"""

from pathlib import Path

from . import layout, team
from .config import SCOPES, Document

# Порядок склейки: от общего к частному. Он же порядок чтения человеком —
# устав пространства, затем распорядок отдела.
ORDER = ("space", "team")


def path(project: str, doc_id: str) -> Path:
    return layout.charters_dir(project) / f"{doc_id}.md"


def body(project: str, doc_id: str) -> str:
    """Текст регламента. Пустая строка, если карточка есть, а файла ещё нет."""
    file = path(project, doc_id)
    return file.read_text(encoding="utf-8") if file.exists() else ""


def docs(project: str) -> list[Document]:
    """Все карточки регламентов пространства в порядке склейки — для дашборда."""
    return sorted(team.of(project).docs.values(), key=_key)


def applicable(project: str, team_name: str) -> list[Document]:
    """Регламенты, которые читает агент отдела `team_name`, работая в `project`."""
    if not project:
        return []
    return sorted((d for d in team.of(project).docs.values() if _fits(d, team_name)), key=_key)


def save(project: str, doc_id: str, title: str, text: str, scope: str = "space",
         team_name: str = "", order: int | None = None) -> Document:
    """Сохранить карточку и текст регламента."""
    doc = team.set_document(project, doc_id, title, scope=scope, team_name=team_name, order=order)
    path(project, doc.id).write_text(text, encoding="utf-8")
    return doc


def remove(project: str, doc_id: str) -> None:
    """Убрать регламент вместе с текстом."""
    team.delete_document(project, doc_id)
    file = path(project, doc_id)
    if file.exists():
        file.unlink()


def brief(project: str = "", team_name: str = "") -> str:
    """Все подходящие регламенты одним блоком для системного промпта.

    Блок детерминирован: он уходит в кэшируемый префикс, и перестановка
    документов обнуляет попадания кэша у провайдера.
    """
    parts = []
    for doc in applicable(project, team_name):
        text = body(project, doc.id).strip()
        if text:
            parts.append(f"## {doc.title} ({SCOPES.get(doc.scope, doc.scope)})\n\n{text}")
    if not parts:
        return ""
    return "# Регламенты\n\n" + "\n\n".join(parts)


def _key(doc: Document) -> tuple[int, int, str]:
    return (ORDER.index(doc.scope) if doc.scope in ORDER else len(ORDER), doc.order, doc.id)


def _fits(doc: Document, team_name: str) -> bool:
    if doc.scope == "space":
        return True
    if doc.scope == "team":
        # Регламент отдела читают все его агенты; у кого отдела нет, тот его
        # и не читает — приписка к отделу и есть признак подчинения.
        return bool(team_name) and doc.team == team_name
    return False
